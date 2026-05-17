"""
Locally-bounded "Ask the dashboard" endpoint.

A single Anthropic Claude call with a tool registry that wraps THIS
dashboard's read-only data endpoints — and nothing else. The model has no
web-search tool, no other external data sources, and a system prompt that
forbids drawing on outside knowledge. Every answer must come from the data
the tools return.

Endpoint:
  POST /api/ai/ask  — open-ended Q&A, dashboard-data-only

Requires the ANTHROPIC_API_KEY environment variable. Without it the endpoint
returns HTTP 503 so the rest of the dashboard keeps working normally.
"""
from __future__ import annotations

import json
import os
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session

from backend.db import engine, get_session
from backend.config.states import STATE_CONFIG
from backend.routes.overview import state_overview
from backend.routes.swing import swing_analysis, district_swing
from backend.routes.candidates import party_analytics, list_candidates
from backend.routes.constituencies import list_constituencies, constituency_detail

router = APIRouter()

# Lazy-init: import is cheap, instantiation requires the env var to be present.
_client = None
MODEL_FAST = "claude-haiku-4-5"
MODEL_SMART = "claude-sonnet-4-6"


def _get_client():
    """Return a singleton Anthropic client, or None if key is unset."""
    global _client
    if _client is not None:
        return _client
    key = os.environ.get("ANTHROPIC_API_KEY")
    if not key:
        return None
    import anthropic
    _client = anthropic.Anthropic(api_key=key)
    return _client


def _require_client():
    c = _get_client()
    if c is None:
        raise HTTPException(
            503,
            "AI features need the ANTHROPIC_API_KEY environment variable. "
            "Get a key from https://console.anthropic.com and restart the server.",
        )
    return c


# ─────────────────────────  TOOL REGISTRY  ─────────────────────────
# Each entry is a JSON schema (for Claude) + an executor (Python callable).
# Executors receive their own Session so they don't share state across calls.

def _session() -> Session:
    return Session(engine)


def _tool_list_states(_args: dict) -> Any:
    with _session() as s:
        # state_overview-shaped headlines only; full list comes from /states config.
        return [
            {
                "slug": slug,
                "name": cfg["name"],
                "total_seats": cfg["total_seats"],
                "majority": cfg["majority"],
                "election_date": cfg["election_date"],
                "results_date": cfg["results_date"],
                "status": cfg["status"],
            }
            for slug, cfg in STATE_CONFIG.items()
        ]


def _tool_state_overview(args: dict) -> Any:
    with _session() as s:
        return state_overview(args["state"], s)


def _tool_swing(args: dict) -> Any:
    with _session() as s:
        return swing_analysis(args["state"], s)


def _tool_district_swing(args: dict) -> Any:
    with _session() as s:
        return district_swing(args["state"], s)


def _tool_party_analytics(args: dict) -> Any:
    with _session() as s:
        return party_analytics(args["state"], s)


def _tool_list_constituencies(args: dict) -> Any:
    with _session() as s:
        rows = list_constituencies(
            args["state"],
            district=args.get("district"),
            party=args.get("party"),
            session=s,
        )
        # Keep responses small — return at most 60 rows of the most relevant fields.
        return [
            {
                "ac_number": r["ac_number"], "name": r["name"], "district": r["district"],
                "winner": r["winner"], "party": r["party"], "alliance": r["alliance"],
                "votes": r["votes"], "margin": r["margin"], "vote_share": r["vote_share"],
                "runner_up_party": r.get("runner_up_party"),
            }
            for r in rows[:60]
        ]


def _tool_constituency_detail(args: dict) -> Any:
    with _session() as s:
        return constituency_detail(args["state"], int(args["ac_number"]), s)


def _tool_candidates(args: dict) -> Any:
    with _session() as s:
        # Cap to 25 rows to keep prompts small.
        return list_candidates(
            state=args["state"],
            search=args.get("search"),
            party=args.get("party"),
            ac_number=args.get("ac_number"),
            constituency=args.get("constituency"),
            district=args.get("district"),
            gender=args.get("gender"),
            criminal=args.get("criminal"),
            winners_only=args.get("winners_only", False),
            top_n=args.get("top_n"),
            sort_by=args.get("sort_by", "votes_desc"),
            offset=0,
            limit=25,
            session=s,
        )


