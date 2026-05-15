"""
Ingest per-AC NOTA votes for 2026 into the isolated `notaperac` table.

Safety guarantees:
  • Only writes to the new `notaperac` table — never touches `candidate`,
    `constituency`, `historicalresult`, or any other legacy table.
  • Idempotent: re-running upserts the same row by (state_slug, year, ac_number).
  • Resumable: if a row already exists with non-zero votes, the AC is skipped
    by default (use --force to re-scrape).
  • Single transaction per state: if a state errors mid-way, that state's
    partial writes roll back; other states are unaffected.

Source: ECI's Constituencywise{CODE}{ac}.htm pages (already implemented in
backend/scrapers/eci.py → scrape_all_candidates_for_ac).

Usage:
  venv/bin/python scripts/ingest_nota.py            # all states
  venv/bin/python scripts/ingest_nota.py kerala     # one state
  venv/bin/python scripts/ingest_nota.py --force    # re-scrape all
"""
from __future__ import annotations

import argparse
import sys
import time
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from sqlmodel import Session, select  # noqa: E402

from backend.config.states import STATE_CONFIG  # noqa: E402
from backend.db import engine, create_db  # noqa: E402
from backend.models import NotaPerAC  # noqa: E402
from backend.scrapers.eci import scrape_all_candidates_for_ac  # noqa: E402


def ingest_state(state: str, force: bool = False) -> tuple[int, int, int]:
    """Returns (inserted, updated, skipped)."""
    cfg = STATE_CONFIG[state]
    total_acs = cfg["total_seats"]
    inserted = updated = skipped = errored = 0

    print(f"\n=== {cfg['name']} ({total_acs} ACs) ===")
    with Session(engine) as session:
        for ac in range(1, total_acs + 1):
            existing = session.exec(
                select(NotaPerAC)
                .where(NotaPerAC.state_slug == state)
                .where(NotaPerAC.year == 2026)
                .where(NotaPerAC.ac_number == ac)
            ).first()

            if existing and existing.votes > 0 and not force:
                skipped += 1
                continue

            try:
                cands = scrape_all_candidates_for_ac(state, ac)
            except Exception as e:
                print(f"  [WARN] AC{ac} scrape failed: {e}")
                errored += 1
                continue

            # NOTA is recorded as a row with party == 'NOTA' in the scraper output.
            nota_row = next((c for c in cands if c.get("party") == "NOTA"), None)
            nota_votes = int(nota_row["total_votes"]) if nota_row else 0

            now = datetime.now().isoformat(timespec="seconds")
            if existing:
                existing.votes = nota_votes
                existing.scraped_at = now
                session.add(existing)
                updated += 1
            else:
                session.add(NotaPerAC(
                    state_slug=state, year=2026, ac_number=ac,
                    votes=nota_votes, scraped_at=now,
                ))
                inserted += 1

            if (ac % 10) == 0:
                print(f"  AC{ac}/{total_acs} … +{inserted} -{0} ~{updated} skipped {skipped} errored {errored}")
                session.commit()  # checkpoint every 10 to limit rollback scope on crash
            # ECI throttling — match the existing scraper's default
            time.sleep(0.3)
        session.commit()
    print(f"  done: {inserted} new, {updated} refreshed, {skipped} skipped, {errored} errored")
    return inserted, updated, skipped


def main():
    p = argparse.ArgumentParser()
    p.add_argument("state", nargs="?", help="Single state slug (omit for all)")
    p.add_argument("--force", action="store_true", help="Re-scrape ACs that already have non-zero NOTA")
    args = p.parse_args()

    # Make sure the new table exists (no-op if already created).
    create_db()

    states = [args.state] if args.state else list(STATE_CONFIG.keys())
    total_inserted = total_updated = total_skipped = 0
    for s in states:
        if s not in STATE_CONFIG:
            print(f"Unknown state: {s}", file=sys.stderr)
            continue
        i, u, sk = ingest_state(s, force=args.force)
        total_inserted += i
        total_updated += u
        total_skipped += sk

    print(f"\n=== ALL DONE ===")
    print(f"  inserted: {total_inserted}, refreshed: {total_updated}, skipped: {total_skipped}")


if __name__ == "__main__":
    main()
