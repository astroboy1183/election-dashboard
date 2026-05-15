from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import Session, select, func
from sqlalchemy import Integer
from backend.db import get_session
from backend.models import Candidate, Constituency, HistoricalResult
from backend.config.states import STATE_CONFIG
from backend.config.alliances import ALLIANCES

router = APIRouter()


@router.get("/{state}/swing")
def swing_analysis(state: str, session: Session = Depends(get_session)):
    if state not in STATE_CONFIG:
        raise HTTPException(404, "State not found")

    party_map = ALLIANCES.get(state, {}).get("parties", {})

    # 2026 totals — vote shares derived from the per-AC Candidate table (true
    # per-party breakdown), NOT from the ECI voteshareresult page. The ECI page
    # bundles smaller parties (e.g. PMK, AMMK in TN; RD in Assam; LJK in Pondy)
    # into an "OTHERS" row, which would silently leave them at 0% share and
    # undercount the alliances they belong to. The Candidate table is authoritative
    # for parties; we still pull NOTA from the ECI aggregate (no candidate rows
    # exist for NOTA) so the denominator stays accurate.
    eci_2026 = session.exec(
        select(HistoricalResult.party, HistoricalResult.votes)
        .where(HistoricalResult.state_slug == state)
        .where(HistoricalResult.year == 2026)
        .where(HistoricalResult.constituency_name == "ECI_AGGREGATE")
    ).all()
    nota_2026 = next((r.votes for r in eci_2026 if r.party == "NOTA"), 0)

    winners_2026 = session.exec(
        select(Candidate.party, func.count(Candidate.id).label("seats"))
        .join(Constituency, Constituency.id == Candidate.constituency_id)
        .where(Constituency.state_slug == state)
        .where(Candidate.is_winner == True)
        .group_by(Candidate.party)
    ).all()
    seats_2026 = {r.party: r.seats for r in winners_2026}

    # Per-party vote totals — hybrid strategy that aligns the dashboard exactly
    # with ECI's published voteshareresult page:
    #   1. For parties ECI lists individually, use ECI's number verbatim
    #      (so TVK matches ECI's 17,226,209, not our slightly-different Candidate sum).
    #   2. For parties ECI buckets into OTHERS, use a dedup'd Candidate sum
    #      (MAX votes per party-AC, so duplicate scraper rows don't inflate totals).
    #   3. Residual OTHERS = ECI_OTHERS − sum(parties broken out from step 2),
    #      clamped to 0. This catches micro-parties we don't have specific data for.
    #   4. NOTA pulled from ECI as before (no candidate rows for NOTA).
    # Net effect: every party that ECI publishes matches it exactly, and the
    # denominator is identical to ECI's official total polled.
    from types import SimpleNamespace
    top_per_party_ac = session.exec(
        select(Candidate.party, Candidate.constituency_id, func.max(Candidate.votes).label("v"))
        .join(Constituency, Constituency.id == Candidate.constituency_id)
        .where(Constituency.state_slug == state)
        .group_by(Candidate.party, Candidate.constituency_id)
    ).all()
    candidate_totals: dict[str, int] = {}
    for r in top_per_party_ac:
        candidate_totals[r.party] = candidate_totals.get(r.party, 0) + (r.v or 0)

    # ECI per-party totals (excluding NOTA and OTHERS — handled separately)
    eci_party_totals: dict[str, int] = {}
    eci_others = 0
    for r in eci_2026:
        if r.party == "NOTA":
            continue
        if r.party == "OTHERS":
            eci_others = r.votes or 0
            continue
        eci_party_totals[r.party] = r.votes

    # Aliases — same party, different abbreviation in ECI vs our DB
    ECI_TO_DB_ALIAS = {
        "AAAP": "AAP",
        "CPI(ML)(L)": "CPI(L)",
        "AIMIM": "AIMM",
        "NPEP": "NPP",
        "RASLJP": "RLJP",
    }
    eci_party_totals = {ECI_TO_DB_ALIAS.get(p, p): v for p, v in eci_party_totals.items()}

    party_totals_dict: dict[str, int] = {}
    # 1. Trust ECI for every party it lists individually
    for p, v in eci_party_totals.items():
        party_totals_dict[p] = v
    # 2. Add parties NOT in ECI (i.e., bundled in OTHERS) using Candidate totals
    broken_out_sum = 0
    for p, v in candidate_totals.items():
        if p not in eci_party_totals:
            party_totals_dict[p] = v
            broken_out_sum += v
    # 3. Residual OTHERS — what's left of ECI's OTHERS bucket after the breakouts
    if eci_others > 0:
        residual = max(0, eci_others - broken_out_sum)
        if residual > 0:
            party_totals_dict["OTHERS"] = residual

    party_totals_2026 = [SimpleNamespace(party=p, total_votes=v) for p, v in party_totals_dict.items()]

    # If the state's config declares an alliance for winning independents
    # (e.g. Kerala's 4 IND winners are UDF-aligned), split "I" into:
    #   "I"     — losing independents (stays in default "others" alliance)
    #   "IND-W" — winning independents, mapped to the configured alliance
    win_ind_alliance = ALLIANCES.get(state, {}).get("winning_independents_alliance")
    if win_ind_alliance:
        ind_win_row = session.exec(
            select(
                func.sum(Candidate.votes).label("votes"),
                func.count(Candidate.id).label("seats"),
            )
            .join(Constituency, Constituency.id == Candidate.constituency_id)
            .where(Constituency.state_slug == state)
            .where(Candidate.party == "I")
            .where(Candidate.is_winner == True)
        ).first()
        win_votes = (ind_win_row.votes or 0) if ind_win_row else 0
        win_seats = (ind_win_row.seats or 0) if ind_win_row else 0
        if win_votes > 0:
            # Use a lightweight namespace so the rest of the code can keep treating
            # entries as `.party` / `.total_votes` regardless of source.
            from types import SimpleNamespace
            split_totals = []
            for r in party_totals_2026:
                if r.party == "I":
                    remainder = (r.total_votes or 0) - win_votes
                    if remainder > 0:
                        split_totals.append(SimpleNamespace(party="I", total_votes=remainder))
                else:
                    split_totals.append(r)
            split_totals.append(SimpleNamespace(party="IND-W", total_votes=win_votes))
            party_totals_2026 = split_totals
            if win_seats > 0:
                seats_2026["I"] = max(0, seats_2026.get("I", 0) - win_seats)
                if seats_2026["I"] == 0:
                    seats_2026.pop("I", None)
                seats_2026["IND-W"] = seats_2026.get("IND-W", 0) + win_seats

    total_party_votes_2026 = sum(r.total_votes for r in party_totals_2026)
    # Denominator matches ECI: party totals + NOTA. (ECI's "OTHERS" bundle is
    # already represented by the individual small-party rows here, so don't
    # add it back or we'd double-count.)
    denom_2026 = total_party_votes_2026 + nota_2026

    votes_2026: dict[str, dict] = {}
    for r in party_totals_2026:
        votes_2026[r.party] = {
            "votes": r.total_votes,
            "share": round(r.total_votes / denom_2026 * 100, 2) if denom_2026 else 0,
            "seats": seats_2026.get(r.party, 0),
        }
    if nota_2026 > 0:
        votes_2026["NOTA"] = {
            "votes": nota_2026,
            "share": round(nota_2026 / denom_2026 * 100, 2) if denom_2026 else 0,
            "seats": 0,
        }
    # Safety net: any party with seats but no candidate votes (shouldn't happen)
    for party, seats in seats_2026.items():
        if party not in votes_2026:
            votes_2026[party] = {"votes": 0, "share": 0.0, "seats": seats}

    # 2021 totals — dual data model:
    #   aggregate rows: constituency_name="", ac_number < 0 (stores -(seats)-1),
    #                   votes = state-wide total per party
    #   per-AC rows:    constituency_name=<name>, ac_number > 0 (real AC#),
    #                   votes = that candidate's votes, is_winner flag accurate
    #
    # Seat counts: prefer aggregate (state-wide official total) over per-AC, since per-AC
    # data may be incomplete (e.g. Assam 2021 had 65 ACs unparseable from Wikipedia).
    # The aggregate is the authoritative ECI seat count.

    # Vote totals + seat counts from aggregate rows
    agg_rows = session.exec(
        select(HistoricalResult.party,
               func.sum(HistoricalResult.votes).label("total_votes"),
               func.min(HistoricalResult.ac_number).label("agg_ac"))
        .where(HistoricalResult.state_slug == state)
        .where(HistoricalResult.year == 2021)
        .where(HistoricalResult.constituency_name == "")
        .group_by(HistoricalResult.party)
    ).all()

    # Per-AC seat counts: used as fallback only when aggregate row missing
    per_ac_winner_rows = session.exec(
        select(HistoricalResult.party, func.count(HistoricalResult.id).label("seats"))
        .where(HistoricalResult.state_slug == state)
        .where(HistoricalResult.year == 2021)
        .where(HistoricalResult.constituency_name != "")
        .where(HistoricalResult.is_winner == True)
        .group_by(HistoricalResult.party)
    ).all()
    per_ac_seats = {r.party: r.seats for r in per_ac_winner_rows}

    total_votes_2021 = sum(r.total_votes for r in agg_rows)
    votes_2021 = {}
    for r in agg_rows:
        # aggregate ac_number stored as -(seats)-1; recover seats
        agg_seats = -(r.agg_ac) - 1 if (r.agg_ac is not None and r.agg_ac < 0) else 0
        # Fall back to per-AC count if aggregate doesn't encode seats
        seats = agg_seats if agg_seats > 0 else per_ac_seats.get(r.party, 0)
        votes_2021[r.party] = {
            "votes": r.total_votes,
            "share": round(r.total_votes / total_votes_2021 * 100, 2) if total_votes_2021 else 0,
            "seats": seats,
        }
    # Surface parties that have per-AC wins but no aggregate row
    for party, seats in per_ac_seats.items():
        if party not in votes_2021:
            votes_2021[party] = {"votes": 0, "share": 0.0, "seats": seats}

    # Merge
    all_parties = set(list(votes_2026.keys()) + list(votes_2021.keys()))
    swing = []
    for party in all_parties:
        p26 = votes_2026.get(party, {"votes": 0, "share": 0.0, "seats": 0})
        p21 = votes_2021.get(party, {"votes": 0, "share": 0.0, "seats": 0})
        swing.append({
            "party": party,
            "full_name": party_map.get(party, {}).get("full_name", party),
            "color": party_map.get(party, {}).get("color", "#999"),
            "seats_2026": p26["seats"],
            "seats_2021": p21["seats"],
            "seat_change": p26["seats"] - p21["seats"],
            "share_2026": p26["share"],
            "share_2021": p21["share"],
            "share_swing": round(p26["share"] - p21["share"], 2),
        })

    swing.sort(key=lambda x: -x["seats_2026"])

    # Closest contests
    winner_subq = (
        select(Candidate.constituency_id, Candidate.votes.label("winner_votes"))
        .where(Candidate.is_winner == True)
        .subquery()
    )
    all_cands = session.exec(
        select(Constituency, Candidate)
        .join(Candidate, Candidate.constituency_id == Constituency.id)
        .where(Constituency.state_slug == state)
        .where(Candidate.is_winner == True)
    ).all()

    close_contests = []
    for constituency, winner in all_cands:
        others = session.exec(
            select(Candidate)
            .where(Candidate.constituency_id == constituency.id)
            .where(Candidate.is_winner == False)
            .order_by(Candidate.votes.desc())
        ).first()
        if others:
            margin = winner.votes - others.votes
            close_contests.append({
                "ac_number": constituency.ac_number,
                "name": constituency.name,
                "winner": winner.name,
                "winner_party": winner.party,
                "runner_up": others.name,
                "runner_up_party": others.party,
                "margin": margin,
            })

    close_contests.sort(key=lambda x: x["margin"])
    return {
        "swing": swing,
        "closest_contests": close_contests[:20],
    }


