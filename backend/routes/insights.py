"""
Rule-based, zero-dependency replacements for the AI-powered features.
Same UX surface (state-story, compare, quick-answers) but everything is
computed deterministically from the existing data — no external API calls,
no API keys, no per-request cost, no network round-trips.

Endpoints:
  GET  /api/insights/state-story/{state}     — templated 2-paragraph narrative
  POST /api/insights/compare                 — structured side-by-side analysis
  GET  /api/insights/quick-answers/{state}   — pre-computed answers to common questions
"""
from __future__ import annotations

from typing import Any, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session

from backend.config.states import STATE_CONFIG
from backend.db import get_session
from backend.routes.candidates import party_analytics, list_candidates
from backend.routes.constituencies import list_constituencies, constituency_detail
from backend.routes.overview import state_overview
from backend.routes.swing import district_swing, swing_analysis

router = APIRouter()


# ─────────────────────────  /insights/state-story/{state}  ─────────────────────────

def _fmt_int(n: int | float) -> str:
    """Indian-style comma grouping for the narrative text."""
    if n is None:
        return "—"
    return f"{int(n):,}".replace(",", ",")  # Python's locale-agnostic default; close enough


def _build_state_story(state: str, session: Session) -> dict:
    """
    Build a TIGHT 1–2 sentence headline summary of the state. The Key Insights
    card below already enumerates the details; this card just sets the scene.
    Returns the headline + an optional tagline so the frontend can render them
    with different typography weights.
    """
    cfg = STATE_CONFIG[state]
    ov = state_overview(state, session)
    swing = swing_analysis(state, session)

    alliances = sorted(ov["alliances"], key=lambda a: -a["seats"])
    top = alliances[0] if alliances else None
    gov = ov.get("government_formation")
    total_seats = ov["total_seats"]
    majority = ov["majority"]

    # ── Headline: outcome + (if applicable) CM ──
    if gov:
        primary_name = gov["primary_alliance_name"].split("(")[0].strip()
        headline = (
            f"{primary_name} formed the government in {cfg['name']} with "
            f"{gov['primary_seats']} of {total_seats} seats"
        )
        extras = []
        if gov["coalition_seats"]:
            extras.append(f"+{gov['coalition_seats']} from coalition partners")
        if gov["outside_support_seats"]:
            extras.append(f"+{gov['outside_support_seats']} from outside support")
        if extras:
            headline += f" ({', '.join(extras)})"
        headline += "."
        cm = gov.get("chief_minister")
        if cm:
            headline = f"{cm} ({primary_name}) was sworn in as Chief Minister of {cfg['name']}, after the alliance secured {gov['total_supporting']} of {total_seats} seats."
    elif top:
        top_clean = top["name"].split("(")[0].strip()
        if top["seats"] >= majority:
            buffer_ = top["seats"] - majority
            descriptor = "in a landslide" if buffer_ >= 30 else "comfortably" if buffer_ >= 10 else "by a whisker"
            headline = (
                f"{top_clean} won {cfg['name']} {descriptor} — "
                f"{top['seats']} of {total_seats} seats, {buffer_} above the {majority}-seat majority."
            )
        else:
            short_by = majority - top["seats"]
            headline = (
                f"{cfg['name']} returned a hung verdict — {top_clean} was the largest bloc "
                f"with {top['seats']} of {total_seats} seats, {short_by} short of majority."
            )
    else:
        headline = f"Results from {cfg['name']} are still being declared."

    # ── Tagline: pick ONE most-interesting shift ──
    meaningful_swing = [
        p for p in swing.get("swing", [])
        if p["party"] not in ("OTHERS", "NOTA") and (p["seats_2026"] > 0 or p["seats_2021"] > 0)
    ]
    tagline = ""
    if meaningful_swing:
        sorted_by_gain = sorted(meaningful_swing, key=lambda p: -p["seat_change"])
        gainer = sorted_by_gain[0]
        loser = sorted_by_gain[-1]
        if gainer["seat_change"] >= 5 and loser["seat_change"] <= -5:
            tagline = (
                f"{gainer['party']} surged from {gainer['seats_2021']} to {gainer['seats_2026']} seats; "
                f"{loser['party']} collapsed from {loser['seats_2021']} to {loser['seats_2026']}."
            )
        elif gainer["seat_change"] >= 5:
            tagline = (
                f"{gainer['party']} was the big gainer ({gainer['seats_2021']} → {gainer['seats_2026']})."
            )

    return {
        "state": state,
        "headline": headline,
        "tagline": tagline,
        # Keep `story` for backwards compatibility (frontend may still read it).
        "story": f"{headline} {tagline}".strip(),
        "method": "rule-based",
    }


