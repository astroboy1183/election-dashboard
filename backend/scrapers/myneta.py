"""
Scrapes age, gender, education, occupation, criminal cases, and assets from myneta.info
and updates the Candidate table.

Optimizations:
  - Parallel HTTP fetches (ThreadPoolExecutor, 8 workers)
  - Skip ACs where all candidates already have data
  - Fetch candidate detail pages for gender + occupation (S/o vs D/o/W/o)
  - Flushed stdout for live log visibility
"""
import re
import sqlite3
from concurrent.futures import ThreadPoolExecutor, as_completed
from curl_cffi import requests as cffi_requests

DB_PATH = "data/election.db"
MAX_WORKERS = 8

STATE_CONFIGS = {
    "tamil-nadu":  "TamilNadu2026",
    "kerala":      "Kerala2026",
    "west-bengal": "WestBengal2026",
    "assam":       "Assam2026",
    "puducherry":  "Puducherry2026",
}

PARTY_FULL_TO_ABBR = {
    "tamilaga vettri kazhagam": "TVK",
    "dravida munnetra kazhagam": "DMK",
    "all india anna dravida munnetra kazhagam": "AIADMK",
    "aiadmk": "AIADMK",
    "indian national congress": "INC",
    "bharatiya janata party": "BJP",
    "bjp": "BJP",
    "viduthalai chiruthaigal katchi": "VCK",
    "marumalarchi dravida munnetra kazhagam": "MDMK",
    "communist party of india (marxist)": "CPI(M)",
    "communist party of india": "CPI",
    "indian union muslim league": "IUML",
    "desiya murpokku dravida kazhagam": "DMDK",
    "pattali makkal katchi": "PMK",
    "amma makkal munnetra kazhagam": "AMMK",
    "kerala congress": "KC",
    "revolutionary socialist party": "RSP",
    "revolutionary marxist party of india": "RMPI",
    "kerala congress (jacob)": "KC(J)",
    "cmp kerala social congress": "CMPKSC",
    "all india trinamool congress": "AITC",
    "bharatiya gorkha prajatantrik morcha": "BGPM",
    "all india forward bloc": "AIFB",
    "all india secular front": "AISF",
    "aam janata unnayan party": "AJU",
    "independent": "I",
    "ind": "I",
    "asom gana parishad": "AGP",
    "united people's party liberal": "UPPL",
    "bodoland people's front": "BPF",
    "raijor dal": "RD",
    "all india united democratic front": "AIUDF",
    "all india n.r. congress": "AINC",
    "latchiya jananayaka katchi": "(LJK)",
    "nam makkal katchi": "NMK",
    "naam tamilar katchi": "NMK",
}
_ABBR_SORTED = sorted(PARTY_FULL_TO_ABBR.items(), key=lambda x: len(x[0]), reverse=True)


def log(msg: str):
    print(msg, flush=True)


def normalize_party(party_full: str) -> str:
    low = party_full.lower().strip()
    if low in PARTY_FULL_TO_ABBR:
        return PARTY_FULL_TO_ABBR[low]
    for k, v in _ABBR_SORTED:
        if k in low:
            return v
    return party_full.strip()


