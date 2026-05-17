"""
Ingest LS 2024 AC-segment-wise results into HistoricalResult (year=2024).

Reads parsed JSON from data/eci_2024_ls/parsed/{state}.json (produced by
scripts/parse_2024_ls.py) and inserts one row per (state, ac, party) that
contested any segment in that AC, with the AC-aggregated vote total.

Safety guarantees:
  • INSERTs only — never UPDATEs existing rows, never DELETEs.
  • Idempotent: if year=2024 rows already exist for the state, skip and
    log; pass --replace to wipe + re-insert.
  • Uses the same HistoricalResult schema as 2021 rows (so existing
    queries that read historicalresult continue working unchanged).

Run:
    python scripts/ingest_2024_ls.py
    python scripts/ingest_2024_ls.py --replace      # wipe existing 2024 rows first
    python scripts/ingest_2024_ls.py --db data/election.db.copy
    python scripts/ingest_2024_ls.py --dry-run      # print plan, write nothing
"""
from __future__ import annotations

import argparse
import json
import sqlite3
import sys
from pathlib import Path

PARSED_DIR = Path("data/eci_2024_ls/parsed")
DEFAULT_DB = "data/election.db"

STATES = ["assam", "kerala", "puducherry", "tamil-nadu", "west-bengal"]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default=DEFAULT_DB)
    ap.add_argument("--replace", action="store_true",
                    help="Delete existing year=2024 rows for each state before inserting.")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    con = sqlite3.connect(args.db)
    cur = con.cursor()

    grand_total = 0
    for slug in STATES:
        path = PARSED_DIR / f"{slug}.json"
        if not path.exists():
            print(f"  SKIP {slug}: no parsed JSON at {path}")
            continue
        data = json.loads(path.read_text())

        existing = cur.execute(
            "SELECT COUNT(*) FROM historicalresult WHERE state_slug=? AND year=2024", (slug,)
        ).fetchone()[0]
        if existing and not args.replace:
            print(f"  SKIP {slug}: {existing} year=2024 rows already exist. Use --replace to re-ingest.")
            continue
        if existing and args.replace:
            if not args.dry_run:
                cur.execute("DELETE FROM historicalresult WHERE state_slug=? AND year=2024", (slug,))
            print(f"  WIPE {slug}: deleted {existing} existing year=2024 rows.")

        rows_to_insert = []
        for con_info in data["constituencies"]:
            ac_no = con_info["ac_number"]
            ac_name = con_info["ac_name"]
            for c in con_info["candidates"]:
                rows_to_insert.append((
                    slug,
                    ac_no,
                    ac_name,
                    c["party"],
                    c["votes"],
                    1 if c["is_winner"] else 0,
                    2024,
                    None,  # evm_votes — XLS gives EVM but for the LS24 vs A26 churn we just need the totals
                    None,  # postal_votes
                ))

        if args.dry_run:
            print(f"  DRY {slug}: would insert {len(rows_to_insert)} rows. First row: {rows_to_insert[0] if rows_to_insert else None}")
        else:
            cur.executemany(
                "INSERT INTO historicalresult "
                "(state_slug, ac_number, constituency_name, party, votes, is_winner, year, evm_votes, postal_votes) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                rows_to_insert,
            )
            print(f"  INSERT {slug}: {len(rows_to_insert)} rows.")
        grand_total += len(rows_to_insert)

    if not args.dry_run:
        con.commit()
    con.close()
    print(f"\nDone. Total: {grand_total} rows {'planned' if args.dry_run else 'inserted'}.")


if __name__ == "__main__":
    sys.exit(main() or 0)