@router.get("/insights/state-story/{state}")
def state_story(state: str, session: Session = Depends(get_session)):
    if state not in STATE_CONFIG:
        raise HTTPException(404, "Unknown state")
    return _build_state_story(state, session)


# ─────────────────────────  /insights/compare  ─────────────────────────

class CompareSide(BaseModel):
    kind: Literal["party", "district", "constituency"]
    state: str
    value: str           # party abbr / district name / AC name


class CompareRequest(BaseModel):
    a: CompareSide
    b: CompareSide


def _party_snapshot(state: str, abbr: str, session: Session) -> dict:
    if state not in STATE_CONFIG:
        raise HTTPException(400, f"Unknown state '{state}'")
    pa = party_analytics(state, session)
    row = next((p for p in pa.get("parties", []) if p["party"].upper() == abbr.upper()), None)
    if not row:
        raise HTTPException(404, f"Party '{abbr}' not found in {state}")
    return {
        "label": f"{row['party']} · {STATE_CONFIG[state]['name']}",
        "color": row.get("color"),
        "stats": {
            "Seats won": row.get("won", 0),
            "Seats contested": row.get("contested", 0),
            "Strike rate": f"{row.get('strike_rate', 0)}%",
            "Total votes": row.get("total_votes", 0),
            "Votes per seat won": row.get("votes_per_seat") or 0,
            "Districts won": row.get("districts_won_count", 0),
            "Top stronghold": (
                f"{row['top_district_name']} ({row.get('top_district_seats', 0)} seats)"
                if row.get("top_district_name") else "—"
            ),
            "Avg candidate age": f"{row['avg_age']} yrs" if row.get("avg_age") else "—",
            "Candidates with criminal cases": f"{row.get('candidates_with_criminal', 0)} ({row.get('criminal_pct', 0)}%)",
            "Avg assets (cr)": f"₹{row['avg_assets_cr']} cr" if row.get("avg_assets_cr") is not None else "—",
        },
        "raw": row,
        "kind": "party",
    }


def _district_snapshot(state: str, name: str, session: Session) -> dict:
    rows = list_constituencies(state, district=name, party=None, session=session)
    if not rows:
        raise HTTPException(404, f"District '{name}' has no constituencies in {state}")
    decided = [r for r in rows if r.get("party")]
    total_votes = sum(r.get("votes", 0) for r in decided)
    by_party: dict[str, int] = {}
    for r in decided:
        by_party[r["party"]] = by_party.get(r["party"], 0) + 1
    top_party = max(by_party.items(), key=lambda kv: kv[1]) if by_party else (None, 0)
    margins = sorted([r["margin"] for r in decided if r.get("margin") is not None])
    return {
        "label": f"{name} · {STATE_CONFIG[state]['name']}",
        "color": "#94a3b8",
        "stats": {
            "Constituencies": len(rows),
            "Declared": len(decided),
            "Top party": f"{top_party[0]} ({top_party[1]} seats)" if top_party[0] else "—",
            "Parties winning seats": len(by_party),
            "Total votes polled": total_votes,
            "Narrowest win margin": min(margins) if margins else "—",
            "Widest win margin": max(margins) if margins else "—",
            "Avg vote share of winner": (
                f"{sum(r.get('vote_share', 0) for r in decided) / len(decided):.1f}%"
                if decided else "—"
            ),
        },
        "raw": {"district": name, "rows": rows},
        "kind": "district",
    }


def _ac_snapshot(state: str, ac_name_or_number: str, session: Session) -> dict:
    rows = list_constituencies(state, district=None, party=None, session=session)
    match = None
    if ac_name_or_number.isdigit():
        match = next((r for r in rows if r["ac_number"] == int(ac_name_or_number)), None)
    if not match:
        norm = ac_name_or_number.upper().strip()
        match = next((r for r in rows if (r["name"] or "").upper() == norm), None)
    if not match:
        raise HTTPException(404, f"Constituency '{ac_name_or_number}' not found in {state}")
    detail = constituency_detail(state, match["ac_number"], session)
    return {
        "label": f"AC {match['ac_number']} · {match['name']} ({STATE_CONFIG[state]['name']})",
        "color": match.get("color") or "#94a3b8",
        "stats": {
            "District": match.get("district") or "—",
            "Winner": match.get("winner") or "—",
            "Winning party": match.get("party") or "—",
            "Winning alliance": match.get("alliance") or "—",
            "Votes (winner)": match.get("votes", 0),
            "Win margin": match.get("margin", 0),
            "Vote share (winner)": f"{match.get('vote_share', 0)}%",
            "Total votes polled": match.get("total_votes", 0),
            "Candidates contested": match.get("candidate_count") or len(detail.get("candidates", [])),
            "Runner-up": (
                f"{match.get('runner_up') or '—'} ({match.get('runner_up_party') or '—'})"
                if match.get("runner_up") else "—"
            ),
        },
        "raw": {"summary": match, "detail": detail},
        "kind": "constituency",
    }


