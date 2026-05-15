"""
DRY-RUN scraper that fills missing assets data for winners by parsing MyNeta
candidate-detail pages (the listing-page Total Assets cell is empty for many
candidates, but their detail pages have full Movable+Immovable breakdowns).

Writes to data/election.db.sandbox-* (NOT the live DB). Produces a CSV report
of every candidate it would update so the user can review before applying.

Usage:
    python3 scripts/myneta_detail_dryrun.py
"""
import csv
import glob
import re
import sqlite3
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

sys.path.insert(0, ".")

from curl_cffi import requests as cffi_requests

from backend.scrapers.myneta import (
    STATE_CONFIGS,
    find_best_match,
    get_myneta_id_map,
    _lookup_myneta_id,
    parse_candidate_table,
)

MAX_WORKERS = 6


def parse_detail_assets(html: str) -> dict | None:
    """Return {movable, immovable, total_cr} from a MyNeta candidate-detail page,
    or None if not parsable."""
    text = re.sub(r"<[^>]+>", " ", html.replace("&nbsp;", " "))
    text = re.sub(r"\s+", " ", text)

    def section_total(section_label: str, end_anchors: list[str]) -> float | None:
        m = re.search(section_label, text, re.IGNORECASE)
        if not m:
            return None
        start = m.end()
        end = len(text)
        for anc in end_anchors:
            mm = re.search(anc, text[start : start + 20000], re.IGNORECASE)
            if mm:
                end = min(end, start + mm.start())
        section = text[start:end]
        last_t = None
        for m2 in re.finditer(r"Totals?\s*(?:\(Calculated[^)]*\))?", section, re.IGNORECASE):
            last_t = m2
        if not last_t:
            return None
        rs_values = re.findall(r"Rs\s*([\d,]+)", section[last_t.end() :])
        if not rs_values:
            return None
        return int(rs_values[-1].replace(",", "")) / 1e7

    movable = section_total(r"Movable Assets", [r"Immovable Assets", r"Disclaimer"])
    immovable = section_total(r"Immovable Assets", [r"Details of Liabilities", r"Liabilities\s*:"])
    if movable is None and immovable is None:
        return None
    return {
        "movable": movable,
        "immovable": immovable,
        "total_cr": round((movable or 0) + (immovable or 0), 4),
    }


def find_sandbox_db() -> str:
    sandboxes = sorted(glob.glob("data/election.db.sandbox-*"))
    if not sandboxes:
        raise SystemExit("No sandbox DB found. Run: cp data/election.db data/election.db.sandbox-$(date +%Y%m%d-%H%M%S)")
    return sandboxes[-1]


def process_one(http, slug, state, ac_num, ac_name, db_cand_id, db_name, db_party, id_map):
    """Fetch detail page for one candidate and return (cand_id, total_cr) or None."""
    try:
        myneta_const_id = _lookup_myneta_id(ac_name, id_map)
        if not myneta_const_id:
            return ("skip", "no_myneta_const", None, None, None)
        list_url = f"https://www.myneta.info/{slug}/index.php?action=show_candidates&constituency_id={myneta_const_id}"
        r = http.get(list_url, timeout=20)
        cands = parse_candidate_table(r.text)
        if not cands:
            return ("skip", "empty_listing", None, None, None)
        match = find_best_match({"name": db_name, "party": db_party}, cands)
        if not match or not match.get("myneta_id"):
            return ("skip", "no_candidate_match", None, None, None)
        d = http.get(
            f"https://www.myneta.info/{slug}/candidate.php?candidate_id={match['myneta_id']}",
            timeout=20,
        )
        parsed = parse_detail_assets(d.text)
        if parsed is None:
            return ("skip", "detail_parse_failed", match["name"], None, None)
        return ("fill", None, match["name"], parsed["total_cr"], parsed)
    except Exception as e:
        return ("skip", f"error:{e}", None, None, None)