def parse_assets_crore(raw: str) -> float | None:
    if not raw:
        return None
    s = raw.replace("&nbsp;", " ").replace("&amp;", "&")
    s = re.sub(r"<[^>]+>", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    m = re.search(r"~\s*([\d,]+)\s*Crore", s, re.IGNORECASE)
    if m:
        return float(m.group(1).replace(",", ""))
    m = re.search(r"~\s*([\d,]+)\s*Lacs?", s, re.IGNORECASE)
    if m:
        return round(float(m.group(1).replace(",", "")) / 100, 4)
    m = re.search(r"Rs\s+([\d,]+)", s)
    if m:
        return round(float(m.group(1).replace(",", "")) / 1e7, 4)
    return None


def parse_candidate_table(html: str) -> list[dict]:
    """Parse the listing-page table.  Adds `myneta_id` (candidate detail URL ID)."""
    candidates = []
    for t in re.findall(r"<table[^>]*>(.*?)</table>", html, re.DOTALL):
        rows = re.findall(r"<tr[^>]*>(.*?)</tr>", t, re.DOTALL)
        if len(rows) < 2:
            continue
        headers = [re.sub(r"<[^>]+>", "", c).strip()
                   for c in re.findall(r"<t[dh][^>]*>(.*?)</t[dh]>", rows[0], re.DOTALL)]
        if "Candidate" not in headers or "Criminal Cases" not in headers:
            continue
        hi = {h: headers.index(h) for h in ("Candidate", "Party", "Criminal Cases",
                                              "Education", "Age", "Total Assets", "Liabilities")}
        for row in rows[1:]:
            # Extract candidate detail ID from the row's first link
            mid = re.search(r"candidate\.php\?candidate_id=(\d+)", row)
            myneta_id = int(mid.group(1)) if mid else None
            cells = [re.sub(r"<[^>]+>", " ", c).strip()
                     for c in re.findall(r"<t[dh][^>]*>(.*?)</t[dh]>", row, re.DOTALL)]
            if len(cells) <= max(hi.values()):
                continue
            name_raw = re.sub(r"\s+", " ", cells[hi["Candidate"]]).strip()
            is_winner = "winner" in name_raw.lower()
            name = re.sub(r"\s*winner\s*", "", name_raw, flags=re.IGNORECASE).strip()
            name = re.sub(r"\s+", " ", name).strip()
            party_raw = cells[hi["Party"]].strip()
            crim_raw = cells[hi["Criminal Cases"]].strip()
            age_raw = cells[hi["Age"]].strip()
            candidates.append({
                "myneta_id": myneta_id,
                "name": name,
                "party": party_raw,
                "party_abbr": normalize_party(party_raw),
                "is_winner": is_winner,
                "criminal_cases": int(crim_raw) if crim_raw.isdigit() else None,
                "education": cells[hi["Education"]].strip() or None,
                "age": int(age_raw) if age_raw.isdigit() else None,
                "assets_cr": parse_assets_crore(cells[hi["Total Assets"]]),
            })
    return candidates


def parse_candidate_detail(html: str) -> dict:
    """Extract self profession and (best-effort) gender from candidate detail page.

    Gender heuristic: MyNeta does NOT expose gender directly. If Spouse Profession
    is 'House Wife' / 'Homemaker' the candidate is male; otherwise we leave it NULL
    rather than guess wrong.
    """
    out = {}

    # Self Profession → occupation
    m = re.search(r"<b>\s*Self\s+Profession:\s*</b>\s*([^<]+)", html, re.IGNORECASE)
    if m:
        prof = re.sub(r"\s+", " ", m.group(1)).strip().rstrip(",.;:")
        if prof and len(prof) < 200:
            out["occupation"] = prof

    # Spouse Profession heuristic for gender
    m = re.search(r"<b>\s*Spouse\s+Profession:\s*</b>\s*([^<]+)", html, re.IGNORECASE)
    if m:
        sp = m.group(1).strip().lower()
        if re.search(r"\b(house\s*wife|home\s*maker|housewife|homemaker)\b", sp):
            out["gender"] = "M"

    return out


def normalize_name(n: str) -> str:
    n = re.sub(r"\b(Dr|Mr|Mrs|Ms|Prof|Adv|Shri|Smt)\.?\b", "", n, flags=re.IGNORECASE)
    n = re.sub(r"[^a-zA-Z\s]", " ", n)
    tokens = n.lower().split()
    return " ".join(sorted(t for t in tokens if len(t) > 1))


def name_similarity(n1: str, n2: str) -> float:
    t1 = set(normalize_name(n1).split())
    t2 = set(normalize_name(n2).split())
    if not t1 or not t2:
        return 0.0
    return len(t1 & t2) / max(len(t1), len(t2))


def find_best_match(db_cand: dict, myneta_cands: list[dict]) -> dict | None:
    party_matches = [c for c in myneta_cands if c["party_abbr"] == db_cand["party"]]
    if len(party_matches) == 1:
        return party_matches[0]
    if len(party_matches) > 1:
        return max(party_matches, key=lambda c: name_similarity(db_cand["name"], c["name"]))
    if myneta_cands:
        best = max(myneta_cands, key=lambda c: name_similarity(db_cand["name"], c["name"]))
        if name_similarity(db_cand["name"], best["name"]) >= 0.5:
            return best
    return None


def _strip_suffix(name: str) -> str:
    return re.sub(r"\s*\((SC|ST|GEN)\)\s*$", "", name).strip()


def _phonetic_key(name: str) -> str:
    n = _strip_suffix(name.upper())
    n = n.replace("ZH", "L")
    n = re.sub(r"([BCDFGHJKLMNPQRSTVWXYZ])H", r"\1", n)
    n = re.sub(r"([BCDFGHJKLMNPQRSTVWXYZ])\1+", r"\1", n)
    n = re.sub(r"Y\b", "I", n)
    return re.sub(r"\s+", " ", n).strip()


def _lookup_myneta_id(const_name: str, id_map: dict[str, int]) -> int | None:
    name_up = const_name.strip().upper()
    if name_up in id_map:
        return id_map[name_up]
    name_bare = _strip_suffix(name_up)
    for key in (name_bare, name_bare + " (SC)", name_bare + " (ST)"):
        if key in id_map:
            return id_map[key]
    for k, v in id_map.items():
        if _strip_suffix(k) == name_bare:
            return v
    db_ph = _phonetic_key(name_up)
    for k, v in id_map.items():
        if _phonetic_key(k) == db_ph:
            return v
    prefix = name_bare[:7]
    if len(prefix) >= 5:
        for k, v in id_map.items():
            k_bare = _strip_suffix(k)
            if k_bare.startswith(prefix) or name_bare.startswith(k_bare[:7]):
                return v
    def bigrams(s: str) -> set:
        s = _phonetic_key(s)
        return {s[i:i+2] for i in range(len(s) - 1)}
    db_bg = bigrams(name_up)
    best_v, best_score = None, 0.0
    for k, v in id_map.items():
        k_bg = bigrams(k)
        if not db_bg or not k_bg:
            continue
        score = len(db_bg & k_bg) / max(len(db_bg), len(k_bg))
        if score > best_score:
            best_score, best_v = score, v
    if best_score >= 0.6:
        return best_v
    return None


def get_myneta_id_map(http, myneta_slug: str) -> dict[str, int]:
    r = http.get(f"https://www.myneta.info/{myneta_slug}/", timeout=20)
    links = re.findall(r"constituency_id=(\d+)\s+title='[^']*'>([^<]+)</a>", r.text)
    return {name.strip().upper(): int(cid) for cid, name in links}


def process_ac(http, myneta_slug, ac_number, const_name,
               myneta_id, db_cands_needing_data, fetch_details_for_gender=True):
    """Fetch listing for one AC and (optionally) candidate detail pages.

    Returns: list of (db_cand_id, updates_dict) for candidates that got data.
    """
    url = (f"https://www.myneta.info/{myneta_slug}/"
           f"index.php?action=show_candidates&constituency_id={myneta_id}")
    try:
        r = http.get(url, timeout=20)
        cands = parse_candidate_table(r.text)
    except Exception as e:
        log(f"  ERROR listing AC{ac_number} {const_name}: {e}")
        return []
    if not cands:
        return []

    updates = []
    for db_cand in db_cands_needing_data:
        match = find_best_match(db_cand, cands)
        if not match:
            continue
        upd = {
            "criminal_cases": match["criminal_cases"],
            "education": match["education"],
            "age": match["age"],
            "assets_cr": match["assets_cr"],
        }
        # Optionally fetch detail page for gender + occupation
        if fetch_details_for_gender and match["myneta_id"]:
            try:
                d = http.get(
                    f"https://www.myneta.info/{myneta_slug}/candidate.php?candidate_id={match['myneta_id']}",
                    timeout=20,
                )
                detail = parse_candidate_detail(d.text)
                if "gender" in detail:
                    upd["gender"] = detail["gender"]
                if "occupation" in detail:
                    upd["occupation"] = detail["occupation"]
            except Exception as e:
                log(f"  WARN detail AC{ac_number} cand={match['myneta_id']}: {e}")
        updates.append((db_cand["id"], upd))
    return updates


def run():
    conn = sqlite3.connect(DB_PATH, timeout=60)
    conn.execute("PRAGMA journal_mode=WAL")
    cur = conn.cursor()
    total_updated = 0

    for state_slug, myneta_slug in STATE_CONFIGS.items():
        log(f"\n=== {state_slug} ===")

        # Build shared HTTP session per state (cookies/connection reuse)
        http = cffi_requests.Session(impersonate="chrome124")
        try:
            id_map = get_myneta_id_map(http, myneta_slug)
        except Exception as e:
            log(f"  ERROR fetching id map: {e}")
            continue
        log(f"  {len(id_map)} constituencies in MyNeta index")

        # Find constituencies that have at least one candidate missing data
        cur.execute(
            """SELECT c.id, c.ac_number, c.name
                 FROM constituency c
                WHERE c.state_slug=?
                  AND EXISTS (
                      SELECT 1 FROM candidate
                       WHERE constituency_id=c.id
                         AND (age IS NULL OR occupation IS NULL)
                  )
                ORDER BY c.ac_number""",
            (state_slug,),
        )
        ac_rows = cur.fetchall()
        log(f"  {len(ac_rows)} ACs have candidates needing data")

        # Prepare per-AC work units
        work = []
        skipped = 0
        for const_id, ac_number, const_name in ac_rows:
            myneta_id = _lookup_myneta_id(const_name, id_map)
            if myneta_id is None:
                skipped += 1
                log(f"  SKIP AC{ac_number} {const_name} (no myneta ID)")
                continue
            cur.execute(
                "SELECT id, name, party FROM candidate "
                "WHERE constituency_id=? AND (age IS NULL OR occupation IS NULL)",
                (const_id,),
            )
            db_cands = [{"id": r[0], "name": r[1], "party": r[2]} for r in cur.fetchall()]
            if db_cands:
                work.append((const_id, ac_number, const_name, myneta_id, db_cands))

        log(f"  Queued {len(work)} ACs, skipped {skipped}")
        state_updated = 0
        completed = 0

        with ThreadPoolExecutor(max_workers=MAX_WORKERS) as ex:
            futures = {}
            for item in work:
                ac_number, const_name, myneta_id, db_cands = item[1], item[2], item[3], item[4]
                fut = ex.submit(process_ac, http, myneta_slug,
                                ac_number, const_name, myneta_id, db_cands)
                futures[fut] = (ac_number, const_name)
            for fut in as_completed(futures):
                ac_number, const_name = futures[fut]
                completed += 1
                try:
                    updates = fut.result()
                except Exception as e:
                    log(f"  ERROR processing AC{ac_number} {const_name}: {e}")
                    continue
                for cand_id, upd in updates:
                    fields = list(upd.keys())
                    set_clause = ", ".join(f"{f}=?" for f in fields)
                    vals = list(upd.values()) + [cand_id]
                    cur.execute(f"UPDATE candidate SET {set_clause} WHERE id=?", vals)
                    state_updated += 1
                if completed % 10 == 0:
                    conn.commit()
                    log(f"  ... {completed}/{len(work)} ACs done, {state_updated} candidates updated")

        conn.commit()
        log(f"  {state_slug} DONE: {state_updated} candidates updated, {skipped} ACs skipped")
        total_updated += state_updated

    conn.close()
    log(f"\nGRAND TOTAL: {total_updated} candidates updated")


if __name__ == "__main__":
    run()
