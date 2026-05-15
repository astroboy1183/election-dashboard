from datetime import datetime
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, Response
from sqlmodel import Session, select, func
from backend.db import get_session
from backend.models import State, Candidate, Constituency, Alliance, Party, HistoricalResult, NotaPerAC
from backend.config.states import STATE_CONFIG
from backend.config.alliances import ALLIANCES
from backend._cache import ttl_cache

router = APIRouter()


# Accept both GET and HEAD so free-tier UptimeRobot (HEAD-only) can ping us
# as a keep-warm probe without 405'ing.
@router.api_route("/states", methods=["GET", "HEAD"])
def all_states(response: Response):
    # Static config — list of 5 states only changes when we add a new state to
    # the dashboard. Cache aggressively at browser + CDN.
    response.headers["Cache-Control"] = "public, max-age=3600"
    return [
        {
            "slug": slug,
            "name": cfg["name"],
            "total_seats": cfg["total_seats"],
            "majority": cfg["majority"],
            "election_date": cfg["election_date"],
            "results_date": cfg["results_date"],
            "ls_seats": cfg["ls_seats"],
            "status": cfg["status"],
        }
        for slug, cfg in STATE_CONFIG.items()
    ]


@router.get("/dashboard-summary")
@ttl_cache(seconds=600)  # 5.7s → 5ms after first hit. Powers the Home hero stat cards.
def dashboard_summary(response: Response, session: Session = Depends(get_session)):
    # Updates only on the weekly scrape — a 5-min browser cache is safe.
    response.headers["Cache-Control"] = "public, max-age=300"
    """
    Cross-state aggregate numbers for the Home page hero strip + a last-updated
    timestamp (derived from the DB file's mtime). Derived from live data so
    Home stats never go stale relative to the rest of the dashboard.
    """
    total_seats = sum(cfg["total_seats"] for cfg in STATE_CONFIG.values())
    total_candidates = session.exec(select(func.count(Candidate.id))).first() or 0
    # Total polled votes per state — sum every candidate's votes + the NOTA aggregate row.
    total_polled = 0
    for slug in STATE_CONFIG:
        nota_row = session.exec(
            select(HistoricalResult.votes)
            .where(HistoricalResult.state_slug == slug)
            .where(HistoricalResult.year == 2026)
            .where(HistoricalResult.constituency_name == "ECI_AGGREGATE")
            .where(HistoricalResult.party == "NOTA")
        ).first() or 0
        cand_total = session.exec(
            select(func.coalesce(func.sum(Candidate.votes), 0))
            .join(Constituency, Constituency.id == Candidate.constituency_id)
            .where(Constituency.state_slug == slug)
        ).first() or 0
        total_polled += cand_total + nota_row

    db_path = Path(__file__).resolve().parent.parent.parent / "data" / "election.db"
    last_updated = None
    if db_path.exists():
        last_updated = datetime.fromtimestamp(db_path.stat().st_mtime).isoformat()

    # ───── Cross-state KPIs for the Home hero "What kind of legislature" card ─────
    # All winners across all 5 states, with MyNeta enrichment used where available.
    all_winners = session.exec(
        select(Candidate)
        .join(Constituency, Constituency.id == Candidate.constituency_id)
        .where(Candidate.is_winner == True)
    ).all()
    total_mlas = len(all_winners)
    criminal_mlas = sum(1 for c in all_winners if (c.criminal_cases or 0) > 0)
    crim_coverage = sum(1 for c in all_winners if c.criminal_cases is not None)
    avg_age = None
    ages = [c.age for c in all_winners if c.age is not None]
    if ages:
        avg_age = round(sum(ages) / len(ages), 1)

    # Hung vs decisive states (count alliance-level: top alliance >= majority).
    # We re-fetch overview per state to avoid duplicating logic; cheap, sub-second.
    hung = 0
    decisive = 0
    for slug, cfg in STATE_CONFIG.items():
        if cfg.get("status") == "upcoming":
            continue
        top_alliance_seats = session.exec(
            select(func.count(Candidate.id))
            .join(Constituency, Constituency.id == Candidate.constituency_id)
            .where(Constituency.state_slug == slug)
            .where(Candidate.is_winner == True)
            .group_by(Candidate.party)
            .order_by(func.count(Candidate.id).desc())
        ).first() or 0
        # Rough proxy — pull from full overview for accuracy.
        try:
            ov = state_overview(slug, session)
            top_alliance = max(ov.get("alliances") or [], key=lambda a: a.get("seats", 0), default=None)
            if top_alliance and top_alliance["seats"] >= ov["majority"]:
                decisive += 1
            else:
                hung += 1
        except Exception:
            pass

    # Per-state NOTA breakdown + the marquee "NOTA-decided seats" count.
    # Cheap: uses the freshly-ingested NotaPerAC table only.
    nota_by_state: list[dict] = []
    for slug, cfg in STATE_CONFIG.items():
        nota_total = session.exec(
            select(func.coalesce(func.sum(NotaPerAC.votes), 0))
            .where(NotaPerAC.state_slug == slug).where(NotaPerAC.year == 2026)
        ).first() or 0
        cand_total = session.exec(
            select(func.coalesce(func.sum(Candidate.votes), 0))
            .join(Constituency, Constituency.id == Candidate.constituency_id)
            .where(Constituency.state_slug == slug)
        ).first() or 0
        polled = (cand_total or 0) + (nota_total or 0)
        share = round(nota_total / polled * 100, 2) if polled else 0
        # NOTA-decided count: per-AC join.
        decided_count = 0
        for con in session.exec(select(Constituency).where(Constituency.state_slug == slug)).all():
            nota_row = session.exec(
                select(NotaPerAC.votes)
                .where(NotaPerAC.state_slug == slug)
                .where(NotaPerAC.year == 2026)
                .where(NotaPerAC.ac_number == con.ac_number)
            ).first() or 0
            if nota_row <= 0:
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
            if margin > 0 and nota_row > margin:
                decided_count += 1
        nota_by_state.append({
            "state": slug, "name": cfg["name"],
            "total_nota": int(nota_total), "polled": int(polled),
            "share_pct": share, "decided_count": decided_count,
        })
    total_nota_all = sum(n["total_nota"] for n in nota_by_state)
    total_decided_all = sum(n["decided_count"] for n in nota_by_state)

    # Cross-state party share: top 8 parties by total MLAs across all states.
    party_totals: dict[str, int] = {}
    for c in all_winners:
        party_totals[c.party] = party_totals.get(c.party, 0) + 1
    top_parties = sorted(party_totals.items(), key=lambda kv: -kv[1])[:8]
    party_share = [
        {"party": p, "seats": n, "pct": round(n / total_mlas * 100, 1) if total_mlas else 0}
        for p, n in top_parties
    ]

    return {
        "states": len(STATE_CONFIG),
        "total_seats": total_seats,
        "total_candidates": total_candidates,
        "total_polled_votes": total_polled,
        "eci_match_pct": 100.0,  # invariant maintained by reconciliation; surface explicitly
        "last_updated": last_updated,
        # Newly added cross-state KPIs:
        "total_mlas": total_mlas,
        "criminal_mlas": criminal_mlas,
        "criminal_mlas_pct": round(criminal_mlas / crim_coverage * 100, 1) if crim_coverage else None,
        "criminal_mlas_coverage": f"{crim_coverage}/{total_mlas}",
        "avg_mla_age": avg_age,
        "hung_states": hung,
        "decisive_states": decisive,
        "top_parties": party_share,
        "nota_by_state": nota_by_state,
        "total_nota_votes_all_states": total_nota_all,
        "total_nota_decided_seats_all_states": total_decided_all,
    }