# States where 2026 ACs were fully renumbered (2023 Assam delimitation).
# For these, we match 2021↔2026 seats by name (uppercase) rather than AC number,
# since AC#37 in 2021 is a geographically different seat from AC#37 in 2026.
_NAME_MATCH_STATES = {"assam"}


def _norm_name(s: str) -> str:
    return (s or "").upper().strip()


@router.get("/{state}/seat-flips")
def seat_flips(
    state: str,
    party: str = Query(..., description="Party abbreviation (e.g. 'BJP')"),
    direction: str = Query("gained", description="'gained' = ACs this party won that they didn't in 2021; 'lost' = ACs they held in 2021 but lost in 2026"),
    session: Session = Depends(get_session),
):
    """
    Seats that flipped to/from a party between 2021 and 2026.

    direction='gained': 2026 winner is `party`, 2021 winner was a different party
    direction='lost':   2021 winner was `party`, 2026 winner is a different party

    For states in `_NAME_MATCH_STATES`, 2021↔2026 seats are matched by constituency
    name (uppercase). Seats whose name doesn't survive into 2026 are surfaced as
    `delimited_seats` (with names), and 2026 seats whose name didn't exist in
    2021 are `new_seats`.
    """
    if state not in STATE_CONFIG:
        raise HTTPException(404, "State not found")
    if direction not in ("gained", "lost"):
        raise HTTPException(400, "direction must be 'gained' or 'lost'")

    party_map = ALLIANCES.get(state, {}).get("parties", {})
    use_name_match = state in _NAME_MATCH_STATES

    def color_of(p: str) -> str:
        return party_map.get(p, {}).get("color", "#94a3b8")

    # 2021 per-AC winners / runner-ups, keyed by AC# OR by normalized name
    # depending on matching strategy.
    hist_winners = session.exec(
        select(HistoricalResult)
        .where(HistoricalResult.state_slug == state)
        .where(HistoricalResult.year == 2021)
        .where(HistoricalResult.constituency_name != "")
        .where(HistoricalResult.is_winner == True)
    ).all()
    hist_runnerups = session.exec(
        select(HistoricalResult)
        .where(HistoricalResult.state_slug == state)
        .where(HistoricalResult.year == 2021)
        .where(HistoricalResult.constituency_name != "")
        .where(HistoricalResult.is_winner == False)
    ).all()

    def _key(h):
        return _norm_name(h.constituency_name) if use_name_match else h.ac_number

    winners_2021 = {_key(h): {
        "party": h.party, "votes": h.votes,
        "ac_2021": h.ac_number, "name_2021": h.constituency_name,
    } for h in hist_winners}
    runnerups_2021 = {_key(h): {"party": h.party, "votes": h.votes} for h in hist_runnerups}

    # 2026 per-AC winners
    consts = session.exec(select(Constituency).where(Constituency.state_slug == state)).all()
    matched_2021_keys: set = set()  # 2021 keys we successfully matched in 2026
    flips = []
    new_seats = []  # 2026 ACs with no 2021 match (post-delimitation new seats)
    holds = 0

    for c in consts:
        w2026 = session.exec(
            select(Candidate)
            .where(Candidate.constituency_id == c.id)
            .where(Candidate.is_winner == True)
        ).first()
        if not w2026:
            continue

        key = _norm_name(c.name) if use_name_match else c.ac_number
        w2021 = winners_2021.get(key)
        if w2021 is not None:
            matched_2021_keys.add(key)
        runner_up = session.exec(
            select(Candidate)
            .where(Candidate.constituency_id == c.id)
            .where(Candidate.is_winner == False)
            .order_by(Candidate.votes.desc())
        ).first()
        margin_2026 = w2026.votes - (runner_up.votes if runner_up else 0)

        if direction == "gained":
            if w2026.party != party:
                continue
            if w2021 is None:
                new_seats.append({
                    "ac_number": c.ac_number, "name": c.name,
                    "winner_2026": w2026.name, "winner_2026_party": party,
                    "winner_2026_votes": w2026.votes,
                    "margin_2026": margin_2026,
                    "color": color_of(party),
                })
                continue
            if w2021["party"] == party:
                holds += 1
                continue
            r2021 = runnerups_2021.get(key, {})
            old_gap = w2021["votes"] - r2021.get("votes", 0) if r2021.get("party") == party else None
            flips.append({
                "ac_number": c.ac_number,
                "name": c.name,
                "from_party": w2021["party"],
                "from_party_color": color_of(w2021["party"]),
                "from_votes": w2021["votes"],
                "to_party": party,
                "to_party_color": color_of(party),
                "to_votes": w2026.votes,
                "to_candidate": w2026.name,
                "margin_2026": margin_2026,
                "vote_gain": w2026.votes - r2021.get("votes", 0) if r2021.get("party") == party else None,
                "was_runner_up_2021": r2021.get("party") == party,
                "was_runner_up_gap": old_gap,
            })

        elif direction == "lost":
            if w2021 is None or w2021["party"] != party:
                continue
            if w2026.party == party:
                holds += 1
                continue
            flips.append({
                "ac_number": c.ac_number,
                "name": c.name,
                "from_party": party,
                "from_party_color": color_of(party),
                "from_votes": w2021["votes"],
                "to_party": w2026.party,
                "to_party_color": color_of(w2026.party),
                "to_votes": w2026.votes,
                "to_candidate": w2026.name,
                "margin_2026": margin_2026,
            })

    flips.sort(key=lambda x: -x["margin_2026"])
    new_seats.sort(key=lambda x: -x["margin_2026"])

    # Delimitation losses: 2021 wins by `party` whose seat (by key) doesn't
    # appear in 2026. For name-matched states this is "name vanished after
    # redistricting"; for AC#-matched states it's "AC# no longer exists",
    # which currently is empty for all our states.
    delimited_seats = []
    for k, w in winners_2021.items():
        if w["party"] != party:
            continue
        if k in matched_2021_keys:
            continue
        delimited_seats.append({
            "ac_2021": w["ac_2021"],
            "name_2021": w["name_2021"],
            "votes_2021": w["votes"],
        })
    delimited_seats.sort(key=lambda x: -x["votes_2021"])

    return {
        "state": state,
        "party": party,
        "direction": direction,
        "party_color": color_of(party),
        "party_full_name": party_map.get(party, {}).get("full_name", party),
        "flipped_count": len(flips),
        "held_count": holds,
        "new_seat_count": len(new_seats),
        "delimitation_losses": len(delimited_seats),
        "delimited_seats": delimited_seats,
        "flips": flips,
        "new_seats": new_seats,
    }