# JSON-schema definitions handed to Claude. Keep parameters minimal — the model
# is good at constructing tool calls, but every extra field is wasted tokens.
TOOL_SCHEMAS: list[dict] = [
    {
        "name": "list_states",
        "description": "List all states covered by the dashboard with their seat totals, majority threshold, election dates, and status (declared/counting/upcoming). Call this FIRST if you don't know which state slug to use.",
        "input_schema": {"type": "object", "properties": {}},
    },
    {
        "name": "get_state_overview",
        "description": "Headline result for a state: alliance-level seat tally, party-level seats, declared count, government formation details (when set), and majority threshold. Use this for 'who won', 'forms government', alliance-level questions.",
        "input_schema": {
            "type": "object",
            "properties": {"state": {"type": "string", "description": "Lowercase-hyphenated state slug (e.g. 'kerala', 'tamil-nadu')."}},
            "required": ["state"],
        },
    },
    {
        "name": "get_swing",
        "description": "Per-party comparison between 2021 and 2026: seats then/now, seat change, vote share then/now, swing in percentage points, plus the closest contests statewide.",
        "input_schema": {
            "type": "object",
            "properties": {"state": {"type": "string"}},
            "required": ["state"],
        },
    },
    {
        "name": "get_district_swing",
        "description": "Per-district churn: seats in 2021 vs 2026, leading party then/now, flipped/held breakdown, and per-AC detail. Use for 'which district shifted most', 'where did X gain'.",
        "input_schema": {
            "type": "object",
            "properties": {"state": {"type": "string"}},
            "required": ["state"],
        },
    },
    {
        "name": "get_party_analytics",
        "description": "Per-party slate analytics: contested vs won, strike rate, votes per seat, top districts, candidate demographics (age, gender, criminal cases, assets). Use for 'best strike rate', 'wealthiest party', 'cleanest slate', 'where is X strongest'.",
        "input_schema": {
            "type": "object",
            "properties": {"state": {"type": "string"}},
            "required": ["state"],
        },
    },
    {
        "name": "list_constituencies",
        "description": "Up to 60 constituencies for a state, with winner, party, alliance, votes, margin, vote share. Optional filters: district, party.",
        "input_schema": {
            "type": "object",
            "properties": {
                "state": {"type": "string"},
                "district": {"type": "string", "description": "Optional district name filter."},
                "party": {"type": "string", "description": "Optional party abbreviation filter (e.g. 'BJP', 'CPI(M)')."},
            },
            "required": ["state"],
        },
    },
    {
        "name": "get_constituency_detail",
        "description": "Full per-AC breakdown: every candidate, their votes, vote share, MyNeta biographical fields (age, gender, assets, criminal cases, education), plus the 2021 historical comparison.",
        "input_schema": {
            "type": "object",
            "properties": {
                "state": {"type": "string"},
                "ac_number": {"type": "integer"},
            },
            "required": ["state", "ac_number"],
        },
    },
    {
        "name": "search_candidates",
        "description": "Search/filter candidates across the state (top 25 results). Use this for 'who is the youngest MLA', 'candidates with most criminal cases', 'richest candidate in X', name search, etc.",
        "input_schema": {
            "type": "object",
            "properties": {
                "state": {"type": "string"},
                "search": {"type": "string", "description": "Substring match on candidate name."},
                "party": {"type": "string"},
                "district": {"type": "string"},
                "constituency": {"type": "string"},
                "winners_only": {"type": "boolean"},
                "criminal": {"type": "boolean", "description": "true = only candidates with criminal cases; false = only clean records."},
                "gender": {"type": "string", "enum": ["Male", "Female", "Other"]},
                "sort_by": {
                    "type": "string",
                    "enum": ["votes_desc", "votes_asc", "ac_asc", "margin_desc"],
                    "description": "Default 'votes_desc'.",
                },
            },
            "required": ["state"],
        },
    },
]

TOOL_DISPATCH = {
    "list_states": _tool_list_states,
    "get_state_overview": _tool_state_overview,
    "get_swing": _tool_swing,
    "get_district_swing": _tool_district_swing,
    "get_party_analytics": _tool_party_analytics,
    "list_constituencies": _tool_list_constituencies,
    "get_constituency_detail": _tool_constituency_detail,
    "search_candidates": _tool_candidates,
}