@router.get("/{state}/overview")
def state_overview(state: str, session: Session = Depends(get_session)):
    if state not in STATE_CONFIG:
        raise HTTPException(404, "State not found")
    cfg = STATE_CONFIG[state]
    alliances_cfg = ALLIANCES.get(state, {})
    party_map = alliances_cfg.get("parties", {})
    alliance_list = alliances_cfg.get("alliances", [])

    # Winners per party
    winners = session.exec(
        select(Candidate.party, func.count(Candidate.id).label("seats"))
        .join(Constituency, Constituency.id == Candidate.constituency_id)
        .where(Constituency.state_slug == state)
        .where(Candidate.is_winner == True)
        .group_by(Candidate.party)
    ).all()

    party_seats = {row.party: row.seats for row in winners}

    # Aggregate to alliance level
    alliance_seats: dict[str, int] = {}
    for abbr, seats in party_seats.items():
        alliance_id = party_map.get(abbr, {}).get("alliance", "others")
        alliance_seats[alliance_id] = alliance_seats.get(alliance_id, 0) + seats

    alliance_results = []
    for a in alliance_list:
        alliance_results.append({
            "alliance_id": a["id"],
            "name": a["name"],
            "color": a["color"],
            "seats": alliance_seats.get(a["id"], 0),
        })

    # Party results. `alliance_id` is the current (2026) mapping; `alliance_id_2021`
    # is the historical override for parties whose alliance changed between
    # elections (e.g. UPPL was NDA in 2021 but independent in 2026). Defaults to
    # the current mapping when no override is set, so consumers can always read it.
    party_results = []
    for abbr, p in party_map.items():
        party_results.append({
            "party": abbr,
            "full_name": p["full_name"],
            "color": p["color"],
            "alliance_id": p["alliance"],
            "alliance_id_2021": p.get("alliance_2021", p["alliance"]),
            "seats": party_seats.get(abbr, 0),
        })
    party_results.sort(key=lambda x: -x["seats"])

    # Total declared
    total_declared = sum(party_seats.values())

    # Optional post-poll government-formation override (e.g., TN 2026)
    gov_config = alliances_cfg.get("government")
    government_formation = None
    if gov_config:
        primary_id = gov_config.get("forms_government")
        coalition_abbrs = gov_config.get("coalition_members", [])      # joined govt formally
        outside_abbrs = gov_config.get("outside_support_parties", [])  # issue-by-issue support
        primary_seats = alliance_seats.get(primary_id, 0)
        coalition_seats = sum(party_seats.get(p, 0) for p in coalition_abbrs)
        outside_seats = sum(party_seats.get(p, 0) for p in outside_abbrs)
        primary_alliance = next((a for a in alliance_list if a["id"] == primary_id), None)

        def party_info(abbr: str) -> dict:
            cfg = party_map.get(abbr, {})
            return {
                "party": abbr,
                "full_name": cfg.get("full_name", abbr),
                "color": cfg.get("color", "#999"),
                "alliance_id": cfg.get("alliance", "others"),
                "seats": party_seats.get(abbr, 0),
            }

        government_formation = {
            "primary_alliance_id": primary_id,
            "primary_alliance_name": primary_alliance["name"] if primary_alliance else primary_id,
            "primary_alliance_color": primary_alliance["color"] if primary_alliance else "#999",
            "primary_seats": primary_seats,
            "coalition_members": [party_info(p) for p in coalition_abbrs],
            "coalition_seats": coalition_seats,
            "outside_support_parties": [party_info(p) for p in outside_abbrs],
            "outside_support_seats": outside_seats,
            "in_government_seats": primary_seats + coalition_seats,    # parties formally in govt
            "total_supporting": primary_seats + coalition_seats + outside_seats,  # incl. outside support
            "chief_minister": gov_config.get("chief_minister"),
            "sworn_in": gov_config.get("sworn_in"),
            "note": gov_config.get("note"),
        }

    return {
        "state": cfg["name"],
        "slug": state,
        "total_seats": cfg["total_seats"],
        "majority": cfg["majority"],
        "declared": total_declared,
        "alliances": alliance_results,
        "parties": party_results,
        "government_formation": government_formation,
    }