@router.get("/{state}/district-swing")
def district_swing(state: str, session: Session = Depends(get_session)):
    """
    Per-district aggregates: 2021→2026 party-wise seat counts, flip count,
    margin profile, dominance flag. Powers the District tab on Geography:
    - 'Most flipped district' card
    - 'Most contested' / 'Sweep' / 'Closest' cards
    - Per-district swing column on the district list
    - 2021-vs-2026 mini chart in the district detail panel

    For Assam, 2021 winners are matched to 2026 ACs by constituency name (since
    2023 delimitation renumbered everything). Districts come from the 2026
    Constituency table; delimited-away 2021 seats are excluded from per-district
    tallies because their district can't be reliably inferred.
    """
    if state not in STATE_CONFIG:
        raise HTTPException(404, "State not found")

    party_map = ALLIANCES.get(state, {}).get("parties", {})
    use_name_match = state in _NAME_MATCH_STATES

    def color_of(p: str) -> str:
        return party_map.get(p, {}).get("color", "#94a3b8")

    # 2021 winners
    hist_winners = session.exec(
        select(HistoricalResult)
        .where(HistoricalResult.state_slug == state)
        .where(HistoricalResult.year == 2021)
        .where(HistoricalResult.constituency_name != "")
        .where(HistoricalResult.is_winner == True)
    ).all()
    winners_2021 = {
        (_norm_name(h.constituency_name) if use_name_match else h.ac_number): h.party
        for h in hist_winners
    }

    # 2026 constituencies + winners + runner-ups
    all_cands = session.exec(
        select(Candidate, Constituency)
        .join(Constituency, Constituency.id == Candidate.constituency_id)
        .where(Constituency.state_slug == state)
    ).all()
    cand_by_const: dict[int, list] = {}
    const_by_id: dict[int, Constituency] = {}
    for cand, c in all_cands:
        const_by_id[c.id] = c
        cand_by_const.setdefault(c.id, []).append(cand)

    # Build per-district data, including a per-AC list to power drill-down modals.
    districts: dict[str, dict] = {}
    for c in const_by_id.values():
        d = c.district or "Unknown"
        if d not in districts:
            districts[d] = {
                "name": d,
                "seats_2026": 0,
                "parties_2026": {},
                "parties_2021": {},
                "flipped_count": 0,
                "margins": [],
                "ac_count_with_margin": 0,
                "close_seats_2026": 0,  # margin < 5000
                "acs": [],  # full per-AC detail for modals
            }
        info = districts[d]
        info["seats_2026"] += 1

        cands = sorted(cand_by_const.get(c.id, []), key=lambda x: -x.votes)
        winner = next((x for x in cands if x.is_winner), None)
        runner = next((x for x in cands if not x.is_winner), None) if winner else None

        # 2021 winner mapped via key
        key = _norm_name(c.name) if use_name_match else c.ac_number
        w21_party = winners_2021.get(key)

        winner_party = winner.party if winner else None
        margin = (winner.votes - runner.votes) if (winner and runner) else None
        flipped = bool(w21_party and winner_party and w21_party != winner_party)

        if winner:
            info["parties_2026"][winner_party] = info["parties_2026"].get(winner_party, 0) + 1
            if margin is not None:
                info["margins"].append(margin)
                info["ac_count_with_margin"] += 1
                if margin < 5000:
                    info["close_seats_2026"] += 1

        if w21_party:
            info["parties_2021"][w21_party] = info["parties_2021"].get(w21_party, 0) + 1
            if flipped:
                info["flipped_count"] += 1

        info["acs"].append({
            "ac_number": c.ac_number,
            "name": c.name,
            "winner_party_2026": winner_party,
            "winner_party_2026_color": color_of(winner_party) if winner_party else "#94a3b8",
            "winner_name_2026": winner.name if winner else None,
            "winner_votes_2026": winner.votes if winner else 0,
            "runner_up_party_2026": runner.party if runner else None,
            "runner_up_party_2026_color": color_of(runner.party) if runner else "#94a3b8",
            "margin_2026": margin or 0,
            "winner_party_2021": w21_party,
            "winner_party_2021_color": color_of(w21_party) if w21_party else "#94a3b8",
            "flipped": flipped,
        })

    # Post-process per district
    rows = []
    for d in districts.values():
        # Leader = top 2026 party
        sorted_2026 = sorted(d["parties_2026"].items(), key=lambda x: -x[1])
        sorted_2021 = sorted(d["parties_2021"].items(), key=lambda x: -x[1])
        leader = sorted_2026[0] if sorted_2026 else (None, 0)
        leader_2021_count = d["parties_2021"].get(leader[0], 0) if leader[0] else 0
        leader_swing = (leader[1] - leader_2021_count) if leader[0] else 0
        all_parties = set(d["parties_2026"].keys()) | set(d["parties_2021"].keys())
        distinct_winner_count = len(d["parties_2026"])
        avg_margin = round(sum(d["margins"]) / d["ac_count_with_margin"]) if d["ac_count_with_margin"] else 0
        # "Sweep" district: one party won >= 75% of decided seats
        sweep_party = None
        if leader[0] and d["seats_2026"] > 0 and leader[1] / d["seats_2026"] >= 0.75:
            sweep_party = leader[0]
        # Per-party 2021/2026 comparison (for the detail panel chart)
        party_comparison = []
        for p in sorted(all_parties, key=lambda x: -(d["parties_2026"].get(x, 0))):
            party_comparison.append({
                "party": p,
                "color": color_of(p),
                "seats_2021": d["parties_2021"].get(p, 0),
                "seats_2026": d["parties_2026"].get(p, 0),
                "change": d["parties_2026"].get(p, 0) - d["parties_2021"].get(p, 0),
            })
        rows.append({
            "name": d["name"],
            "seats_2026": d["seats_2026"],
            "leader_party": leader[0],
            "leader_seats": leader[1],
            "leader_color": color_of(leader[0]) if leader[0] else "#94a3b8",
            "leader_swing": leader_swing,
            "leader_seats_2021": leader_2021_count,
            "flipped_count": d["flipped_count"],
            "avg_margin": avg_margin,
            "close_seats": d["close_seats_2026"],
            "distinct_winners": distinct_winner_count,
            "sweep_party": sweep_party,
            "sweep_party_color": color_of(sweep_party) if sweep_party else None,
            "party_comparison": party_comparison,
            "acs": sorted(d["acs"], key=lambda x: x["ac_number"]),
        })
    rows.sort(key=lambda x: -x["seats_2026"])

    # Headline cards: pick best in each category
    def best(key, reverse=True):
        candidates = [r for r in rows if r["seats_2026"] >= 2]  # ignore tiny districts
        if not candidates:
            return None
        return sorted(candidates, key=lambda r: r[key], reverse=reverse)[0]

    headline = {
        "most_flipped": best("flipped_count"),
        "sweep": next((r for r in rows if r["sweep_party"] and r["seats_2026"] >= 3), None),
        "most_contested": best("distinct_winners"),
        "closest": best("avg_margin", reverse=False),
    }

    return {
        "state": state,
        "uses_name_match": use_name_match,
        "districts": rows,
        "headline": headline,
    }


