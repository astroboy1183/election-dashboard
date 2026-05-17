from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select, func
from backend.db import get_session
from backend.models import Candidate, Constituency, LokSabhaSeat, HistoricalResult
from backend.config.states import STATE_CONFIG
from backend.config.alliances import ALLIANCES
from backend._cache import ttl_cache

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
            # Sitting MP from LS 2024 — populated from LokSabhaSeat columns
            # via scripts/ingest_2024_ls_mps.py. Used by the "Who represents
            # you" card and shown in the per-LS-seat detail panel.
            "sitting_mp_2024": {
                "name": ls.mp_2024_name,
                "party": ls.mp_2024_party,
                "party_color": party_map.get(ls.mp_2024_party or "", {}).get("color", "#999"),
                "gender": ls.mp_2024_gender,
                "social_category": ls.mp_2024_category,
                "seat_type": ls.mp_2024_seat_type,
            } if ls.mp_2024_name else None,
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


@router.get("/{state}/ls2024-pc-winners")
@ttl_cache(seconds=600)
def ls2024_pc_winners(state: str, session: Session = Depends(get_session)):
    """
    Actual LS 2024 winner per PC, computed by summing AC-segment votes
    (from historicalresult year=2024) and grouping by the *current 2026
    alliance configuration*. Pairs with /loksabha to power the
    "LS 2024 actual vs Assembly 2026 projection" comparison card on
    Geography → LS tab.

    Using the 2026 alliance mapping (not the 2024-era mapping) is deliberate:
    the question being asked is "if we re-group LS 2024 voters along the
    SAME alliance lines that fought 2026, who would have won each PC?" —
    that's the apples-to-apples comparison against the 2026 projection.
    """
    if state not in STATE_CONFIG:
        raise HTTPException(404, "State not found")

    cfg = ALLIANCES.get(state, {})
    party_map = cfg.get("parties", {})
    alliance_list = cfg.get("alliances", [])
    alliance_meta = {a["id"]: a for a in alliance_list}
    party_alliance: dict[str, str] = {p: m.get("alliance", "others") for p, m in party_map.items()}

    def alliance_of(p: str) -> str:
        return party_alliance.get(p, "others")

    def alliance_name(aid: str) -> str:
        return alliance_meta.get(aid, {}).get("name", aid.title() if aid != "others" else "Others")

    def alliance_color(aid: str) -> str:
        return alliance_meta.get(aid, {}).get("color", "#94a3b8")

    # LS seat lookup
    ls_seats = session.exec(
        select(LokSabhaSeat).where(LokSabhaSeat.state_slug == state)
    ).all()
    ls_by_id = {ls.id: ls for ls in ls_seats}

    # AC → ls_seat_id map (from 2026 Constituency table — LS 2024 used the
    # same boundaries since post-2023 delimitation was in effect for both)
    constituencies = session.exec(
        select(Constituency).where(Constituency.state_slug == state)
    ).all()
    ac_to_ls: dict[int, int] = {c.ac_number: c.ls_seat_id for c in constituencies if c.ls_seat_id is not None}

    # LS 2024 historical rows (one row per state/ac/party with AC-segment-aggregated votes)
    ls24_rows = session.exec(
        select(HistoricalResult)
        .where(HistoricalResult.state_slug == state)
        .where(HistoricalResult.year == 2024)
    ).all()

    # ls_seat_id → {alliance_id → votes}, {party → votes}, {alliance_id → {party → votes}}
    per_pc: dict[int, dict] = {}
    for r in ls24_rows:
        ls_seat_id = ac_to_ls.get(r.ac_number)
        if ls_seat_id is None:
            continue
        bucket = per_pc.setdefault(ls_seat_id, {"alliance_votes": {}, "party_votes": {}, "alliance_parties": {}})
        aid = alliance_of(r.party)
        bucket["alliance_votes"][aid] = bucket["alliance_votes"].get(aid, 0) + r.votes
        bucket["party_votes"][r.party] = bucket["party_votes"].get(r.party, 0) + r.votes
        bucket["alliance_parties"].setdefault(aid, {})
        bucket["alliance_parties"][aid][r.party] = bucket["alliance_parties"][aid].get(r.party, 0) + r.votes

    seats = []
    for ls_seat_id, info in per_pc.items():
        ls = ls_by_id.get(ls_seat_id)
        if ls is None:
            continue
        total_votes = sum(info["alliance_votes"].values())
        if total_votes == 0:
            continue
        sorted_alliances = sorted(info["alliance_votes"].items(), key=lambda x: -x[1])

        # Winner determination: use the ACTUAL ECI-declared LS 2024 MP
        # (whose party we ingested into LokSabhaSeat.mp_2024_party) — NOT
        # the alliance-summed top. Why: alliance composition in LS 2024
        # differed from our current 2026 config. e.g. AIADMK contested
        # LS 2024 alone but is in NDA-TN in 2026 — summing AIADMK + BJP
        # votes can fictionally "win" a seat that INC actually won via
        # the INDIA bloc. Map MP party → 2026 alliance for the comparison.
        actual_mp_party = ls.mp_2024_party
        if actual_mp_party:
            winning_aid = alliance_of(actual_mp_party)
            top_party = actual_mp_party
        else:
            # Fallback (no MP ingested for this seat) — use alliance-sum top
            winning_aid = sorted_alliances[0][0]
            within_fallback = info["alliance_parties"].get(winning_aid, {})
            top_party = max(within_fallback, key=lambda p: within_fallback[p]) if within_fallback else ""

        # Margin: MP's party votes vs runner-up party votes (party-level,
        # not alliance-summed — reflects what the MP actually won by)
        sorted_parties_all = sorted(info["party_votes"].items(), key=lambda x: -x[1])
        mp_party_votes = info["party_votes"].get(top_party, 0) if top_party else 0
        runner_party_votes = next(
            (v for p, v in sorted_parties_all if p != top_party), 0
        )
        winning_votes = mp_party_votes
        # Find the runner-up alliance — the second-place alliance among the
        # alliance-summed totals, just for context
        runner_aid = next((aid for aid, _ in sorted_alliances if aid != winning_aid), None)
        runner_votes = info["alliance_votes"].get(runner_aid, 0) if runner_aid else 0

        # Full alliance breakdown — mirrors /loksabha's projection.alliance_breakdown
        # so the LS24-vs-Projection modal can show both sides equally rich.
        alliance_breakdown = []
        for aid, votes in sorted_alliances:
            within_alliance = info["alliance_parties"].get(aid, {})
            inner_top = max(within_alliance, key=lambda p: within_alliance[p]) if within_alliance else ""
            alliance_breakdown.append({
                "alliance_id": aid,
                "alliance_name": alliance_name(aid),
                "color": alliance_color(aid),
                "votes": votes,
                "vote_share": round(votes / total_votes * 100, 2) if total_votes else 0,
                "top_party": inner_top,
                "top_party_color": party_map.get(inner_top, {}).get("color", "#999"),
                "member_parties": [
                    {"party": p, "votes": v, "color": party_map.get(p, {}).get("color", "#999")}
                    for p, v in sorted(within_alliance.items(), key=lambda x: -x[1])
                ],
            })

        # Party-level breakdown for the same PC
        sorted_parties = sorted(info["party_votes"].items(), key=lambda x: -x[1])
        party_breakdown = [
            {
                "party": p,
                "color": party_map.get(p, {}).get("color", "#999"),
                "alliance_id": alliance_of(p),
                "votes": v,
                "vote_share": round(v / total_votes * 100, 2) if total_votes else 0,
            }
            for p, v in sorted_parties
        ]

        seats.append({
            "ls_seat_id": ls.id,
            "ls_name": ls.name,
            "ls_number": ls.ls_number,
            # Winning alliance = the alliance the actual MP's party belongs
            # to in our 2026 config (NOT the alliance-summed top — see note
            # in computation above)
            "ls2024_alliance_id": winning_aid,
            "ls2024_alliance_name": alliance_name(winning_aid),
            "ls2024_alliance_color": alliance_color(winning_aid),
            "ls2024_alliance_votes": mp_party_votes,
            "ls2024_alliance_share": round(mp_party_votes / total_votes * 100, 2) if total_votes else 0,
            "ls2024_top_party": top_party,
            "ls2024_top_party_color": party_map.get(top_party, {}).get("color", "#999"),
            # Margin: MP's party votes vs the runner-up PARTY (not alliance) —
            # mirrors the headline "MP won by X votes" people see in news.
            "ls2024_margin": mp_party_votes - runner_party_votes,
            "ls2024_runner_alliance_id": runner_aid,
            "ls2024_runner_alliance_name": alliance_name(runner_aid) if runner_aid else "",
            "ls2024_runner_alliance_color": alliance_color(runner_aid) if runner_aid else "#94a3b8",
            "total_votes_ls2024": total_votes,
            # Alliance + party breakdowns are still computed under 2026 lines —
            # shown in the modal as supplementary context ("if we re-grouped").
            "ls2024_alliance_breakdown": alliance_breakdown,
            "ls2024_party_breakdown": party_breakdown,
        })
    seats.sort(key=lambda x: x["ls_number"])

    # Headline tally for LS 2024 (alliance-level + party-level)
    alliance_tally: dict[str, int] = {}
    party_tally: dict[str, int] = {}
    for s in seats:
        alliance_tally[s["ls2024_alliance_id"]] = alliance_tally.get(s["ls2024_alliance_id"], 0) + 1
        party_tally[s["ls2024_top_party"]] = party_tally.get(s["ls2024_top_party"], 0) + 1
    tally_list = [
        {
            "alliance_id": aid,
            "alliance_name": alliance_name(aid),
            "color": alliance_color(aid),
            "seats": s,
        }
        for aid, s in sorted(alliance_tally.items(), key=lambda x: -x[1])
    ]

    return {
        "total_ls_seats": len(seats),
        "tally": tally_list,
        "seats": seats,
    }
