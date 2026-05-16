from datetime import datetime
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, Response
from sqlmodel import Session, select, func
from sqlalchemy import case, text
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
        # NOTA-decided seats: per-AC join. Now we also collect the seat details
        # so the Home page can pop a modal listing them on click.
        decided_seats: list[dict] = []
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
                decided_seats.append({
                    "ac_number": con.ac_number,
                    "ac_name": con.name,
                    "district": con.district,
                    "winner": winner.name,
                    "party": winner.party,
                    "margin": int(margin),
                    "nota_votes": int(nota_row),
                })
        # Sort by NOTA/margin ratio descending — "most NOTA-decided" first.
        decided_seats.sort(key=lambda s: -s["nota_votes"] / max(s["margin"], 1))
        nota_by_state.append({
            "state": slug, "name": cfg["name"],
            "total_nota": int(nota_total), "polled": int(polled),
            "share_pct": share,
            "decided_count": len(decided_seats),
            "decided_seats": decided_seats,
        })
    total_nota_all = sum(n["total_nota"] for n in nota_by_state)
    total_decided_all = sum(n["decided_count"] for n in nota_by_state)

    # Cross-state party share: top 8 parties by total MLAs across all states,
    # with 2021 baseline so the Home page can show "+47 vs 2021" deltas.
    party_totals_2026: dict[str, int] = {}
    for c in all_winners:
        party_totals_2026[c.party] = party_totals_2026.get(c.party, 0) + 1
    # 2021 seat count per party — from HistoricalResult.is_winner across the
    # 5 covered states. Note: 2021 alliance affiliations differed but a raw
    # seat count is what the UI displays, so the comparison is apples-to-apples.
    rows_2021 = session.exec(
        select(HistoricalResult.party, func.count(HistoricalResult.id))
        .where(HistoricalResult.year == 2021)
        .where(HistoricalResult.is_winner == True)
        .group_by(HistoricalResult.party)
    ).all()
    party_totals_2021: dict[str, int] = {p: int(n) for p, n in rows_2021}
    top_parties = sorted(party_totals_2026.items(), key=lambda kv: -kv[1])[:8]
    party_share = [
        {
            "party": p,
            "seats": n,
            "pct": round(n / total_mlas * 100, 1) if total_mlas else 0,
            "seats_2021": party_totals_2021.get(p, 0),
            "delta": n - party_totals_2021.get(p, 0),
        }
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


@router.get("/postal-leads")
@ttl_cache(seconds=600)
def postal_leads(response: Response, session: Session = Depends(get_session)):
    """Per-state postal-ballot breakdown by party.

    The "delta" is the key insight: a party that captures (say) 30% of postal
    votes but only 24% of EVM votes is over-performing among postal voters —
    a cohort dominated by government employees, soldiers, polling staff, and
    others who couldn't reach their booth on polling day. The difference is
    interpretively meaningful (institutional / bureaucratic appeal vs. street
    appeal).
    """
    response.headers["Cache-Control"] = "public, max-age=300"
    states_out = []
    for slug, cfg in STATE_CONFIG.items():
        rows = session.exec(
            select(
                Candidate.party,
                func.coalesce(func.sum(Candidate.evm_votes), 0).label("evm"),
                func.coalesce(func.sum(Candidate.postal_votes), 0).label("postal"),
                func.coalesce(func.sum(Candidate.votes), 0).label("total"),
                func.sum(case((Candidate.is_winner == True, 1), else_=0)).label("wins"),
            )
            .join(Constituency, Constituency.id == Candidate.constituency_id)
            .where(Constituency.state_slug == slug)
            .where(Candidate.postal_votes != None)  # only rows we successfully ingested
            .group_by(Candidate.party)
        ).all()

        # Per-AC postal leader: the party with the highest postal_votes in each AC.
        # SQLite needs a window-function approach. Build it by raw SQL to keep
        # things explicit; the result feeds into the same per-party rollup.
        postal_leader_rows = session.exec(text("""
            WITH ranked AS (
              SELECT c.constituency_id, c.party, c.postal_votes,
                     ROW_NUMBER() OVER (PARTITION BY c.constituency_id ORDER BY c.postal_votes DESC, c.id ASC) AS rk
              FROM candidate c
              JOIN constituency co ON c.constituency_id = co.id
              WHERE co.state_slug = :slug AND c.postal_votes IS NOT NULL AND c.postal_votes > 0
            )
            SELECT party, COUNT(*) AS postal_seats_led
            FROM ranked WHERE rk = 1
            GROUP BY party
        """), params={"slug": slug}).all()
        postal_seats_by_party: dict[str, int] = {row[0]: int(row[1]) for row in postal_leader_rows}

        state_evm_total = sum(r.evm for r in rows)
        state_postal_total = sum(r.postal for r in rows)
        party_rows = []
        for r in rows:
            evm_share = (r.evm / state_evm_total * 100) if state_evm_total else 0
            postal_share = (r.postal / state_postal_total * 100) if state_postal_total else 0
            party_rows.append({
                "party": r.party,
                "evm_votes": int(r.evm),
                "postal_votes": int(r.postal),
                "total_votes": int(r.total),
                "evm_share_pct": round(evm_share, 2),
                "postal_share_pct": round(postal_share, 2),
                "delta_pp": round(postal_share - evm_share, 2),
                "seats_won": int(r.wins or 0),
                "postal_seats_led": postal_seats_by_party.get(r.party, 0),
                "seat_delta": postal_seats_by_party.get(r.party, 0) - int(r.wins or 0),
            })
        # Keep only parties that materially participated (≥0.5% of either share OR led ≥1 seat).
        party_rows = [
            p for p in party_rows
            if p["postal_share_pct"] >= 0.5 or p["evm_share_pct"] >= 0.5 or p["postal_seats_led"] >= 1
        ]
        party_rows.sort(key=lambda p: -p["postal_votes"])
        # Top over- and under-performers (largest |delta| among material parties).
        sorted_by_delta = sorted(party_rows, key=lambda p: p["delta_pp"], reverse=True)
        # Most-divergent party (largest |seat_delta|) — the headline insight for
        # the per-state row on Home.
        sorted_by_seat_delta = sorted(party_rows, key=lambda p: abs(p["seat_delta"]), reverse=True)
        states_out.append({
            "state": slug,
            "name": cfg["name"],
            "postal_total": state_postal_total,
            "evm_total": state_evm_total,
            "postal_share_of_polled": round(state_postal_total / (state_evm_total + state_postal_total) * 100, 2) if (state_evm_total + state_postal_total) else 0,
            "parties": party_rows,
            "top_over_performer": sorted_by_delta[0] if sorted_by_delta else None,
            "top_under_performer": sorted_by_delta[-1] if sorted_by_delta else None,
            "biggest_seat_divergence": sorted_by_seat_delta[0] if sorted_by_seat_delta else None,
        })
    grand_postal = sum(s["postal_total"] for s in states_out)
    grand_evm = sum(s["evm_total"] for s in states_out)
    return {
        "states": states_out,
        "grand_total_postal": grand_postal,
        "grand_total_evm": grand_evm,
        "grand_total_polled": grand_postal + grand_evm,
    }


@router.get("/postal-2021-vs-2026")
@ttl_cache(seconds=600)
def postal_2021_vs_2026(response: Response, session: Session = Depends(get_session)):
    """2021 vs 2026 postal-share comparison per state per party, INCLUDING
    seat-leader counts (ACs each party led in postal votes per year).

    The seat_swing column shows how many ACs of postal-leadership each party
    gained or lost between cycles — the seat-level analogue of the share swing.
    """
    response.headers["Cache-Control"] = "public, max-age=600"
    states_out = []
    for slug, cfg in STATE_CONFIG.items():
        # 2026 totals (per-party postal votes)
        rows_2026 = session.exec(
            select(Candidate.party, func.coalesce(func.sum(Candidate.postal_votes), 0))
            .join(Constituency, Constituency.id == Candidate.constituency_id)
            .where(Constituency.state_slug == slug)
            .where(Candidate.postal_votes != None)
            .group_by(Candidate.party)
        ).all()
        p26 = {p: int(v) for p, v in rows_2026 if v}
        total_2026 = sum(p26.values())

        # 2021 totals (per-party postal votes from HistoricalResult)
        rows_2021 = session.exec(
            select(HistoricalResult.party, func.coalesce(func.sum(HistoricalResult.postal_votes), 0))
            .where(HistoricalResult.state_slug == slug)
            .where(HistoricalResult.year == 2021)
            .where(HistoricalResult.postal_votes != None)
            .group_by(HistoricalResult.party)
        ).all()
        p21 = {p: int(v) for p, v in rows_2021 if v}
        total_2021 = sum(p21.values())

        # Per-AC postal leader → seat counts per party, per year.
        # 2026: window over Candidate table joined with Constituency.
        leaders_2026 = session.exec(text("""
            WITH ranked AS (
              SELECT c.party, c.postal_votes,
                     ROW_NUMBER() OVER (PARTITION BY c.constituency_id ORDER BY c.postal_votes DESC, c.id ASC) AS rk
              FROM candidate c
              JOIN constituency co ON c.constituency_id = co.id
              WHERE co.state_slug = :slug
                AND c.postal_votes IS NOT NULL AND c.postal_votes > 0
            )
            SELECT party, COUNT(*) FROM ranked WHERE rk=1 GROUP BY party
        """), params={"slug": slug}).all()
        seats_2026 = {row[0]: int(row[1]) for row in leaders_2026}

        # 2021: window over HistoricalResult.
        leaders_2021 = session.exec(text("""
            WITH ranked AS (
              SELECT party, postal_votes, ac_number,
                     ROW_NUMBER() OVER (PARTITION BY ac_number ORDER BY postal_votes DESC, id ASC) AS rk
              FROM historicalresult
              WHERE state_slug = :slug AND year = 2021
                AND postal_votes IS NOT NULL AND postal_votes > 0
            )
            SELECT party, COUNT(*) FROM ranked WHERE rk=1 GROUP BY party
        """), params={"slug": slug}).all()
        seats_2021 = {row[0]: int(row[1]) for row in leaders_2021}

        # Build per-party rows
        all_parties = set(p26) | set(p21) | set(seats_2026) | set(seats_2021)
        party_rows = []
        for p in all_parties:
            v21 = p21.get(p, 0); v26 = p26.get(p, 0)
            s21 = v21 / total_2021 * 100 if total_2021 else 0
            s26 = v26 / total_2026 * 100 if total_2026 else 0
            seats21 = seats_2021.get(p, 0)
            seats26 = seats_2026.get(p, 0)
            party_rows.append({
                "party": p,
                "votes_2021": v21, "votes_2026": v26,
                "share_2021_pct": round(s21, 2),
                "share_2026_pct": round(s26, 2),
                "swing_pp": round(s26 - s21, 2),
                "seats_led_2021": seats21,
                "seats_led_2026": seats26,
                "seat_swing": seats26 - seats21,
            })
        # Material parties: ≥1% share in either year OR led ≥1 seat in either year
        party_rows = [
            p for p in party_rows
            if p["share_2021_pct"] >= 1 or p["share_2026_pct"] >= 1
            or p["seats_led_2021"] >= 1 or p["seats_led_2026"] >= 1
        ]
        party_rows.sort(key=lambda p: -p["share_2026_pct"])

        # Top swingers (largest +/- swing pp)
        by_swing = sorted(party_rows, key=lambda p: p["swing_pp"], reverse=True)
        top_gainer = by_swing[0] if by_swing else None
        top_loser = by_swing[-1] if by_swing else None
        # Top seat-swingers (largest +/- seat_swing)
        by_seat = sorted(party_rows, key=lambda p: p["seat_swing"], reverse=True)
        top_seat_gainer = by_seat[0] if by_seat else None
        top_seat_loser = by_seat[-1] if by_seat else None

        states_out.append({
            "state": slug,
            "name": cfg["name"],
            "postal_total_2021": total_2021,
            "postal_total_2026": total_2026,
            "acs_with_postal_2021": sum(seats_2021.values()),
            "acs_with_postal_2026": sum(seats_2026.values()),
            "parties": party_rows,
            "top_gainer": top_gainer,
            "top_loser": top_loser,
            "top_seat_gainer": top_seat_gainer,
            "top_seat_loser": top_seat_loser,
        })
    return {"states": states_out}


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