def _run_with_tools(
    system_prompt: str,
    user_message: str,
    *,
    model: str = MODEL_SMART,
    max_iters: int = 8,
    max_tokens: int = 1500,
) -> tuple[str, list[dict]]:
    """Run a Claude conversation, satisfying tool calls until the model stops.
    Returns (final_text, trace) where `trace` is a list of {tool, args, ok} per call."""
    client = _require_client()
    messages: list[dict] = [{"role": "user", "content": user_message}]
    trace: list[dict] = []

    for _ in range(max_iters):
        resp = client.messages.create(
            model=model,
            system=system_prompt,
            tools=TOOL_SCHEMAS,
            max_tokens=max_tokens,
            messages=messages,
        )
        # Append the assistant message with full content blocks for follow-ups.
        messages.append({"role": "assistant", "content": resp.content})

        if resp.stop_reason != "tool_use":
            # Extract final text from any text blocks.
            text = "".join(b.text for b in resp.content if getattr(b, "type", None) == "text")
            return text.strip(), trace

        # Execute every tool_use block in this turn.
        tool_results: list[dict] = []
        for block in resp.content:
            if getattr(block, "type", None) != "tool_use":
                continue
            name = block.name
            args = block.input or {}
            executor = TOOL_DISPATCH.get(name)
            try:
                if executor is None:
                    raise ValueError(f"unknown tool: {name}")
                result = executor(args)
                payload = json.dumps(result, default=str)
                # Hard cap on payload size — we don't want one huge response to blow context.
                if len(payload) > 60000:
                    payload = payload[:60000] + "…[truncated]"
                trace.append({"tool": name, "args": args, "ok": True})
            except Exception as e:
                payload = json.dumps({"error": str(e)})
                trace.append({"tool": name, "args": args, "ok": False, "error": str(e)})
            tool_results.append({
                "type": "tool_result",
                "tool_use_id": block.id,
                "content": payload,
            })
        messages.append({"role": "user", "content": tool_results})

    # Hit the iteration cap — return whatever last text we had.
    return "Hit the tool-use iteration limit before producing a final answer.", trace


# ─────────────────────────  /ai/ask  ─────────────────────────

class AskRequest(BaseModel):
    question: str
    # Optional context: if the user asks from inside a state page, hint which one.
    state: str | None = None


class AskResponse(BaseModel):
    answer: str
    trace: list[dict]
    model: str


ASK_SYSTEM = """You are an analyst embedded in the India 2026 Assembly Elections dashboard. \
You have read-only tool access to the dashboard's database covering 5 states: \
Tamil Nadu, Kerala, West Bengal, Assam, Puducherry.

HARD CONSTRAINTS — these are non-negotiable:
- You may ONLY answer using data returned by the tools provided. Do NOT draw on \
your own training-data knowledge of Indian elections, parties, politicians, or \
historical events outside what the tools return.
- You have NO web access, no external lookup. If a tool doesn't return a fact, \
you don't know that fact.
- If a question is outside the dashboard's scope (e.g. about other states, other \
years, central government, individual policies, biographical detail not in our \
candidate records), say so plainly: "I can only answer from this dashboard's \
data — that's outside its scope."
- Never invent numbers, names, or dates. If you're tempted to guess, abstain.

Style:
- Lead with the answer in one sentence.
- Follow with the supporting numbers, cited precisely.
- Mention which dashboard page has more detail (e.g. "see /kerala/swing").
- If the question is ambiguous (no state specified), use list_states to pick the \
most likely one and say which assumption you made.
- Keep responses under 200 words unless detail is explicitly requested.

Data notes:
- Party slugs are uppercase abbreviations like 'BJP', 'INC', 'CPI(M)', 'IUML'.
- State slugs are lowercase-hyphenated: 'kerala', 'tamil-nadu', 'west-bengal', 'assam', 'puducherry'.
- 'IND-W' is a synthetic party for UDF-aligned winning independents in Kerala.
- Vote share figures match the Election Commission's published numbers exactly."""


@router.post("/ai/ask", response_model=AskResponse)
def ai_ask(req: AskRequest, _session: Session = Depends(get_session)):
    if not req.question or len(req.question.strip()) < 3:
        raise HTTPException(400, "Question is too short.")
    if len(req.question) > 1000:
        raise HTTPException(400, "Question is too long (1000 char limit).")
    hint = f"\n\nThe user is currently viewing the {req.state} state pages." if req.state else ""
    answer, trace = _run_with_tools(
        ASK_SYSTEM + hint,
        req.question.strip(),
        model=MODEL_SMART,
    )
    return AskResponse(answer=answer, trace=trace, model=MODEL_SMART)
