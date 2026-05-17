"""
Composite KPIs that don't live naturally on any single existing endpoint.
Per-state breakdowns: competition quality, accountability metrics,
anti-incumbency, vote-to-seat efficiency, etc.

All numbers are derived from the same data the rest of the dashboard uses —
no external sources, no LLM, just SQL + arithmetic.
"""
from __future__ import annotations

from statistics import median
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select, func

from backend._utils import norm_name
from backend._cache import ttl_cache

from backend.config.states import STATE_CONFIG
from backend.db import get_session
from backend.models import Candidate, Constituency, HistoricalResult, NotaPerAC

router = APIRouter()


# Helpers ─────────────────────────────────────────────────────────────────────

def _ac_match_2021_to_2026(state: str, session: Session) -> dict[int, dict]:
    """Returns: { ac_number_2026: {2021_winner_party, 2021_winner_name} }.
    For non-delimitation states (TN, KL, WB, PY) we match on ac_number directly.
    For Assam (renumbered 2023) we fall back to constituency-name matching."""
    constituencies = session.exec(
        select(Constituency).where(Constituency.state_slug == state)
    ).all()
    out: dict[int, dict] = {}
    hist_winners = session.exec(
        select(HistoricalResult)
        .where(HistoricalResult.state_slug == state)
        .where(HistoricalResult.year == 2021)
        .where(HistoricalResult.is_winner == True)
        .where(HistoricalResult.constituency_name != "ECI_AGGREGATE")
    ).all()
    by_ac = {h.ac_number: h for h in hist_winners if h.ac_number}
    by_name = {norm_name(h.constituency_name): h for h in hist_winners}

    for c in constituencies:
        # 1) Same AC number (works for TN, KL, WB, PY)
        h = by_ac.get(c.ac_number)
        # 2) Fall back to name match (Assam delimitation)
        if h is None:
            h = by_name.get(norm_name(c.name))
        if h:
            out[c.ac_number] = {"party_2021": h.party, "name_2021": h.constituency_name}
    return out


# ─────────────────────────  /api/{state}/kpis  ─────────────────────────

