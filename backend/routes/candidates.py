from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import Session, select
from statistics import median
from backend.db import get_session
from backend.models import Candidate, Constituency
from backend.config.states import STATE_CONFIG
from backend.config.alliances import ALLIANCES
from backend._cache import ttl_cache

router = APIRouter()


@router.get("/{state}/party-analytics")
@ttl_cache(seconds=600)  # 1.2s → 5ms after first hit
def party_analytics(state: str, session: Session = Depends(get_session)):
    """
    Per-party analytics that go beyond Overview/Swing's basic seat counts:
    - Strike rate: contested vs won (efficiency at converting candidates to MLAs)
    - Candidate demographics: avg age, female %, criminal cases profile
    - Wealth profile: avg/median assets in crore
    - Geographic strongholds: top districts where the party won seats
    Powers the Party Analysis page (replaces the older redundant party table).
    """
    if state not in STATE_CONFIG:
        raise HTTPException(404, "State not found")

    party_map = ALLIANCES.get(state, {}).get("parties", {})
    alliance_list = ALLIANCES.get(state, {}).get("alliances", [])
    alliance_name = {a["id"]: a["name"] for a in alliance_list}

    # Pull anti-incumbency context once — per-party "of the seats they won in
    # 2021, how many did they hold in 2026?" Lets the Parties table show which
    # parties shed/held their incumbent base.
    from backend.routes.kpis import _ac_match_2021_to_2026  # local import to avoid circular load
    hist_map_2026 = _ac_match_2021_to_2026(state, session)
    # Build party → set of 2026 AC numbers they won
    party_2026_wins: dict[str, set[int]] = {}
    for cand, con in session.exec(
        select(Candidate, Constituency)
        .join(Constituency, Constituency.id == Candidate.constituency_id)
        .where(Constituency.state_slug == state)
        .where(Candidate.is_winner == True)
    ).all():
        party_2026_wins.setdefault(cand.party, set()).add(con.ac_number)
    # Build party → set of 2026 AC numbers they HELD from 2021 (party-level hold)
    party_seats_2021_count: dict[str, int] = {}
    party_held_count: dict[str, int] = {}
    for ac_no, hist in hist_map_2026.items():
        p21 = hist["party_2021"]
        party_seats_2021_count[p21] = party_seats_2021_count.get(p21, 0) + 1
        if ac_no in party_2026_wins.get(p21, set()):
            party_held_count[p21] = party_held_count.get(p21, 0) + 1

    rows = session.exec(
        select(Candidate, Constituency)
        .join(Constituency, Constituency.id == Candidate.constituency_id)
        .where(Constituency.state_slug == state)
    ).all()

    by_party: dict[str, dict] = {}
    for cand, con in rows:
        p = cand.party
        if p not in by_party:
            by_party[p] = {
                "party": p,
                "full_name": party_map.get(p, {}).get("full_name", p),
                "color": party_map.get(p, {}).get("color", "#94a3b8"),
                "alliance_id": party_map.get(p, {}).get("alliance", "others"),
                "alliance_name": alliance_name.get(party_map.get(p, {}).get("alliance"), "Others"),
                "candidate_count": 0,
                "won": 0,
                "contested_acs": set(),
                "total_votes": 0,
                "won_districts": {},
                "ages": [],
                "winner_ages": [],          # MLA ages only (is_winner=True)
                "winner_assets_cr": [],     # MLA assets in crore (winners only)
                "winner_crim_counts": [],   # MLA criminal-case counts (winners only)
                "female_count": 0,
                "male_count": 0,
                "other_gender_count": 0,
                "criminal_counts": [],     # only non-null
                "with_criminal_count": 0,
                "assets_values_cr": [],    # only non-null
            }
        d = by_party[p]
        d["candidate_count"] += 1
        d["contested_acs"].add(con.ac_number)
        d["total_votes"] += cand.votes
        if cand.is_winner:
            d["won"] += 1
            district = con.district or "Unknown"
            d["won_districts"][district] = d["won_districts"].get(district, 0) + 1
        if cand.age is not None:
            d["ages"].append(cand.age)
            if cand.is_winner:
                d["winner_ages"].append(cand.age)
        if cand.gender == "Female":
            d["female_count"] += 1
        elif cand.gender == "Male":
            d["male_count"] += 1
        elif cand.gender:
            d["other_gender_count"] += 1
        if cand.criminal_cases is not None:
            d["criminal_counts"].append(cand.criminal_cases)
            if cand.criminal_cases > 0:
                d["with_criminal_count"] += 1
            if cand.is_winner:
                d["winner_crim_counts"].append(cand.criminal_cases)
        if cand.assets_cr is not None:
            d["assets_values_cr"].append(float(cand.assets_cr))
            if cand.is_winner:
                d["winner_assets_cr"].append(float(cand.assets_cr))

    def fmt_avg(xs):
        return round(sum(xs) / len(xs), 1) if xs else None

    out = []
    for d in by_party.values():
        contested = len(d["contested_acs"])
        won = d["won"]
        gender_known = d["female_count"] + d["male_count"] + d["other_gender_count"]
        top_districts_full = sorted(d["won_districts"].items(), key=lambda x: -x[1])
        top_districts = top_districts_full[:5]
        seats_2021 = party_seats_2021_count.get(d["party"], 0)
        seats_held = party_held_count.get(d["party"], 0)
        retention_pct = round(seats_held / seats_2021 * 100, 1) if seats_2021 else None
        out.append({
            "party": d["party"],
            "full_name": d["full_name"],
            "color": d["color"],
            "alliance_id": d["alliance_id"],
            "alliance_name": d["alliance_name"],
            "candidate_count": d["candidate_count"],
            "contested": contested,
            "won": won,
            "strike_rate": round(won / contested * 100, 1) if contested else 0,
            "total_votes": d["total_votes"],
            "votes_per_seat": round(d["total_votes"] / won) if won else None,
            "districts_won_count": len(d["won_districts"]),
            "top_district_seats": top_districts_full[0][1] if top_districts_full else 0,
            "top_district_name": top_districts_full[0][0] if top_districts_full else None,
            "top_district_share": round(top_districts_full[0][1] / won * 100, 1) if won and top_districts_full else None,
            "avg_age": fmt_avg(d["ages"]),
            "youngest": min(d["ages"]) if d["ages"] else None,
            "oldest": max(d["ages"]) if d["ages"] else None,
            # MLA age distribution per party (winners only). Same 5 buckets as the
            # state-level /kpis endpoint so the UI can use one color scheme.
            "mla_age_distribution": {
                "u35":   sum(1 for a in d["winner_ages"] if a < 35),
                "35_44": sum(1 for a in d["winner_ages"] if 35 <= a < 45),
                "45_54": sum(1 for a in d["winner_ages"] if 45 <= a < 55),
                "55_64": sum(1 for a in d["winner_ages"] if 55 <= a < 65),
                "65p":   sum(1 for a in d["winner_ages"] if a >= 65),
            },
            "mla_avg_age": fmt_avg(d["winner_ages"]),
            "mla_with_age": len(d["winner_ages"]),
            # MLA asset distribution (winners only). Same 5 buckets as the
            # Assets page modal so the colour scheme can be shared.
            "mla_asset_distribution": {
                "u0_5":   sum(1 for v in d["winner_assets_cr"] if v < 0.5),
                "0_5_2":  sum(1 for v in d["winner_assets_cr"] if 0.5 <= v < 2),
                "2_10":   sum(1 for v in d["winner_assets_cr"] if 2 <= v < 10),
                "10_50":  sum(1 for v in d["winner_assets_cr"] if 10 <= v < 50),
                "50p":    sum(1 for v in d["winner_assets_cr"] if v >= 50),
            },
            "mla_with_assets": len(d["winner_assets_cr"]),
            "mla_avg_assets_cr": fmt_avg(d["winner_assets_cr"]),
            "mla_median_assets_cr": round(median(d["winner_assets_cr"]), 2) if d["winner_assets_cr"] else None,
            # MLA criminal-case distribution (winners only). 4 buckets:
            # clean / 1-2 cases / 3-5 / 6+. Matches "serious" threshold of ≥3
            # used elsewhere in the dashboard.
            "mla_criminal_distribution": {
                "clean": sum(1 for n in d["winner_crim_counts"] if n == 0),
                "1_2":   sum(1 for n in d["winner_crim_counts"] if 1 <= n <= 2),
                "3_5":   sum(1 for n in d["winner_crim_counts"] if 3 <= n <= 5),
                "6p":    sum(1 for n in d["winner_crim_counts"] if n >= 6),
            },
            "mla_with_crim_data": len(d["winner_crim_counts"]),
            "mla_with_any_crim": sum(1 for n in d["winner_crim_counts"] if n > 0),
            "female_count": d["female_count"],
            "female_pct": round(d["female_count"] / gender_known * 100, 1) if gender_known else None,
            "candidates_with_criminal": d["with_criminal_count"],
            "criminal_pct": round(d["with_criminal_count"] / len(d["criminal_counts"]) * 100, 1) if d["criminal_counts"] else None,
            "avg_criminal_cases": fmt_avg(d["criminal_counts"]),
            "max_criminal_cases": max(d["criminal_counts"]) if d["criminal_counts"] else None,
            "avg_assets_cr": fmt_avg(d["assets_values_cr"]),
            "median_assets_cr": round(median(d["assets_values_cr"]), 2) if d["assets_values_cr"] else None,
            "top_districts": [{"district": d_, "seats": s} for d_, s in top_districts],
            # Incumbency: of seats this party won in 2021, how many did they hold in 2026?
            "seats_2021": seats_2021,
            "seats_held": seats_held,
            "retention_pct": retention_pct,
        })

    out.sort(key=lambda x: -x["won"])
    return {"parties": out}


