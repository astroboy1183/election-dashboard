"""
Ingest LS 2024 MP names + party + demographic info into LokSabhaSeat.

Reads parsed JSON from data/eci_2024_ls/parsed/mps_{state}.json (produced
by scripts/parse_2024_ls_mps.py) and UPDATEs the LokSabhaSeat row for
each (state_slug, ls_number) with the 2024 sitting MP's details.

Safety guarantees:
  • UPDATEs only — never INSERTs (LokSabhaSeat rows are seeded via seed.py
    at startup), never DELETEs.
  • Adds the new columns if they don't exist yet (idempotent ALTER TABLE).
  • Idempotent — running it twice gives the same DB.
  • Surfaces any (state, ls_number) in the JSON that has no matching
    LokSabhaSeat row, so we know if there's an ECI-vs-our-seed mismatch.

Run:
    python scripts/ingest_2024_ls_mps.py
    python scripts/ingest_2024_ls_mps.py --db data/election.db.copy
    python scripts/ingest_2024_ls_mps.py --dry-run
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

NEW_COLS = [
    ("mp_2024_name",      "TEXT"),
    ("mp_2024_party",     "TEXT"),
    ("mp_2024_gender",    "TEXT"),
    ("mp_2024_category",  "TEXT"),
    ("mp_2024_seat_type", "TEXT"),
]


def ensure_columns(cur: sqlite3.Cursor) -> None:
    """Add the mp_2024_* columns to LokSabhaSeat if they don't already exist."""
    existing = {row[1] for row in cur.execute("PRAGMA table_info(loksabhaseat)")}
    for name, sqltype in NEW_COLS:
        if name not in existing:
            cur.execute(f"ALTER TABLE loksabhaseat ADD COLUMN {name} {sqltype}")
            print(f"  + added column loksabhaseat.{name}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default=DEFAULT_DB)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    con = sqlite3.connect(args.db)
    cur = con.cursor()
    ensure_columns(cur)

    grand_total = 0
    grand_unmatched = 0
    for slug in STATES:
        path = PARSED_DIR / f"mps_{slug}.json"
        if not path.exists():
            print(f"  SKIP {slug}: no parsed JSON at {path}")
            continue
        data = json.loads(path.read_text())

        updated = 0
        unmatched = []
        for mp in data["mps"]:
            ls_number = mp["ls_number"]
            params = (
                mp["mp_name"],
                mp["mp_party"],
                mp["mp_gender"],
                mp["mp_social_category"],
                mp["constituency_type"],
                slug,
                ls_number,
            )
            if args.dry_run:
                # Check if the row exists
                row = cur.execute(
                    "SELECT id FROM loksabhaseat WHERE state_slug=? AND ls_number=?",
                    (slug, ls_number),
                ).fetchone()
                if row:
                    updated += 1
                else:
                    unmatched.append((ls_number, mp["ls_name"]))
            else:
                result = cur.execute(
                    "UPDATE loksabhaseat "
                    "SET mp_2024_name=?, mp_2024_party=?, mp_2024_gender=?, "
                    "    mp_2024_category=?, mp_2024_seat_type=? "
                    "WHERE state_slug=? AND ls_number=?",
                    params,
                )
                if result.rowcount == 0:
                    unmatched.append((ls_number, mp["ls_name"]))
                else:
                    updated += 1

        verb = "would update" if args.dry_run else "updated"
        print(f"  {slug}: {verb} {updated} MPs")
        if unmatched:
            print(f"    ⚠ {len(unmatched)} unmatched (no LokSabhaSeat row): {unmatched[:5]}{'…' if len(unmatched) > 5 else ''}")
            grand_unmatched += len(unmatched)
        grand_total += updated

    if not args.dry_run:
        con.commit()
    con.close()
    print(f"\nDone. Total: {grand_total} MPs {'planned' if args.dry_run else 'updated'}.")
    if grand_unmatched:
        print(f"⚠ {grand_unmatched} MPs across all states had no matching LokSabhaSeat row — check your seed.py.")


if __name__ == "__main__":
    sys.exit(main() or 0)
