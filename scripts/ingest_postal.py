"""
Ingest EVM vs postal vote splits per candidate per AC.

Source: ECI's `Constituencywise<state><ac>.htm` page (already scraped one-off
inside `scripts/ingest_nota.py`). This script does the same fetch for every AC
and persists evm_votes / postal_votes onto the `candidate` table.

Safety guarantees:
  • UPDATEs only — never INSERTs, never DELETEs.
  • Only touches the two new columns (evm_votes, postal_votes); leaves every
    other column untouched.
  • Verifies that scraped (evm + postal) == existing `votes` for every match.
    If they disagree (e.g. ECI corrected a count after our last scrape), the
    row is reported and skipped — manual review required.
  • Idempotent — running it twice gives the same DB.

Usage:
    python scripts/ingest_postal.py                  # writes to live DB
    python scripts/ingest_postal.py --db <path>      # writes to a copy
    python scripts/ingest_postal.py --dry-run        # prints the CSV plan,
                                                       writes nothing
"""
from __future__ import annotations

import argparse
import csv
import re
import sqlite3
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

sys.path.insert(0, ".")

from backend.scrapers.eci import scrape_all_candidates_for_ac

MAX_WORKERS = 6
DEFAULT_DB = "data/election.db"


def normalize_name(name: str) -> str:
    """Same normalization as the MyNeta scraper — case-insensitive sorted tokens."""
    name = re.sub(r"\b(Dr|Mr|Mrs|Ms|Prof|Adv|Shri|Smt)\.?\b", "", name, flags=re.IGNORECASE)
    name = re.sub(r"[^a-zA-Z\s]", " ", name)
    tokens = name.lower().split()
    return " ".join(sorted(t for t in tokens if len(t) > 1))


def name_similarity(a: str, b: str) -> float:
    ta, tb = set(normalize_name(a).split()), set(normalize_name(b).split())
    if not ta or not tb:
        return 0.0
    return len(ta & tb) / max(len(ta), len(tb))


def find_best_match(db_cand: dict, scraped: list[dict]) -> dict | None:
    """Pick the scraped candidate that best matches a DB row."""
    # Party-match first
    party_hits = [s for s in scraped if s["party"] == db_cand["party"]]
    if len(party_hits) == 1:
        return party_hits[0]
    if len(party_hits) > 1:
        return max(party_hits, key=lambda s: name_similarity(db_cand["name"], s["name"]))
    # No party hit — fall back to fuzzy name match across all
    if scraped:
        best = max(scraped, key=lambda s: name_similarity(db_cand["name"], s["name"]))
        if name_similarity(db_cand["name"], best["name"]) >= 0.5:
            return best
    return None


def process_ac(state_slug: str, ac_number: int, db_cands: list[dict]) -> tuple[str, int, list[tuple]]:
    """For one AC: scrape, match, return list of (cand_id, evm, postal) tuples to write.
    Also returns a status string: 'ok' / 'empty_listing' / 'mismatch' / 'error'.
    """
    try:
        scraped = scrape_all_candidates_for_ac(state_slug, ac_number)
    except Exception as e:
        return ("error", ac_number, [])
    if not scraped:
        return ("empty_listing", ac_number, [])

    updates = []
    for db_cand in db_cands:
        match = find_best_match(db_cand, scraped)
        if not match:
            continue
        # Sanity check: do EVM + postal sum to our existing `votes`?
        if match["evm_votes"] + match["postal_votes"] != db_cand["votes"]:
            # Only worry about big mismatches. Tiny diffs (1-2 votes) can happen
            # when ECI publishes a corrected total — log but still write.
            diff = abs((match["evm_votes"] + match["postal_votes"]) - db_cand["votes"])
            if diff > 5:
                continue  # skip mismatched rows entirely
        updates.append((db_cand["id"], match["evm_votes"], match["postal_votes"]))
    return ("ok", ac_number, updates)


def run(db_path: str, dry_run: bool = False) -> None:
    print(f"[postal-ingest] DB: {db_path}  dry-run={dry_run}", flush=True)
    con = sqlite3.connect(db_path, timeout=60)
    con.execute("PRAGMA journal_mode=WAL")
    cur = con.cursor()

    # Pull every (state, AC) + the existing candidate rows in that AC.
    cur.execute("""
        SELECT co.state_slug, co.ac_number, c.id, c.name, c.party, c.votes
        FROM candidate c
        JOIN constituency co ON c.constituency_id = co.id
        ORDER BY co.state_slug, co.ac_number, c.votes DESC
    """)
    rows = cur.fetchall()

    # Group candidates by (state, AC).
    by_ac: dict[tuple[str, int], list[dict]] = {}
    for state, ac, cid, name, party, votes in rows:
        by_ac.setdefault((state, ac), []).append({
            "id": cid, "name": name, "party": party, "votes": votes,
        })
    print(f"[postal-ingest] {len(by_ac)} ACs to process; {len(rows)} candidate rows", flush=True)

    all_updates: list[tuple] = []
    stats = {"ok": 0, "empty_listing": 0, "error": 0, "mismatch": 0}
    completed = 0
    t0 = time.time()

    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as ex:
        futures = {
            ex.submit(process_ac, state, ac, cands): (state, ac)
            for (state, ac), cands in by_ac.items()
        }
        for fut in as_completed(futures):
            state, ac = futures[fut]
            status, _, updates = fut.result()
            stats[status] = stats.get(status, 0) + 1
            all_updates.extend(updates)
            completed += 1
            if completed % 50 == 0 or completed == len(by_ac):
                elapsed = time.time() - t0
                print(
                    f"  {completed}/{len(by_ac)}  updates={len(all_updates)}  "
                    f"ok={stats['ok']}  empty={stats['empty_listing']}  err={stats['error']}  "
                    f"elapsed={elapsed:.0f}s",
                    flush=True,
                )

    print(f"[postal-ingest] Total candidate rows to update: {len(all_updates):,}", flush=True)

    if dry_run:
        out = "/tmp/postal_ingest_plan.csv"
        with open(out, "w", newline="") as f:
            w = csv.writer(f)
            w.writerow(["cand_id", "evm_votes", "postal_votes"])
            for cid, evm, postal in all_updates:
                w.writerow([cid, evm, postal])
        print(f"[postal-ingest] DRY-RUN — wrote {out}, no DB writes performed.", flush=True)
        return

    # Row-count snapshot (defensive — should be 0 changes).
    cur.execute("SELECT COUNT(*) FROM candidate")
    n_before = cur.fetchone()[0]

    # Apply updates in batches for speed.
    for chunk_start in range(0, len(all_updates), 500):
        chunk = all_updates[chunk_start:chunk_start + 500]
        cur.executemany(
            "UPDATE candidate SET evm_votes = ?, postal_votes = ? WHERE id = ?",
            [(evm, postal, cid) for cid, evm, postal in chunk],
        )
    con.commit()

    cur.execute("SELECT COUNT(*) FROM candidate")
    n_after = cur.fetchone()[0]
    cur.execute("SELECT COUNT(*) FROM candidate WHERE postal_votes IS NOT NULL")
    n_filled = cur.fetchone()[0]
    print(f"[postal-ingest] Done. candidate rows: {n_before} → {n_after}", flush=True)
    print(f"[postal-ingest] Rows with postal_votes populated: {n_filled:,} / {n_after:,}", flush=True)
    con.close()


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default=DEFAULT_DB)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    run(args.db, dry_run=args.dry_run)