@router.get("/{state}/kpis")
@ttl_cache(seconds=600)  # 4s → 5ms after first hit
def state_kpis(state: str, session: Session = Depends(get_session)) -> dict[str, Any]:
    if state not in STATE_CONFIG:
        raise HTTPException(404, "Unknown state")
    cfg = STATE_CONFIG[state]

    # Pull all 2026 winners with their constituency joined.
    winners_q = (
        select(Candidate, Constituency)
        .join(Constituency, Constituency.id == Candidate.constituency_id)
        .where(Candidate.state_slug == state)
        .where(Candidate.is_winner == True)
    )
    winner_rows = session.exec(winners_q).all()
    winners = [(c, con) for c, con in winner_rows]

    total_seats = cfg["total_seats"]
    declared = len(winners)

    # ── Competition / margin metrics ──
    # Pull every AC's total polled votes (for margin% computation).
    cons_with_totals: dict[int, int] = {}
    for con in session.exec(select(Constituency).where(Constituency.state_slug == state)).all():
        total = session.exec(
            select(func.coalesce(func.sum(Candidate.votes), 0))
            .where(Candidate.constituency_id == con.id)
        ).first() or 0
        cons_with_totals[con.id] = total

    # Margin per winner = winner votes - runner-up votes
    margins: list[int] = []
    margin_pcts: list[float] = []
    close_contests = 0           # <5% margin
    very_close = 0               # recount eligible: <0.5% of polled
    for cand, con in winners:
        # Runner-up = highest-vote non-winning candidate in this AC
        runner_up_votes = session.exec(
            select(func.coalesce(func.max(Candidate.votes), 0))
            .where(Candidate.constituency_id == con.id)
            .where(Candidate.is_winner == False)
        ).first() or 0
        margin = max(0, cand.votes - runner_up_votes)
        margins.append(margin)
        total_polled = cons_with_totals.get(con.id, 0)
        if total_polled > 0:
            pct = margin / total_polled * 100
            margin_pcts.append(pct)
            if pct < 5: close_contests += 1
            if pct < 0.5: very_close += 1

    # ── Largest single party + concentration ──
    party_counts: dict[str, int] = {}
    for cand, _ in winners:
        party_counts[cand.party] = party_counts.get(cand.party, 0) + 1
    top_party = max(party_counts.items(), key=lambda kv: kv[1]) if party_counts else (None, 0)
    single_party_pct = round(top_party[1] / declared * 100, 1) if declared else 0

    # ── Candidate demographics (winners only) ──
    ages = [c.age for c, _ in winners if c.age is not None]
    assets = [c.assets_cr for c, _ in winners if c.assets_cr is not None]
    crim_count = sum(1 for c, _ in winners if (c.criminal_cases or 0) > 0)
    crim_serious_count = sum(1 for c, _ in winners if (c.criminal_cases or 0) >= 3)
    age_dist = {"u35": 0, "35_44": 0, "45_54": 0, "55_64": 0, "65p": 0}
    for a in ages:
        if a < 35:       age_dist["u35"] += 1
        elif a < 45:     age_dist["35_44"] += 1
        elif a < 55:     age_dist["45_54"] += 1
        elif a < 65:     age_dist["55_64"] += 1
        else:            age_dist["65p"] += 1

    # ── Anti-incumbency + first-time MLAs ──
    hist_map = _ac_match_2021_to_2026(state, session)
    matched_seats = 0           # ACs where we have a 2021 winner to compare against
    same_party_held = 0         # 2021 winning party also won in 2026 (PARTY-level hold, not person)
    flipped = 0                 # 2021 winning party LOST in 2026
    # First-time-MLA approximation: winner name not present among 2021 winners ANYWHERE in the state.
    hist_winner_names = set()
    for h in session.exec(
        select(HistoricalResult)
        .where(HistoricalResult.state_slug == state)
        .where(HistoricalResult.year == 2021)
        .where(HistoricalResult.is_winner == True)
    ).all():
        # HistoricalResult.constituency_name is actually the constituency name, not the MLA name.
        # We don't have 2021 candidate-level names in the DB — so true "first-time MLA" requires
        # MyNeta cross-year matching that we don't yet have. Use party-level hold as the proxy
        # for anti-incumbency; flag first-time as "not computable" until we ingest.
        pass

    for cand, con in winners:
        h = hist_map.get(con.ac_number)
        if not h:
            continue
        matched_seats += 1
        if h["party_2021"] == cand.party:
            same_party_held += 1
        else:
            flipped += 1
    anti_incumbency_pct = round(flipped / matched_seats * 100, 1) if matched_seats else None

    # ── Vote-to-seat efficiency per alliance ──
    # Pull alliance-level seat shares + (cheaply re-compute) vote shares from the swing endpoint.
    # We import here to avoid a circular import at module load.
    from backend.routes.swing import swing_analysis as _swing
    from backend.routes.overview import state_overview as _overview
    sw = _swing(state, session)
    ov = _overview(state, session)
    party_to_alliance: dict[str, str] = {}
    for p in ov.get("parties", []):
        if p.get("alliance_id"):
            party_to_alliance[p["party"]] = p["alliance_id"]
    alliance_share: dict[str, float] = {}
    for p in sw.get("swing", []):
        aid = party_to_alliance.get(p["party"], "others")
        alliance_share[aid] = alliance_share.get(aid, 0.0) + (p.get("share_2026") or 0.0)

    efficiency: list[dict] = []
    for a in ov.get("alliances", []):
        vs = alliance_share.get(a["alliance_id"], 0.0)
        ss = a["seats"] / total_seats * 100 if total_seats else 0.0
        efficiency.append({
            "alliance_id": a["alliance_id"],
            "alliance_name": a["name"],
            "color": a["color"],
            "vote_share": round(vs, 2),
            "seat_share": round(ss, 2),
            "delta_pp": round(ss - vs, 2),  # positive = over-represented (efficient)
        })
    efficiency.sort(key=lambda e: -e["seat_share"])

    return {
        "state": state,
        "name": cfg["name"],
        "declared": declared,
        "total_seats": total_seats,
        "competition": {
            "avg_margin": int(sum(margins) / len(margins)) if margins else 0,
            "median_margin": int(median(margins)) if margins else 0,
            "close_contests_lt_5pct": close_contests,
            "recount_eligible_lt_0_5pct": very_close,
        },
        "concentration": {
            "top_party": top_party[0],
            "top_party_seats": top_party[1],
            "single_party_pct": single_party_pct,
        },
        "demographics": {
            "avg_age": round(sum(ages) / len(ages), 1) if ages else None,
            "youngest": min(ages) if ages else None,
            "oldest": max(ages) if ages else None,
            "age_distribution": age_dist,
            "median_assets_cr": round(median(assets), 2) if assets else None,
            "avg_assets_cr": round(sum(assets) / len(assets), 2) if assets else None,
            "assets_coverage": f"{len(assets)}/{declared}",
            "criminal_mlas": crim_count,
            "criminal_mlas_pct": round(crim_count / declared * 100, 1) if declared else 0,
            "serious_criminal_mlas": crim_serious_count,
        },
        "incumbency": {
            "matched_2021_seats": matched_seats,
            "same_party_held": same_party_held,
            "flipped_seats": flipped,
            "anti_incumbency_pct": anti_incumbency_pct,
            "note": (
                "Computed at party level (same-party hold). Person-level "
                "first-time-MLA % needs 2021 candidate names ingestion."
            ),
        },
        "efficiency": efficiency,
        "nota": _nota_block(state, session),
    }


