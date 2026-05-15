from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select, func
from backend.db import get_session
from backend.models import Candidate, Constituency, LokSabhaSeat
from backend.config.states import STATE_CONFIG
from backend.config.alliances import ALLIANCES

router = APIRouter()


@router.get("/{state}/loksabha")
def loksabha_projection(state: str, session: Session = Depends(get_session)):
    """
    For each LS seat: aggregate votes by ALLIANCE across all assembly segments
    (since LS elections are fought alliance-vs-alliance, not party-vs-party).
    Winning alliance = highest combined vote total. The "projected winning
    party" within that alliance is its top-vote-getter in that LS seat
    (i.e. the party most likely to carry the alliance's candidacy there).
    """
    if state not in STATE_CONFIG:
        raise HTTPException(404, "State not found")

    cfg = ALLIANCES.get(state, {})
    party_map = cfg.get("parties", {})
    alliance_list = cfg.get("alliances", [])
    alliance_meta = {a["id"]: a for a in alliance_list}
    # Parties without an explicit alliance_id fall into "others"
    party_alliance: dict[str, str] = {p: m.get("alliance", "others") for p, m in party_map.items()}

    def alliance_of(party: str) -> str:
        return party_alliance.get(party, "others")

    def alliance_name(aid: str) -> str:
        return alliance_meta.get(aid, {}).get("name", aid.title() if aid != "others" else "Others")

    def alliance_color(aid: str) -> str:
        return alliance_meta.get(aid, {}).get("color", "#94a3b8")

    ls_seats = session.exec(
        select(LokSabhaSeat).where(LokSabhaSeat.state_slug == state)
    ).all()

    projection = []
    for ls in ls_seats:
        constituencies = session.exec(
            select(Constituency)
            .where(Constituency.state_slug == state)
            .where(Constituency.ls_seat_id == ls.id)
        ).all()

        if not constituencies:
            continue

        # Per-party and per-alliance totals across all segments
        party_votes: dict[str, int] = {}
        alliance_votes: dict[str, int] = {}
        # Top party within each alliance (for labeling the winner)
        alliance_party_votes: dict[str, dict[str, int]] = {}
        segments = []
        pending_count = 0

        for con in constituencies:
            candidates = session.exec(
                select(Candidate)
                .where(Candidate.constituency_id == con.id)
                .order_by(Candidate.votes.desc())
            ).all()
            winner = next((c for c in candidates if c.is_winner), None)
            ac_total = sum(c.votes for c in candidates)
            is_pending = winner is None and ac_total == 0
            if is_pending:
                pending_count += 1

            seg_votes: dict[str, int] = {}
            if not is_pending:
                for cand in candidates:
                    seg_votes[cand.party] = seg_votes.get(cand.party, 0) + cand.votes
                    party_votes[cand.party] = party_votes.get(cand.party, 0) + cand.votes
                    aid = alliance_of(cand.party)
                    alliance_votes[aid] = alliance_votes.get(aid, 0) + cand.votes
                    alliance_party_votes.setdefault(aid, {})
                    alliance_party_votes[aid][cand.party] = alliance_party_votes[aid].get(cand.party, 0) + cand.votes

            segments.append({
                "ac_number": con.ac_number,
                "name": con.name,
                "segment_votes": [
                    {
                        "party": p,
                        "votes": v,
                        "color": party_map.get(p, {}).get("color", "#999"),
                    }
                    for p, v in sorted(seg_votes.items(), key=lambda x: -x[1])
                ],
                "winner": winner.name if winner else "",
                "winner_party": winner.party if winner else "",
                "status": "pending" if is_pending else "declared",
            })

        total_votes = sum(party_votes.values())

        # Alliance-level ranking
        sorted_alliances = sorted(alliance_votes.items(), key=lambda x: -x[1])
        sorted_parties = sorted(party_votes.items(), key=lambda x: -x[1])

        winning_alliance = sorted_alliances[0][0] if sorted_alliances else ""
        # Projected winning party = top vote-getter within the winning alliance
        within = alliance_party_votes.get(winning_alliance, {})
        projected_winner = max(within, key=lambda p: within[p]) if within else (sorted_parties[0][0] if sorted_parties else "")
        projected_winner_votes = within.get(projected_winner, 0)

        # Build alliance breakdown for the detail panel
        alliance_breakdown = []
        for aid, votes in sorted_alliances:
            top_party = max(alliance_party_votes[aid], key=lambda p: alliance_party_votes[aid][p]) if alliance_party_votes.get(aid) else ""
            alliance_breakdown.append({
                "alliance_id": aid,
                "alliance_name": alliance_name(aid),
                "color": alliance_color(aid),
                "votes": votes,
                "vote_share": round(votes / total_votes * 100, 2) if total_votes else 0,
                "top_party": top_party,
                "top_party_color": party_map.get(top_party, {}).get("color", "#999"),
                "member_parties": [
                    {"party": p, "votes": v, "color": party_map.get(p, {}).get("color", "#999")}
                    for p, v in sorted(alliance_party_votes.get(aid, {}).items(), key=lambda x: -x[1])
                ],
            })

        party_breakdown = [
            {
                "party": p,
                "full_name": party_map.get(p, {}).get("full_name", p),
                "color": party_map.get(p, {}).get("color", "#999"),
                "alliance_id": alliance_of(p),
                "alliance_name": alliance_name(alliance_of(p)),
                "votes": v,
                "vote_share": round(v / total_votes * 100, 2) if total_votes else 0,
            }
            for p, v in sorted_parties
        ]

        projection.append({
            "ls_seat_id": ls.id,
            "ls_name": ls.name,
            "ls_number": ls.ls_number,
            "total_segments": len(constituencies),
            "projected_winner": projected_winner,
            "projected_winner_color": party_map.get(projected_winner, {}).get("color", "#999"),
            "projected_winner_votes": projected_winner_votes,
            "projected_winning_alliance_id": winning_alliance,
            "projected_winning_alliance_name": alliance_name(winning_alliance),
            "projected_winning_alliance_color": alliance_color(winning_alliance),
            "projected_winning_alliance_votes": alliance_votes.get(winning_alliance, 0),
            "total_votes": total_votes,
            "alliance_breakdown": alliance_breakdown,
            "party_breakdown": party_breakdown,
            "segments": segments,
        })

    projection.sort(key=lambda x: x["ls_number"])

    # Alliance-level tally
    alliance_tally: dict[str, int] = {}
    # Party tally kept for legacy / supplementary display
    party_tally: dict[str, int] = {}
    for seat in projection:
        aid = seat["projected_winning_alliance_id"]
        alliance_tally[aid] = alliance_tally.get(aid, 0) + 1
        party_tally[seat["projected_winner"]] = party_tally.get(seat["projected_winner"], 0) + 1

    tally_list = [
        {
            "alliance_id": aid,
            "alliance_name": alliance_name(aid),
            "color": alliance_color(aid),
            "seats": s,
        }
        for aid, s in sorted(alliance_tally.items(), key=lambda x: -x[1])
    ]

    party_tally_list = [
        {
            "party": p,
            "full_name": party_map.get(p, {}).get("full_name", p),
            "color": party_map.get(p, {}).get("color", "#999"),
            "alliance_id": alliance_of(p),
            "seats": s,
        }
        for p, s in sorted(party_tally.items(), key=lambda x: -x[1])
    ]

    return {
        "total_ls_seats": len(projection),
        "tally": tally_list,             # NOW alliance-level
        "party_tally": party_tally_list, # Supplementary (within-alliance top-party tally)
        "seats": projection,
    }