@router.get("/{state}/flip-matrix")
def flip_matrix(state: str, session: Session = Depends(get_session)):
    """
    Party-to-party seat transfer matrix between 2021 and 2026.

    Returns every (from_party, to_party) pair where from != to, with the count
    of flipped seats and the actual seat list. Used by the "Seat Transfers"
    section on Swing & Trends to answer "who snatched seats from whom?"
    """
    if state not in STATE_CONFIG:
        raise HTTPException(404, "State not found")

    party_map = ALLIANCES.get(state, {}).get("parties", {})
    use_name_match = state in _NAME_MATCH_STATES

    def color_of(p: str) -> str:
        return party_map.get(p, {}).get("color", "#94a3b8")

    # 2021 winners
    hist_winners = session.exec(
        select(HistoricalResult)
        .where(HistoricalResult.state_slug == state)
        .where(HistoricalResult.year == 2021)
        .where(HistoricalResult.constituency_name != "")
        .where(HistoricalResult.is_winner == True)
    ).all()
    winners_2021 = {
        (_norm_name(h.constituency_name) if use_name_match else h.ac_number): {
            "party": h.party, "votes": h.votes,
            "ac_2021": h.ac_number, "name_2021": h.constituency_name,
        } for h in hist_winners
    }

    # 2026 winners + runner-ups, pre-loaded
    all_cands = session.exec(
        select(Candidate, Constituency)
        .join(Constituency, Constituency.id == Candidate.constituency_id)
        .where(Constituency.state_slug == state)
    ).all()
    winners_2026 = {}
    runners_2026 = {}
    consts_by_id = {}
    for cand, c in all_cands:
        consts_by_id[c.id] = c
        if cand.is_winner:
            winners_2026[c.id] = cand
        else:
            prev = runners_2026.get(c.id)
            if prev is None or cand.votes > prev.votes:
                runners_2026[c.id] = cand

    # Aggregate flip pairs
    pairs: dict[tuple[str, str], list] = {}
    party_gain_totals: dict[str, int] = {}
    party_loss_totals: dict[str, int] = {}

    for cid, w26 in winners_2026.items():
        c = consts_by_id[cid]
        key = _norm_name(c.name) if use_name_match else c.ac_number
        w21 = winners_2021.get(key)
        if w21 is None or w21["party"] == w26.party:
            continue
        ru = runners_2026.get(cid)
        margin = w26.votes - (ru.votes if ru else 0)
        pair = (w21["party"], w26.party)
        pairs.setdefault(pair, []).append({
            "ac_number": c.ac_number, "name": c.name,
            "margin_2026": margin,
            "from_votes": w21["votes"], "to_votes": w26.votes,
            "to_candidate": w26.name,
        })
        party_gain_totals[w26.party] = party_gain_totals.get(w26.party, 0) + 1
        party_loss_totals[w21["party"]] = party_loss_totals.get(w21["party"], 0) + 1

    pair_rows = []
    for (from_p, to_p), seats in pairs.items():
        seats.sort(key=lambda s: -s["margin_2026"])
        pair_rows.append({
            "from_party": from_p,
            "from_party_color": color_of(from_p),
            "to_party": to_p,
            "to_party_color": color_of(to_p),
            "count": len(seats),
            "seats": seats,
        })
    pair_rows.sort(key=lambda x: -x["count"])

    # Group by gainer (for "Who snatched from whom" view)
    gainers: dict[str, dict] = {}
    for r in pair_rows:
        g = gainers.setdefault(r["to_party"], {
            "party": r["to_party"], "party_color": r["to_party_color"],
            "total_gained": 0, "sources": [],
        })
        g["total_gained"] += r["count"]
        g["sources"].append({
            "party": r["from_party"], "party_color": r["from_party_color"],
            "count": r["count"], "seats": r["seats"],
        })
    gainer_rows = sorted(gainers.values(), key=lambda x: -x["total_gained"])
    for g in gainer_rows:
        g["sources"].sort(key=lambda s: -s["count"])

    # Group by loser (for "Who lost to whom" view)
    losers: dict[str, dict] = {}
    for r in pair_rows:
        l = losers.setdefault(r["from_party"], {
            "party": r["from_party"], "party_color": r["from_party_color"],
            "total_lost": 0, "destinations": [],
        })
        l["total_lost"] += r["count"]
        l["destinations"].append({
            "party": r["to_party"], "party_color": r["to_party_color"],
            "count": r["count"], "seats": r["seats"],
        })
    loser_rows = sorted(losers.values(), key=lambda x: -x["total_lost"])
    for l in loser_rows:
        l["destinations"].sort(key=lambda s: -s["count"])

    return {
        "state": state,
        "uses_name_match": use_name_match,
        "total_flips": sum(r["count"] for r in pair_rows),
        "pairs": pair_rows,        # flat list of all (from→to) pairs by count
        "gainers": gainer_rows,    # grouped by who-gained
        "losers": loser_rows,      # grouped by who-lost
    }