def _nota_block(state: str, session: Session) -> dict:
    """NOTA aggregates + the marquee 'NOTA > winning margin' seat list.
    Returns empty `decided` list when per-AC NOTA hasn't been ingested yet."""
    # Sum of per-AC NOTA we ingested into NotaPerAC.
    total_nota = session.exec(
        select(func.coalesce(func.sum(NotaPerAC.votes), 0))
        .where(NotaPerAC.state_slug == state).where(NotaPerAC.year == 2026)
    ).first() or 0

    # State-wide polled votes — sum every candidate's votes + the NOTA total.
    cand_total = session.exec(
        select(func.coalesce(func.sum(Candidate.votes), 0))
        .join(Constituency, Constituency.id == Candidate.constituency_id)
        .where(Constituency.state_slug == state)
    ).first() or 0
    polled = cand_total + total_nota
    nota_pct = round(total_nota / polled * 100, 2) if polled else 0

    # NOTA-decided seats: ACs where NOTA votes > winner's margin.
    # In each such seat, if the NOTA voters had voted for the runner-up the
    # result *could* have changed. Strong "voter dissatisfaction matters" signal.
    decided: list[dict] = []
    nota_rows = {
        n.ac_number: n.votes
        for n in session.exec(
            select(NotaPerAC).where(NotaPerAC.state_slug == state).where(NotaPerAC.year == 2026)
        ).all()
    }
    cons = session.exec(select(Constituency).where(Constituency.state_slug == state)).all()
    for con in cons:
        nota_votes = nota_rows.get(con.ac_number, 0)
        if nota_votes <= 0:
            continue
        winner = session.exec(
            select(Candidate).where(Candidate.constituency_id == con.id).where(Candidate.is_winner == True)
        ).first()
        if not winner:
            continue
        runner_up_votes = session.exec(
            select(func.coalesce(func.max(Candidate.votes), 0))
            .where(Candidate.constituency_id == con.id).where(Candidate.is_winner == False)
        ).first() or 0
        margin = winner.votes - runner_up_votes
        if margin > 0 and nota_votes > margin:
            decided.append({
                "ac_number": con.ac_number,
                "name": con.name,
                "district": con.district,
                "winner": winner.name,
                "winner_party": winner.party,
                "winner_votes": winner.votes,
                "margin": margin,
                "nota_votes": nota_votes,
                # How many times bigger NOTA was than the margin — a "shock factor"
                "nota_over_margin_x": round(nota_votes / margin, 2),
            })
    # Sort by largest "shock factor" first (NOTA wildly exceeded margin).
    decided.sort(key=lambda d: -d["nota_over_margin_x"])

    return {
        "total_nota_votes": int(total_nota),
        "polled_votes": int(polled),
        "nota_share_pct": nota_pct,
        "nota_decided_count": len(decided),
        "nota_decided_seats": decided,
        # Coverage caveat for the frontend — when 0, we haven't ingested per-AC NOTA for this state.
        "per_ac_coverage": sum(1 for v in nota_rows.values() if v >= 0),
    }
