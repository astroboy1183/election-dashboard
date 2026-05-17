"""Cross-module helpers shared by the route handlers."""
from __future__ import annotations


def norm_name(s: str | None) -> str:
    """Normalize constituency / candidate names for cross-year matching.

    Strips case, parenthetical reservation suffixes ((SC), (ST), (GEN)),
    and collapses internal whitespace. Used to bridge the 2021 historical
    name strings against the 2026 Constituency.name strings — Assam is
    the canonical case (post-2023 delimitation renumbered ACs, so we
    match by name instead of ac_number).
    """
    if not s:
        return ""
    out = s.upper().strip()
    for marker in ("(SC)", "(ST)", "(GEN)"):
        out = out.replace(marker, "")
    return " ".join(out.split())