def _snapshot(side: CompareSide, session: Session) -> dict:
    if side.kind == "party":
        return _party_snapshot(side.state, side.value, session)
    if side.kind == "district":
        return _district_snapshot(side.state, side.value, session)
    return _ac_snapshot(side.state, side.value, session)


def _verdict(a: dict, b: dict) -> str:
    """One-sentence summary picking the most diagnostic difference."""
    if a["kind"] == "party" and b["kind"] == "party":
        ar, br = a["raw"], b["raw"]
        if ar["won"] != br["won"]:
            higher, lower = (a, b) if ar["won"] > br["won"] else (b, a)
            hr, lr = higher["raw"], lower["raw"]
            return (
                f"{hr['party']} won more seats ({hr['won']} vs {lr['won']}), "
                f"and at a higher strike rate ({hr['strike_rate']}% vs {lr['strike_rate']}%)."
                if hr.get("strike_rate", 0) > lr.get("strike_rate", 0)
                else f"{hr['party']} won more seats ({hr['won']} vs {lr['won']}), "
                     f"despite a lower strike rate ({hr['strike_rate']}% vs {lr['strike_rate']}%)."
            )
        # Same seats — fall back to vote share / strike rate
        if ar.get("strike_rate", 0) != br.get("strike_rate", 0):
            higher = a if ar["strike_rate"] > br["strike_rate"] else b
            return f"Tied on seats, but {higher['raw']['party']} converted more efficiently ({higher['raw']['strike_rate']}% strike rate)."
        return f"Near-identical outcomes between {ar['party']} and {br['party']}."

    if a["kind"] == "district" and b["kind"] == "district":
        ar, br = a["raw"], b["raw"]
        a_decided = [r for r in ar["rows"] if r.get("party")]
        b_decided = [r for r in br["rows"] if r.get("party")]
        if len(a_decided) != len(b_decided):
            bigger = a if len(a_decided) > len(b_decided) else b
            return (
                f"{bigger['raw']['district']} is the larger district "
                f"({len(bigger['raw']['rows'])} ACs vs the other)."
            )
        return f"{ar['district']} and {br['district']} are similarly sized; check the per-party split below for divergence."

    if a["kind"] == "constituency" and b["kind"] == "constituency":
        ar, br = a["raw"]["summary"], b["raw"]["summary"]
        if ar.get("margin", 0) != br.get("margin", 0):
            closer = a if (ar.get("margin", 0) or 10**9) < (br.get("margin", 0) or 10**9) else b
            rs = closer["raw"]["summary"]
            return f"{rs['name']} was the closer contest (margin {rs['margin']:,} vs the other)."
        return f"Both {ar['name']} and {br['name']} were decided by similar margins."

    return "Cross-type comparison — see the side-by-side table for the diagnostic numbers."


@router.post("/insights/compare")
def compare(req: CompareRequest, session: Session = Depends(get_session)):
    a = _snapshot(req.a, session)
    b = _snapshot(req.b, session)
    # Union of keys to render in side-by-side order from `a`'s natural order.
    keys: list[str] = list(a["stats"].keys())
    for k in b["stats"].keys():
        if k not in keys:
            keys.append(k)
    rows = [
        {"label": k, "a": a["stats"].get(k, "—"), "b": b["stats"].get(k, "—")}
        for k in keys
    ]
    return {
        "a": {"label": a["label"], "color": a["color"], "kind": a["kind"]},
        "b": {"label": b["label"], "color": b["color"], "kind": b["kind"]},
        "rows": rows,
        "verdict": _verdict(a, b),
        "method": "rule-based",
    }


# ─────────────────────────  /insights/quick-answers/{state}  ─────────────────────────
# A curated set of "common questions" the user can click to get an answer.
# Each item is a self-contained {label, answer} so the frontend doesn't have to
# repeat any computation.