def run():
    db_path = find_sandbox_db()
    print(f"[dry-run] Using sandbox DB: {db_path}", flush=True)

    con = sqlite3.connect(db_path, timeout=60)
    cur = con.cursor()

    cur.execute("""
        SELECT co.state_slug, co.ac_number, co.name, c.id, c.name, c.party
        FROM candidate c
        JOIN constituency co ON c.constituency_id = co.id
        WHERE c.is_winner = 1 AND c.assets_cr IS NULL
        ORDER BY co.state_slug, co.ac_number
    """)
    targets = cur.fetchall()
    print(f"[dry-run] {len(targets)} winners with NULL assets_cr to attempt", flush=True)

    # Build state-id-maps once
    http = cffi_requests.Session(impersonate="chrome124")
    id_maps = {}
    for state, slug in STATE_CONFIGS.items():
        if any(t[0] == state for t in targets):
            try:
                id_maps[state] = get_myneta_id_map(http, slug)
                print(f"  loaded id_map[{state}]: {len(id_maps[state])} entries", flush=True)
            except Exception as e:
                print(f"  ERROR loading id_map[{state}]: {e}", flush=True)
                id_maps[state] = {}

    # Process in parallel (still respectful)
    results = []
    completed = 0
    t0 = time.time()
    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as ex:
        fut_to_target = {}
        for state, ac_num, ac_name, cand_id, db_name, db_party in targets:
            slug = STATE_CONFIGS[state]
            id_map = id_maps.get(state, {})
            fut = ex.submit(process_one, http, slug, state, ac_num, ac_name, cand_id, db_name, db_party, id_map)
            fut_to_target[fut] = (state, ac_num, ac_name, cand_id, db_name, db_party)
        for fut in as_completed(fut_to_target):
            state, ac_num, ac_name, cand_id, db_name, db_party = fut_to_target[fut]
            outcome, reason, myneta_name, total_cr, breakdown = fut.result()
            results.append({
                "state": state, "ac_number": ac_num, "ac_name": ac_name,
                "cand_id": cand_id, "db_name": db_name, "db_party": db_party,
                "outcome": outcome, "reason": reason,
                "myneta_name": myneta_name, "total_cr": total_cr,
                "movable": breakdown["movable"] if breakdown else None,
                "immovable": breakdown["immovable"] if breakdown else None,
            })
            completed += 1
            if completed % 20 == 0:
                fill_n = sum(1 for r in results if r["outcome"] == "fill")
                elapsed = time.time() - t0
                print(f"  ... {completed}/{len(targets)} done, would-fill={fill_n}, elapsed={elapsed:.0f}s", flush=True)

    # Summary
    fill = [r for r in results if r["outcome"] == "fill"]
    skip = [r for r in results if r["outcome"] == "skip"]
    print("\n" + "=" * 70, flush=True)
    print(f"DRY-RUN SUMMARY (sandbox DB, NO writes to live DB)", flush=True)
    print("=" * 70, flush=True)
    print(f"  Target winners: {len(targets)}", flush=True)
    print(f"  Would fill:     {len(fill)}", flush=True)
    print(f"  Cannot fill:    {len(skip)}", flush=True)
    if skip:
        print("\n  Skip reasons:", flush=True)
        reasons = {}
        for r in skip:
            reasons[r["reason"]] = reasons.get(r["reason"], 0) + 1
        for reason, n in sorted(reasons.items(), key=lambda x: -x[1]):
            print(f"    {reason}: {n}", flush=True)

    # Write CSV
    out_path = "/tmp/myneta_detail_fill_report.csv"
    with open(out_path, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=[
            "state", "ac_number", "ac_name", "cand_id", "db_name", "db_party",
            "outcome", "reason", "myneta_name", "movable", "immovable", "total_cr"
        ])
        w.writeheader()
        for r in results:
            w.writerow(r)
    print(f"\n  Full report: {out_path}", flush=True)
    print(f"  Live DB UNTOUCHED ({db_path} also unchanged — pure read-only).", flush=True)
    con.close()


if __name__ == "__main__":
    run()