@router.get("/{state}/candidates")
def list_candidates(
    state: str,
    party: str = Query(default=None),
    district: str = Query(default=None),
    gender: str = Query(default=None),
    criminal: bool = Query(default=None),
    search: str = Query(default=None),
    constituency: str = Query(default=None, description="Substring match on constituency name (case-insensitive)"),
    ac_number: int = Query(default=None),
    winners_only: bool = Query(default=False),
    top_n: int = Query(default=None, description="Keep only candidates with rank <= top_n within their AC (e.g. top_n=4 keeps the top 4 contenders per constituency)"),
    sort_by: str = Query(default="ac_asc", description="ac_asc | votes_desc | votes_asc | margin_desc"),
    limit: int = Query(default=50),
    offset: int = Query(default=0),
    session: Session = Depends(get_session),
):
    if state not in STATE_CONFIG:
        raise HTTPException(404, "State not found")

    stmt = (
        select(Candidate, Constituency)
        .join(Constituency, Constituency.id == Candidate.constituency_id)
        .where(Constituency.state_slug == state)
    )
    if party:
        # Prefix match so typing "B" surfaces BJP, BPF, BSP, BGPM, etc.
        # without forcing the user to type the full abbreviation.
        stmt = stmt.where(Candidate.party.startswith(party))
    if district:
        stmt = stmt.where(Constituency.district == district)
    if gender:
        stmt = stmt.where(Candidate.gender == gender)
    if criminal is True:
        stmt = stmt.where(Candidate.criminal_cases > 0)
    elif criminal is False:
        stmt = stmt.where((Candidate.criminal_cases == 0) | (Candidate.criminal_cases == None))
    if search:
        stmt = stmt.where(Candidate.name.contains(search))
    if ac_number:
        stmt = stmt.where(Constituency.ac_number == ac_number)
    if constituency:
        # Case-insensitive substring match on the constituency name
        stmt = stmt.where(Constituency.name.ilike(f"%{constituency}%"))
    if winners_only:
        stmt = stmt.where(Candidate.is_winner == True)

    rows = session.exec(stmt).all()

    # Per-AC totals, rank list, leader votes, and runner-up votes — single sweep
    # over candidates in matching ACs.
    ac_ids = {con.id for _, con in rows}
    totals_by_ac: dict[int, int] = {}
    rank_by_cand: dict[int, int] = {}            # candidate.id -> rank within AC (1 = leader)
    leader_votes_by_ac: dict[int, int] = {}      # constituency_id -> votes of rank-1
    runner_up_votes_by_ac: dict[int, int] = {}   # constituency_id -> votes of rank-2
    if ac_ids:
        all_in_acs = session.exec(
            select(Candidate.id, Candidate.constituency_id, Candidate.votes)
            .where(Candidate.constituency_id.in_(ac_ids))
            .order_by(Candidate.constituency_id, Candidate.votes.desc())
        ).all()
        per_ac: dict[int, list] = {}
        for r in all_in_acs:
            per_ac.setdefault(r.constituency_id, []).append(r)
        for ac_id, lst in per_ac.items():
            totals_by_ac[ac_id] = sum(r.votes for r in lst)
            leader_votes_by_ac[ac_id] = lst[0].votes if lst else 0
            runner_up_votes_by_ac[ac_id] = lst[1].votes if len(lst) > 1 else 0
            for idx, r in enumerate(lst, start=1):
                rank_by_cand[r.id] = idx

    party_map = ALLIANCES.get(state, {}).get("parties", {})

    def candidate_row(c: Candidate, con: Constituency) -> dict:
        total = totals_by_ac.get(con.id, 0)
        rank = rank_by_cand.get(c.id, 0)
        leader_votes = leader_votes_by_ac.get(con.id, 0)
        runner_up_votes = runner_up_votes_by_ac.get(con.id, 0)
        # Signed margin: winners get a positive margin over the runner-up;
        # losers get a negative margin from the leader.
        if rank == 1:
            margin = c.votes - runner_up_votes
        elif rank > 1:
            margin = c.votes - leader_votes  # negative
        else:
            margin = 0
        return {
            "name": c.name,
            "party": c.party,
            "full_party_name": party_map.get(c.party, {}).get("full_name", c.party),
            "color": party_map.get(c.party, {}).get("color", "#999"),
            "constituency": con.name,
            "ac_number": con.ac_number,
            "district": con.district,
            "votes": c.votes,
            "vote_share": round(c.votes / total * 100, 2) if total else 0,
            "rank": rank,
            "margin": margin,
            # Legacy: kept for backwards-compat; equals abs(margin) for losers and 0 for winners.
            "margin_from_leader": (leader_votes - c.votes) if leader_votes > c.votes else 0,
            "is_winner": c.is_winner,
            "assets_cr": c.assets_cr,
            "criminal_cases": c.criminal_cases,
            "education": c.education,
            "gender": c.gender,
            "age": c.age,
            "occupation": c.occupation,
        }

    enriched = [candidate_row(c, con) for c, con in rows]

    # Top-N per AC: keep only candidates whose rank within their constituency is <= top_n.
    # Rank is computed across ALL candidates in the AC (not just the filtered set), so
    # `top_n=4` reliably means "one of the four highest vote-getters in that AC".
    if top_n and top_n > 0:
        enriched = [c for c in enriched if c["rank"] and c["rank"] <= top_n]

    # Sort
    if sort_by == "votes_desc":
        enriched.sort(key=lambda x: -x["votes"])
    elif sort_by == "votes_asc":
        enriched.sort(key=lambda x: x["votes"])
    elif sort_by == "margin_desc":
        # winners with biggest margins first
        enriched.sort(key=lambda x: (0 if x["is_winner"] else 1, -x["votes"]))
    else:  # ac_asc default — by AC then by rank within AC
        enriched.sort(key=lambda x: (x["ac_number"], x["rank"]))

    return {
        "total": len(enriched),
        "candidates": enriched[offset: offset + limit],
    }
