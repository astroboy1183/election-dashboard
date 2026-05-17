from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import Session, select, func
from backend.db import get_session
from backend.models import Candidate, Constituency, HistoricalResult, LokSabhaSeat
from backend.config.states import STATE_CONFIG
from backend.config.alliances import ALLIANCES

router = APIRouter()


@router.get("/{state}/constituencies")
def list_constituencies(
    state: str,
    district: str = Query(default=None),
    party: str = Query(default=None),
    session: Session = Depends(get_session),
):
    if state not in STATE_CONFIG:
        raise HTTPException(404, "State not found")

    # List ALL constituencies in the state (including those with election pending)
    stmt = select(Constituency).where(Constituency.state_slug == state)
    if district:
        stmt = stmt.where(Constituency.district == district)
    constituencies = session.exec(stmt).all()
    party_map = ALLIANCES.get(state, {}).get("parties", {})

    results = []
    for constituency in constituencies:
        all_candidates = session.exec(
            select(Candidate)
            .where(Candidate.constituency_id == constituency.id)
            .order_by(Candidate.votes.desc())
        ).all()

        winner = next((c for c in all_candidates if c.is_winner), None)
        runner_up = next((c for c in all_candidates if not c.is_winner), None) if winner else None
        total_votes = sum(c.votes for c in all_candidates)
        is_pending = winner is None and total_votes == 0

        # Party filter excludes pending ACs unless caller explicitly asked for "PENDING"
        if party:
            if is_pending:
                if party.upper() != "PENDING":
                    continue
            elif winner is None or winner.party != party:
                continue

        winner_votes = winner.votes if winner else 0
        margin = winner_votes - (runner_up.votes if runner_up else 0)
        vote_share = round(winner_votes / total_votes * 100, 2) if total_votes else 0
        # Margin as % of total polled — a better "how close was this?" indicator
        # than absolute margin (a 5,000-vote margin means very different things
        # in an 80k-vote AC vs a 200k-vote AC).
        margin_pct = round(margin / total_votes * 100, 2) if total_votes else 0
        # Recount eligibility: under Rule 56(C) of the Conduct of Election Rules
        # a recount can typically be sought when margin < ~0.5 % of polled votes.
        # Computed from the RAW fraction so razor-thin margins (e.g. 1 vote /
        # 215k polled = 0.000465%) still register — they would round to 0.00%
        # in `margin_pct` and slip past a `> 0` filter otherwise.
        recount_eligible = (
            margin > 0 and total_votes > 0 and (margin / total_votes) < 0.005
        )

        results.append({
            "ac_number": constituency.ac_number,
            "name": constituency.name,
            "district": constituency.district,
            "winner": winner.name if winner else None,
            "party": winner.party if winner else None,
            "alliance": party_map.get(winner.party, {}).get("alliance", "others") if winner else None,
            "color": party_map.get(winner.party, {}).get("color", "#999") if winner else "#64748b",
            "votes": winner_votes,
            "margin": margin,
            "margin_pct": margin_pct,
            "recount_eligible": recount_eligible,
            "vote_share": vote_share,
            "total_votes": total_votes,
            # Runner-up info — used by the interactive map's hover panel for close-contest context.
            "runner_up": runner_up.name if runner_up else None,
            "runner_up_party": runner_up.party if runner_up else None,
            "runner_up_color": party_map.get(runner_up.party, {}).get("color", "#999") if runner_up else None,
            "runner_up_votes": runner_up.votes if runner_up else 0,
            "status": "pending" if is_pending else "declared",
            "candidate_count": len(all_candidates),
        })

    results.sort(key=lambda x: x["ac_number"])
    return results