def _quick_answers_for(state: str, session: Session) -> list[dict]:
    cfg = STATE_CONFIG[state]
    ov = state_overview(state, session)
    swing = swing_analysis(state, session)
    cons = list_constituencies(state, district=None, party=None, session=session)
    pa = party_analytics(state, session)

    answers: list[dict] = []

    # 1. Closest contest
    decided = [c for c in cons if c.get("party") and c.get("margin", 0) > 0]
    if decided:
        closest = min(decided, key=lambda c: c["margin"])
        answers.append({
            "emoji": "🎯",
            "label": f"Closest contest in {cfg['name']}",
            "answer": (
                f"{closest['name']} (AC {closest['ac_number']}) — decided by just "
                f"{closest['margin']:,} vote{'s' if closest['margin'] != 1 else ''}. "
                f"{closest['winner']} ({closest['party']}) edged out the runner-up."
            ),
            "link": f"/{state}/constituencies/{closest['ac_number']}",
        })
        # 2. Biggest landslide
        biggest = max(decided, key=lambda c: c["margin"])
        answers.append({
            "emoji": "🏆",
            "label": f"Biggest landslide in {cfg['name']}",
            "answer": (
                f"{biggest['name']} (AC {biggest['ac_number']}) — won by {biggest['margin']:,} votes. "
                f"{biggest['winner']} ({biggest['party']}) took {biggest['vote_share']}% of the vote share."
            ),
            "link": f"/{state}/constituencies/{biggest['ac_number']}",
        })
        # 3. Most votes for any candidate
        top_vote = max(decided, key=lambda c: c.get("votes", 0))
        answers.append({
            "emoji": "📊",
            "label": f"Highest individual vote total in {cfg['name']}",
            "answer": (
                f"{top_vote['winner']} ({top_vote['party']}) polled {top_vote['votes']:,} votes "
                f"in {top_vote['name']} — the most any single candidate received in the state."
            ),
            "link": f"/{state}/constituencies/{top_vote['ac_number']}",
        })

    # 4. Largest single party
    parties_sorted = sorted([p for p in ov["parties"] if p["seats"] > 0], key=lambda p: -p["seats"])
    if parties_sorted:
        lp = parties_sorted[0]
        answers.append({
            "emoji": "🥇",
            "label": f"Single largest party in {cfg['name']}",
            "answer": f"{lp['party']} with {lp['seats']} of {ov['total_seats']} seats ({lp['full_name']}).",
            "link": f"/{state}/parties",
        })

    # 5. Best strike rate
    meaningful = [p for p in pa.get("parties", []) if p.get("contested", 0) >= 5]
    if meaningful:
        best_sr = max(meaningful, key=lambda p: p.get("strike_rate", 0))
        answers.append({
            "emoji": "🎯",
            "label": f"Best strike rate in {cfg['name']} (≥5 contests)",
            "answer": (
                f"{best_sr['party']} — {best_sr.get('strike_rate', 0)}% "
                f"({best_sr['won']} of {best_sr['contested']} won)."
            ),
            "link": f"/{state}/parties",
        })
        # 6. Most-vote-efficient party (lowest votes per seat won)
        efficient = [p for p in meaningful if p.get("won", 0) >= 3 and p.get("votes_per_seat")]
        if efficient:
            eff = min(efficient, key=lambda p: p["votes_per_seat"])
            answers.append({
                "emoji": "⚡",
                "label": f"Most vote-efficient party in {cfg['name']}",
                "answer": (
                    f"{eff['party']} needed only {int(eff['votes_per_seat']):,} votes per seat won "
                    f"— the lowest of any party with ≥3 wins."
                ),
                "link": f"/{state}/parties",
            })

    # 7. Biggest gainer / loser vs 2021
    sw = [p for p in swing.get("swing", []) if p["party"] not in ("OTHERS", "NOTA")]
    if sw:
        sorted_sw = sorted(sw, key=lambda p: -p["seat_change"])
        gainer = sorted_sw[0]
        if gainer["seat_change"] >= 3:
            answers.append({
                "emoji": "📈",
                "label": f"Biggest seat gainer vs 2021 in {cfg['name']}",
                "answer": (
                    f"{gainer['party']} added {gainer['seat_change']} seats "
                    f"({gainer['seats_2021']} → {gainer['seats_2026']})."
                ),
                "link": f"/{state}/swing",
            })
        loser = sorted_sw[-1]
        if loser["seat_change"] <= -3:
            answers.append({
                "emoji": "📉",
                "label": f"Biggest seat loser vs 2021 in {cfg['name']}",
                "answer": (
                    f"{loser['party']} lost {abs(loser['seat_change'])} seats "
                    f"({loser['seats_2021']} → {loser['seats_2026']})."
                ),
                "link": f"/{state}/swing",
            })

    # 8. Hung / clear status
    alliances_sorted = sorted(ov["alliances"], key=lambda a: -a["seats"])
    if alliances_sorted:
        top_a = alliances_sorted[0]
        if top_a["seats"] >= ov["majority"]:
            answers.append({
                "emoji": "🏛️",
                "label": f"Who forms government in {cfg['name']}?",
                "answer": (
                    f"{top_a['name']} — won {top_a['seats']} of {ov['total_seats']} seats, "
                    f"clearing the {ov['majority']}-seat majority by {top_a['seats'] - ov['majority']}."
                ),
                "link": f"/{state}/overview",
            })
        else:
            short = ov["majority"] - top_a["seats"]
            answers.append({
                "emoji": "⚖️",
                "label": f"Who forms government in {cfg['name']}?",
                "answer": (
                    f"Hung — {top_a['name']} is the largest bloc with {top_a['seats']} seats, "
                    f"but {short} short of the {ov['majority']}-seat majority."
                ),
                "link": f"/{state}/overview",
            })

    # 9. Richest MLA in the state
    rich_winners = list_candidates(
        state=state, search=None, party=None, ac_number=None, constituency=None,
        district=None, gender=None, criminal=None, winners_only=True, top_n=None,
        sort_by="votes_desc", offset=0, limit=500, session=session,
    )
    cands_with_assets = [
        c for c in rich_winners.get("candidates", [])
        if c.get("assets_cr") is not None
    ]
    if cands_with_assets:
        rich = max(cands_with_assets, key=lambda c: c["assets_cr"])
        answers.append({
            "emoji": "💰",
            "label": f"Wealthiest winning MLA in {cfg['name']}",
            "answer": (
                f"{rich['name']} ({rich['party']}, AC {rich['ac_number']} {rich['constituency']}) "
                f"declared ₹{rich['assets_cr']} crore in assets."
            ),
            "link": f"/{state}/constituencies/{rich['ac_number']}",
        })
        # 10. Most criminal cases (winner)
        with_crim = [c for c in rich_winners.get("candidates", []) if (c.get("criminal_cases") or 0) > 0]
        if with_crim:
            top_crim = max(with_crim, key=lambda c: c["criminal_cases"])
            answers.append({
                "emoji": "⚖️",
                "label": f"Most criminal cases (winning MLA) in {cfg['name']}",
                "answer": (
                    f"{top_crim['name']} ({top_crim['party']}, AC {top_crim['ac_number']} {top_crim['constituency']}) "
                    f"— {top_crim['criminal_cases']} criminal case{'s' if top_crim['criminal_cases'] != 1 else ''} on record."
                ),
                "link": f"/{state}/constituencies/{top_crim['ac_number']}",
            })
        # 11. Youngest winner
        with_age = [c for c in rich_winners.get("candidates", []) if c.get("age")]
        if with_age:
            youngest = min(with_age, key=lambda c: c["age"])
            answers.append({
                "emoji": "👶",
                "label": f"Youngest winning MLA in {cfg['name']}",
                "answer": (
                    f"{youngest['name']} ({youngest['party']}, age {youngest['age']}) "
                    f"won AC {youngest['ac_number']} {youngest['constituency']}."
                ),
                "link": f"/{state}/constituencies/{youngest['ac_number']}",
            })
            oldest = max(with_age, key=lambda c: c["age"])
            answers.append({
                "emoji": "🎓",
                "label": f"Oldest winning MLA in {cfg['name']}",
                "answer": (
                    f"{oldest['name']} ({oldest['party']}, age {oldest['age']}) "
                    f"won AC {oldest['ac_number']} {oldest['constituency']}."
                ),
                "link": f"/{state}/constituencies/{oldest['ac_number']}",
            })

    return answers


@router.get("/insights/quick-answers/{state}")
def quick_answers(state: str, session: Session = Depends(get_session)):
    if state not in STATE_CONFIG:
        raise HTTPException(404, "Unknown state")
    return {"state": state, "answers": _quick_answers_for(state, session)}


@router.get("/insights/quick-answers")
def quick_answers_default(session: Session = Depends(get_session)):
    """Cross-state quick-answers — picks the first declared state if no specific one is given.
    Mostly a convenience so the launcher can show something useful before the user picks a state."""
    declared = [slug for slug, cfg in STATE_CONFIG.items() if cfg.get("status") != "upcoming"]
    if not declared:
        return {"state": None, "answers": []}
    state = declared[0]
    return {"state": state, "answers": _quick_answers_for(state, session)}
