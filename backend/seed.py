"""
Run once to scrape all data and populate election.db.
Usage:  python3 backend/seed.py
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlmodel import Session, select
from backend.db import engine, create_db
from backend.models import State, Alliance, Party, Constituency, Candidate, HistoricalResult, LokSabhaSeat
from backend.config.states import STATE_CONFIG
from backend.config.alliances import ALLIANCES
from backend.scrapers.eci import scrape_partywise, scrape_all_winners, scrape_statewise_pages
from backend.scrapers.historical import scrape_historical_partywise
from backend.config.ls_segments import LS_SEGMENTS
from backend.config.districts import AC_DISTRICTS


def seed_all():
    create_db()
    with Session(engine) as session:
        for slug, cfg in STATE_CONFIG.items():
            print(f"\n{'='*50}")
            print(f"Seeding {cfg['name']}")
            print(f"{'='*50}")
            _seed_state(session, slug, cfg)
        session.commit()
        _seed_ls_seats(session)
        _seed_districts(session)
        session.commit()
    print("\nDone. Database populated at data/election.db")


def _seed_state(session: Session, slug: str, cfg: dict):
    alliance_cfg = ALLIANCES.get(slug, {})
    party_map = alliance_cfg.get("parties", {})

    # 1. State row
    if not session.exec(select(State).where(State.slug == slug)).first():
        session.add(State(
            slug=slug, name=cfg["name"], total_seats=cfg["total_seats"],
            majority=cfg["majority"], election_date=cfg["election_date"],
            results_date=cfg["results_date"], ls_seats=cfg["ls_seats"],
            status=cfg["status"],
        ))

    # 2. Alliances & parties
    for a in alliance_cfg.get("alliances", []):
        existing_alliance = session.exec(select(Alliance).where(
            Alliance.state_slug == slug, Alliance.alliance_id == a["id"]
        )).first()
        if not existing_alliance:
            session.add(Alliance(state_slug=slug, alliance_id=a["id"], name=a["name"], color=a["color"]))
    for abbr, p in party_map.items():
        existing_party = session.exec(select(Party).where(
            Party.state_slug == slug, Party.abbreviation == abbr
        )).first()
        if not existing_party:
            session.add(Party(state_slug=slug, abbreviation=abbr, full_name=p["full_name"],
                              alliance_id=p["alliance"], color=p["color"]))

    # 3. Scrape winners (partywisewinresult pages — has votes + margin per winner)
    print("  Scraping winners…")
    try:
        winners = scrape_all_winners(slug)
    except Exception as e:
        print(f"  [WARN] winners scrape failed: {e}")
        winners = []

    # 4. Scrape statewise pages (has runner-up info)
    print("  Scraping constituency list…")
    try:
        statewise = scrape_statewise_pages(slug)
    except Exception as e:
        print(f"  [WARN] statewise scrape failed: {e}")
        statewise = []

    # Merge: use statewise as base, enrich with winner votes from winners list
    winner_votes = {w["ac_number"]: w for w in winners}
    statewise_map = {s["ac_number"]: s for s in statewise}
    all_ac = sorted(set(list(winner_votes.keys()) + list(statewise_map.keys())))

    for ac_no in all_ac:
        sw  = statewise_map.get(ac_no, {})
        win = winner_votes.get(ac_no, {})

        ac_name   = sw.get("ac_name") or win.get("ac_name", f"AC-{ac_no}")
        win_name  = sw.get("winner") or win.get("winner", "")
        win_party = sw.get("winner_party") or win.get("party", "")
        margin    = sw.get("margin") or win.get("margin", 0)
        win_votes = win.get("votes", 0)
        ru_name   = sw.get("runner_up", "")
        ru_party  = sw.get("runner_up_party", "")
        ru_votes  = max(0, win_votes - margin) if win_votes and margin else 0

        existing_constituency = session.exec(select(Constituency).where(
            Constituency.state_slug == slug, Constituency.ac_number == ac_no
        )).first()

        if existing_constituency:
            print(f"  Constituency AC-{ac_no} {ac_name} already exists. Skipping candidates.")
        else:
            c = Constituency(state_slug=slug, ac_number=ac_no, name=ac_name, district="")
            session.add(c)
            session.flush() # Get ID for new constituency

            if win_name:
                session.add(Candidate(
                    constituency_id=c.id, state_slug=slug,
                    name=win_name, party=win_party, votes=win_votes, is_winner=True,
                ))
            if ru_name:
                session.add(Candidate(
                    constituency_id=c.id, state_slug=slug,
                    name=ru_name, party=ru_party, votes=ru_votes, is_winner=False,
                ))

    print(f"  Inserted {len(all_ac)} constituencies")

    # 5. Historical 2021 party-wise
    print("  Scraping historical (2021)…")
    try:
        hist = scrape_historical_partywise(slug)
    except Exception as e:
        print(f"  [WARN] historical scrape failed: {e}")
        hist = []

    for row in hist:
        existing_historical = session.exec(select(HistoricalResult).where(
            HistoricalResult.state_slug == slug,
            HistoricalResult.year == 2021,
            HistoricalResult.party == row.get("party", "")
        )).first()
        if not existing_historical:
            session.add(HistoricalResult(
                state_slug=slug, ac_number=0, constituency_name="",
                party=row.get("party", ""), votes=row.get("votes", 0),
                is_winner=False, year=2021,
            ))
    print(f"  Inserted {len(hist)} historical party rows")


def _seed_ls_seats(session: Session):
    print("\n=== Seeding LS seats ===")
    total = 0
    for state_slug, seats in LS_SEGMENTS.items():
        for seat in seats:
            existing = session.exec(
                select(LokSabhaSeat).where(
                    LokSabhaSeat.state_slug == state_slug,
                    LokSabhaSeat.ls_number == seat["ls_number"],
                )
            ).first()
            if not existing:
                session.add(LokSabhaSeat(
                    state_slug=state_slug,
                    name=seat["name"],
                    ls_number=seat["ls_number"],
                ))
                total += 1
        session.flush()

        # Link constituencies to LS seats
        for seat in seats:
            ls_row = session.exec(
                select(LokSabhaSeat).where(
                    LokSabhaSeat.state_slug == state_slug,
                    LokSabhaSeat.ls_number == seat["ls_number"],
                )
            ).first()
            if not ls_row:
                continue
            for ac_no in seat["ac_numbers"]:
                const = session.exec(
                    select(Constituency).where(
                        Constituency.state_slug == state_slug,
                        Constituency.ac_number == ac_no,
                    )
                ).first()
                if const and const.ls_seat_id is None:
                    const.ls_seat_id = ls_row.id

    print(f"  Inserted {total} new LS seats")


def _seed_districts(session: Session):
    print("\n=== Seeding districts ===")
    updated = 0
    for state_slug, ac_map in AC_DISTRICTS.items():
        for ac_no, district in ac_map.items():
            const = session.exec(
                select(Constituency).where(
                    Constituency.state_slug == state_slug,
                    Constituency.ac_number == ac_no,
                )
            ).first()
            if const and (not const.district or const.district == ""):
                const.district = district
                updated += 1
    print(f"  Updated {updated} constituency districts")


if __name__ == "__main__":
    seed_all()