@router.get("/{state}/alliance-breakdown/{alliance_id}")
def alliance_breakdown(state: str, alliance_id: str, session: Session = Depends(get_session)):
    """
    Per-party flip accounting for every party in an alliance:
    holds, flipped-in (gained from other), flipped-out (lost to other),
    new seats (post-delimitation), delimited away (2021 win whose seat name
    didn't survive).

    For Assam, matching is by constituency name (2023 renumbered everything).
    For other states, matching is by AC number.
    """
    if state not in STATE_CONFIG:
        raise HTTPException(404, "State not found")

    cfg = ALLIANCES.get(state, {})
    alliance_meta = next((a for a in cfg.get("alliances", []) if a["id"] == alliance_id), None)
    if alliance_meta is None and alliance_id != "others":
        raise HTTPException(404, "Alliance not found")

    party_map = cfg.get("parties", {})
    use_name_match = state in _NAME_MATCH_STATES

    def color_of(p: str) -> str:
        return party_map.get(p, {}).get("color", "#94a3b8")

    # Parties in this alliance (or "others" bucket)
    if alliance_id == "others":
        # Parties not mapped to any alliance, OR explicitly mapped to "others"
        alliance_parties = [p for p, m in party_map.items() if m.get("alliance", "others") == "others"]
        alliance_name = "Others"
        alliance_color = "#94a3b8"
    else:
        alliance_parties = [p for p, m in party_map.items() if m.get("alliance") == alliance_id]
        alliance_name = alliance_meta["name"]
        alliance_color = alliance_meta["color"]

    # Load all 2021 winners (and 2026 ACs + winners) ONCE
    hist_winners = session.exec(
        select(HistoricalResult)
        .where(HistoricalResult.state_slug == state)
        .where(HistoricalResult.year == 2021)
        .where(HistoricalResult.constituency_name != "")
        .where(HistoricalResult.is_winner == True)
    ).all()

    def _key(h_or_c):
        if hasattr(h_or_c, "constituency_name"):  # HistoricalResult
            return _norm_name(h_or_c.constituency_name) if use_name_match else h_or_c.ac_number
        return _norm_name(h_or_c.name) if use_name_match else h_or_c.ac_number

    winners_2021 = {_key(h): {
        "party": h.party, "votes": h.votes,
        "ac_2021": h.ac_number, "name_2021": h.constituency_name,
    } for h in hist_winners}

    consts = session.exec(select(Constituency).where(Constituency.state_slug == state)).all()
    # Pre-fetch all winners + runner-ups across the state
    all_cands = session.exec(
        select(Candidate, Constituency)
        .join(Constituency, Constituency.id == Candidate.constituency_id)
        .where(Constituency.state_slug == state)
    ).all()
    winners_2026 = {}  # constituency_id → Candidate (winner)
    runner_ups_2026 = {}  # constituency_id → max-vote non-winner
    for cand, _c in all_cands:
        if cand.is_winner:
            winners_2026[cand.constituency_id] = cand
        else:
            prev = runner_ups_2026.get(cand.constituency_id)
            if prev is None or cand.votes > prev.votes:
                runner_ups_2026[cand.constituency_id] = cand

    # Per-party accounting
    per_party = {}
    for p in alliance_parties:
        per_party[p] = {
            "party": p,
            "full_name": party_map.get(p, {}).get("full_name", p),
            "color": color_of(p),
            "seats_2021": 0,  # filled below from aggregate or per-AC fallback
            "seats_2026": 0,
            "holds": [],
            "flipped_in": [],
            "flipped_out": [],
            "new_seats": [],
            "delimited_seats": [],
        }

    matched_2021_keys: set = set()

    for c in consts:
        w2026 = winners_2026.get(c.id)
        if not w2026:
            continue
        key = _key(c)
        w2021 = winners_2021.get(key)
        if w2021 is not None:
            matched_2021_keys.add(key)
        ru = runner_ups_2026.get(c.id)
        margin_2026 = w2026.votes - (ru.votes if ru else 0)

        # 2026 winner's perspective
        if w2026.party in per_party:
            if w2021 is None:
                per_party[w2026.party]["new_seats"].append({
                    "ac_number": c.ac_number, "name": c.name,
                    "winner_2026": w2026.name, "votes": w2026.votes,
                    "margin_2026": margin_2026,
                })
            elif w2021["party"] == w2026.party:
                per_party[w2026.party]["holds"].append({
                    "ac_number": c.ac_number, "name": c.name,
                    "winner_2026": w2026.name, "votes_2026": w2026.votes,
                    "votes_2021": w2021["votes"], "margin_2026": margin_2026,
                })
            else:
                per_party[w2026.party]["flipped_in"].append({
                    "ac_number": c.ac_number, "name": c.name,
                    "from_party": w2021["party"], "from_party_color": color_of(w2021["party"]),
                    "to_candidate": w2026.name, "to_votes": w2026.votes,
                    "margin_2026": margin_2026,
                })

        # 2021 winner's perspective (only if 2021 winner is in this alliance)
        if w2021 is not None and w2021["party"] in per_party and w2021["party"] != w2026.party:
            per_party[w2021["party"]]["flipped_out"].append({
                "ac_number": c.ac_number, "name": c.name,
                "to_party": w2026.party, "to_party_color": color_of(w2026.party),
                "to_candidate": w2026.name, "to_votes": w2026.votes,
                "from_votes": w2021["votes"],
                "margin_2026": margin_2026,
            })

    # Delimited seats: 2021 wins by an alliance party whose seat didn't survive
    for k, w in winners_2021.items():
        if w["party"] not in per_party:
            continue
        if k in matched_2021_keys:
            continue
        per_party[w["party"]]["delimited_seats"].append({
            "ac_2021": w["ac_2021"], "name_2021": w["name_2021"],
            "votes_2021": w["votes"],
        })

    # Fill seats_2021 / seats_2026 from aggregate where available
    for p in alliance_parties:
        agg = session.exec(
            select(HistoricalResult)
            .where(HistoricalResult.state_slug == state)
            .where(HistoricalResult.year == 2021)
            .where(HistoricalResult.constituency_name == "")
            .where(HistoricalResult.party == p)
        ).first()
        if agg is not None:
            per_party[p]["seats_2021"] = -(agg.ac_number) - 1 if agg.ac_number < 0 else agg.ac_number
        else:
            # Fallback to per-AC win count
            per_party[p]["seats_2021"] = len(per_party[p]["holds"]) + len(per_party[p]["flipped_out"]) + len(per_party[p]["delimited_seats"])

        # 2026 seats: count of winners from Candidate table
        won_2026 = session.exec(
            select(func.count(Candidate.id))
            .join(Constituency, Constituency.id == Candidate.constituency_id)
            .where(Constituency.state_slug == state)
            .where(Candidate.is_winner == True)
            .where(Candidate.party == p)
        ).first() or 0
        per_party[p]["seats_2026"] = won_2026

    # Sort each list by margin / votes
    for p in per_party.values():
        p["holds"].sort(key=lambda x: -x["margin_2026"])
        p["flipped_in"].sort(key=lambda x: -x["margin_2026"])
        p["flipped_out"].sort(key=lambda x: -x["margin_2026"])
        p["new_seats"].sort(key=lambda x: -x["margin_2026"])
        p["delimited_seats"].sort(key=lambda x: -x["votes_2021"])
        p["net_change"] = p["seats_2026"] - p["seats_2021"]

    # Sort parties by 2026 seats desc; keep only those with any activity
    party_rows = sorted(per_party.values(), key=lambda x: -x["seats_2026"])
    party_rows = [p for p in party_rows if p["seats_2026"] > 0 or p["seats_2021"] > 0]

    # Alliance-level aggregate
    agg_seats_2021 = sum(p["seats_2021"] for p in party_rows)
    agg_seats_2026 = sum(p["seats_2026"] for p in party_rows)
    agg_holds = sum(len(p["holds"]) for p in party_rows)
    agg_in = sum(len(p["flipped_in"]) for p in party_rows)
    agg_out = sum(len(p["flipped_out"]) for p in party_rows)
    agg_new = sum(len(p["new_seats"]) for p in party_rows)
    agg_delim = sum(len(p["delimited_seats"]) for p in party_rows)

    # Subtract intra-alliance flips so the alliance-level "flipped_in" and
    # "flipped_out" reflect only inter-alliance churn.
    alliance_party_set = set(per_party.keys())
    intra_in = sum(1 for p in party_rows for f in p["flipped_in"] if f["from_party"] in alliance_party_set)
    intra_out = sum(1 for p in party_rows for f in p["flipped_out"] if f["to_party"] in alliance_party_set)

    return {
        "state": state,
        "alliance_id": alliance_id,
        "alliance_name": alliance_name,
        "alliance_color": alliance_color,
        "seats_2021": agg_seats_2021,
        "seats_2026": agg_seats_2026,
        "net_change": agg_seats_2026 - agg_seats_2021,
        "totals": {
            "holds": agg_holds,
            "flipped_in_total": agg_in,
            "flipped_in_inter": agg_in - intra_in,
            "flipped_out_total": agg_out,
            "flipped_out_inter": agg_out - intra_out,
            "new_seats": agg_new,
            "delimited_seats": agg_delim,
            "intra_alliance_flips": intra_in,  # equals intra_out by definition
        },
        "parties": party_rows,
        "uses_name_match": use_name_match,
    }