@router.get("/{state}/constituency/{ac_number}")
def constituency_detail(
    state: str, ac_number: int, session: Session = Depends(get_session)
):
    if state not in STATE_CONFIG:
        raise HTTPException(404, "State not found")

    constituency = session.exec(
        select(Constituency)
        .where(Constituency.state_slug == state)
        .where(Constituency.ac_number == ac_number)
    ).first()
    if not constituency:
        raise HTTPException(404, "Constituency not found")

    candidates = session.exec(
        select(Candidate)
        .where(Candidate.constituency_id == constituency.id)
        .order_by(Candidate.votes.desc())
    ).all()

    total_votes = sum(c.votes for c in candidates)
    party_map = ALLIANCES.get(state, {}).get("parties", {})

    candidate_list = [
        {
            "name": c.name,
            "party": c.party,
            "color": party_map.get(c.party, {}).get("color", "#999"),
            "votes": c.votes,
            "vote_share": round(c.votes / total_votes * 100, 2) if total_votes else 0,
            "is_winner": c.is_winner,
            "assets_cr": c.assets_cr,
            "criminal_cases": c.criminal_cases,
            "education": c.education,
            "gender": c.gender,
            "age": c.age,
        }
        for c in candidates
    ]

    winner = next((c for c in candidate_list if c["is_winner"]), candidate_list[0] if candidate_list else None)
    runner_up = candidate_list[1] if len(candidate_list) > 1 else None
    margin = (winner["votes"] - runner_up["votes"]) if winner and runner_up else 0

    # Historical comparison — per-AC 2021 rows (constituency_name != "")
    hist = session.exec(
        select(HistoricalResult)
        .where(HistoricalResult.state_slug == state)
        .where(HistoricalResult.ac_number == ac_number)
        .where(HistoricalResult.constituency_name != "")
        .order_by(HistoricalResult.votes.desc())
    ).all()

    # Representation block: who represents the voters of this AC, in both
    # the State Legislative Assembly (MLA = our 2026 winner) and the Lok
    # Sabha (MP = the 2024 winner of the parent LS seat, from LokSabhaSeat).
    # Powers the "Who Represents You" card on ConstituencyDetail.
    ls_seat = None
    if constituency.ls_seat_id:
        ls_seat = session.exec(
            select(LokSabhaSeat).where(LokSabhaSeat.id == constituency.ls_seat_id)
        ).first()

    mla_row = next((c for c in candidates if c.is_winner), None)
    representation = {
        "mla": {
            "name": mla_row.name if mla_row else None,
            "party": mla_row.party if mla_row else None,
            "party_color": party_map.get(mla_row.party, {}).get("color", "#999") if mla_row else None,
            "party_full_name": party_map.get(mla_row.party, {}).get("full_name") if mla_row else None,
            "votes": mla_row.votes if mla_row else 0,
            "vote_share": round(mla_row.votes / total_votes * 100, 2) if mla_row and total_votes else 0,
            "margin": margin,
            "gender": mla_row.gender if mla_row else None,
            "age": mla_row.age if mla_row else None,
            "assets_cr": mla_row.assets_cr if mla_row else None,
            "criminal_cases": mla_row.criminal_cases if mla_row else None,
            "education": mla_row.education if mla_row else None,
            "constituency_name": constituency.name,
            "ac_number": ac_number,
        } if mla_row else None,
        "mp": {
            "name": ls_seat.mp_2024_name,
            "party": ls_seat.mp_2024_party,
            "party_color": party_map.get(ls_seat.mp_2024_party or "", {}).get("color", "#999"),
            "party_full_name": party_map.get(ls_seat.mp_2024_party or "", {}).get("full_name"),
            "gender": ls_seat.mp_2024_gender,
            "social_category": ls_seat.mp_2024_category,
            "seat_type": ls_seat.mp_2024_seat_type,
            "ls_name": ls_seat.name,
            "ls_number": ls_seat.ls_number,
            "elected_year": 2024,
        } if (ls_seat and ls_seat.mp_2024_name) else None,
    }

    return {
        "ac_number": ac_number,
        "name": constituency.name,
        "district": constituency.district,
        "total_votes": total_votes,
        "margin": margin,
        "candidates": candidate_list,
        "historical_2021": [
            {"party": h.party, "votes": h.votes, "is_winner": h.is_winner}
            for h in hist
        ],
        "representation": representation,
    }
