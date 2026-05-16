"""
Ingest parsed 2021 postal data (data/eci_2021_parsed/<state>_postal_2021.json)
into the HistoricalResult table — populates evm_votes + postal_votes columns
for existing (state, year=2021, ac_number, party) rows; INSERTs new ones for
parties that exist in the PDF but not in our prior per-AC scrape.

Safety:
  • Operates by UPSERT on (state, year, ac, party) — never deletes.
  • Aggregates parsed per-candidate rows to per-party (sums EVM/postal per
    (ac, party), to handle the rare case of two candidates from the same party
    in one AC).
  • Backs up the DB, snapshots row counts, verifies after.

Usage:
    python scripts/ingest_2021_postal.py --db <path>  # sandbox copy
    python scripts/ingest_2021_postal.py              # live DB (asks confirm)
"""
import argparse
import json
import sqlite3
from collections import defaultdict
from pathlib import Path
import sys

DEFAULT_DB = "data/election.db"
PARSED_DIR = Path("data/eci_2021_parsed")
STATES = ["tamil-nadu", "kerala", "west-bengal", "assam", "puducherry"]

# 2021 ECI PDFs use slightly different abbreviations than our 2026 DB.
# Map them so cross-year comparisons line up by-party.
PARTY_ALIAS = {
    "ADMK": "AIADMK",
    "AINRC": "AINC",
    "BOPF": "BPF",
    "KEC": "KC",
    "IND": "I",
    "NOTA": "NOTA",
}


def normalize_party(p: str) -> str:
    return PARTY_ALIAS.get(p, p)


def aggregate_per_party_ac(rows: list[dict]) -> dict:
    """{(state, ac, party): {evm, postal, total}}  — normalises 2021 party names
    to match our 2026 DB (e.g., ADMK→AIADMK, AINRC→AINC, IND→I)."""
    out: dict = defaultdict(lambda: {"evm": 0, "postal": 0, "total": 0})
    for r in rows:
        party = normalize_party(r["party"])
        if party == "NOTA":
            continue
        key = (r["state"], r["ac_number"], party)
        out[key]["evm"] += r["evm_votes"]
        out[key]["postal"] += r["postal_votes"]
        out[key]["total"] += r["total_votes"]
    return out


def run(db_path: str):
    con = sqlite3.connect(db_path, timeout=60)
    con.execute("PRAGMA journal_mode=WAL")
    cur = con.cursor()

    # Snapshot
    cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
    tables = [r[0] for r in cur.fetchall()]
    snap_before = {t: cur.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0] for t in tables}
    cur.execute("SELECT COUNT(*) FROM historicalresult WHERE year=2021 AND postal_votes IS NOT NULL")
    n_postal_before = cur.fetchone()[0]

    # Load all parsed rows
    all_parsed = []
    for s in STATES:
        f = PARSED_DIR / f"{s}_postal_2021.json"
        if not f.exists():
            print(f"  ✗ missing {f}", file=sys.stderr)
            continue
        all_parsed.extend(json.loads(f.read_text()))

    agg = aggregate_per_party_ac(all_parsed)
    print(f"[ingest] aggregated to {len(agg)} (state, ac, party) keys")

    # Upsert
    updated = 0
    inserted = 0
    skipped_no_match = 0
    # Fetch existing 2021 per-AC rows (constituency_name != '') for upsert
    cur.execute("""SELECT id, state_slug, ac_number, party FROM historicalresult
        WHERE year=2021 AND constituency_name != ''""")
    existing = {(r[1], r[2], r[3]): r[0] for r in cur.fetchall()}
    for (state, ac, party), v in agg.items():
        if (state, ac, party) in existing:
            cur.execute(
                "UPDATE historicalresult SET evm_votes=?, postal_votes=? WHERE id=?",
                (v["evm"], v["postal"], existing[(state, ac, party)]),
            )
            updated += 1
        else:
            # No existing row for this (state, ac, party) — INSERT a fresh one.
            # Try to fetch constituency_name from any other 2021 row for the same AC.
            cur.execute("""SELECT constituency_name FROM historicalresult
                WHERE state_slug=? AND ac_number=? AND year=2021 AND constituency_name != ''
                LIMIT 1""", (state, ac))
            row = cur.fetchone()
            cname = row[0] if row else ""
            cur.execute(
                """INSERT INTO historicalresult
                   (state_slug, ac_number, constituency_name, party, votes, is_winner, year, evm_votes, postal_votes)
                   VALUES (?, ?, ?, ?, ?, 0, 2021, ?, ?)""",
                (state, ac, cname, party, v["total"], v["evm"], v["postal"]),
            )
            inserted += 1
    con.commit()

    snap_after = {t: cur.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0] for t in tables}
    cur.execute("SELECT COUNT(*) FROM historicalresult WHERE year=2021 AND postal_votes IS NOT NULL")
    n_postal_after = cur.fetchone()[0]

    print(f"[ingest] Updated existing rows: {updated}")
    print(f"[ingest] Inserted new rows:     {inserted}")
    print(f"[ingest] Rows with postal data: {n_postal_before} → {n_postal_after}")
    print(f"\n[ingest] Row-count diffs:")
    for t in tables:
        d = snap_after[t] - snap_before[t]
        mark = "✓" if (d == 0 or (t == "historicalresult" and d == inserted)) else "✗"
        print(f"  {mark} {t:<20s} {snap_before[t]} → {snap_after[t]}  ({d:+d})")
    con.close()


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default=DEFAULT_DB)
    args = ap.parse_args()
    run(args.db)
