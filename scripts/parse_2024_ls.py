"""
Parse ECI's "34 - Details Of Assembly Segment Of PC" XLS into per-state JSON.

Source: GE 2024 Statistical Report file "34.Details of Assembly Segment of PC"
  https://www.eci.gov.in/eci-backend/public/all_files/GE-2024-statistical-report/34-Details-Of-Assembly-Segment-Of-PC.xls

The .xls is the legacy compound-document format; xlrd can't read it directly
(seen[s] corruption error). Convert to xlsx first:
  libreoffice --headless --convert-to xlsx --outdir data/eci_2024_ls/ \
    data/eci_2024_ls/34-AC-segment-of-PC.xls

The full listing of GE-2024 reports is at
  https://www.eci.gov.in/eci-backend/public/api/election-result?category_id=1

The XLS has one row per (PC, AC, candidate) with the candidate's vote total
inside that assembly segment. For our LS24-vs-A26 churn view we aggregate by
party within each AC and emit one row per (state, ac, party) — winners are
marked is_winner=True.

Output: data/eci_2024_ls/parsed/{state-slug}.json

Run:
    python scripts/parse_2024_ls.py
"""
from __future__ import annotations

import json
import os
import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, ".")

import openpyxl

XLSX = Path("data/eci_2024_ls/34-AC-segment-of-PC.xlsx")
OUT_DIR = Path("data/eci_2024_ls/parsed")

# ECI state-name → our slug. Only the 5 we care about.
TARGET_STATES = {
    "Tamil Nadu":  "tamil-nadu",
    "Kerala":      "kerala",
    "West Bengal": "west-bengal",
    "Assam":       "assam",
    "Puducherry":  "puducherry",
}

# ECI party-abbr canonicalisation (XLS uses some non-standard tokens —
# keep the mapping minimal and only for confirmed matches). Anything not
# mapped is passed through verbatim.
PARTY_ALIASES = {
    "ADMK": "AIADMK",
    "AINRC": "AINC",  # All India NR Congress
    "I":    "IND",
}


def main():
    wb = openpyxl.load_workbook(XLSX, read_only=True, data_only=True)
    sh = wb["Worksheet"]

    # (state, ac_no) → {ac_name, party → votes}
    bucket: dict[tuple[str, int], dict] = defaultdict(lambda: {"ac_name": "", "by_party": defaultdict(int), "pc_no": None, "pc_name": ""})

    rows_read = 0
    for i, row in enumerate(sh.iter_rows(values_only=True)):
        if i < 2:  # row0 = title, row1 = headers
            continue
        # Columns: state, pc_no, pc_name, _, ac_no, ac_name, _, _, _, cand, party, votes
        state, pc_no, pc_name, _, ac_no, ac_name, _, _, _, _, party, votes = row[:12]
        if state not in TARGET_STATES:
            continue
        if not ac_no or not party:
            continue
        slug = TARGET_STATES[state]
        party = PARTY_ALIASES.get(str(party).strip(), str(party).strip())
        votes = int(votes or 0)
        key = (slug, int(ac_no))
        bucket[key]["ac_name"] = str(ac_name or "").strip()
        bucket[key]["pc_no"] = int(pc_no) if pc_no else None
        bucket[key]["pc_name"] = str(pc_name or "").strip()
        bucket[key]["by_party"][party] += votes
        rows_read += 1

    print(f"Read {rows_read} candidate rows across {len(bucket)} (state,AC) combos.")

    # Emit per-state JSON
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    per_state: dict[str, list] = defaultdict(list)
    for (slug, ac_no), info in sorted(bucket.items()):
        by_party = info["by_party"]
        # Winner = party with the most votes summed inside this AC
        winner = max(by_party.items(), key=lambda x: x[1])
        rows = []
        for party, v in sorted(by_party.items(), key=lambda x: -x[1]):
            rows.append({
                "party": party,
                "votes": v,
                "is_winner": party == winner[0],
            })
        per_state[slug].append({
            "ac_number": ac_no,
            "ac_name": info["ac_name"],
            "pc_number": info["pc_no"],
            "pc_name": info["pc_name"],
            "candidates": rows,
        })

    for slug, rows in per_state.items():
        rows.sort(key=lambda r: r["ac_number"])
        out = OUT_DIR / f"{slug}.json"
        out.write_text(json.dumps({"state": slug, "year": 2024, "constituencies": rows}, indent=2))
        print(f"  {out}: {len(rows)} ACs")


if __name__ == "__main__":
    main()
