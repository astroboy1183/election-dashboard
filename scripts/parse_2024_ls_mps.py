"""
Parse ECI's "4. List of Successful Candidate" XLS into per-state JSON.

Source: GE 2024 Statistical Report file #6
  https://www.eci.gov.in/eci-backend/public/all_files/GE-2024-statistical-report/4-List-Of-Successful-Candidate.xls

XLS columns: SL.NO | State | Const No. | Constituency | Constituency Type |
             Total Valid Votes | Winner Name | Social Category | Gender | Party

For the dashboard's "Who represents you" feature, the relevant fields per LS
seat are: ls_number (= Const No.), MP name, party, gender, social category.
Constituency Type (GEN/SC/ST) and Total Valid Votes are kept as extras since
they're useful context on the representation card.

Output: data/eci_2024_ls/parsed/mps_{state-slug}.json

Run:
    python scripts/parse_2024_ls_mps.py
"""
from __future__ import annotations

import json
from collections import defaultdict
from pathlib import Path

import openpyxl

XLSX = Path("data/eci_2024_ls/4-Successful-Candidates.xlsx")
OUT_DIR = Path("data/eci_2024_ls/parsed")

TARGET_STATES = {
    "Tamil Nadu":  "tamil-nadu",
    "Kerala":      "kerala",
    "West Bengal": "west-bengal",
    "Assam":       "assam",
    "Puducherry":  "puducherry",
}

# Same alias map used in parse_2024_ls.py — keeps party tokens consistent
# with what the 2026 candidate table already stores.
PARTY_ALIASES = {
    "ADMK": "AIADMK",
    "AINRC": "AINC",
    "I":    "IND",
}


def main():
    wb = openpyxl.load_workbook(XLSX, read_only=True, data_only=True)
    sh = wb["Worksheet"]

    per_state: dict[str, list] = defaultdict(list)
    for i, row in enumerate(sh.iter_rows(values_only=True)):
        if i < 3:  # rows 0/1 = title, 2 = headers
            continue
        if not row or not row[1]:
            continue
        state, const_no, const_name, const_type, total_valid, winner_name, social_cat, gender, party = row[1:10]
        if state not in TARGET_STATES:
            continue
        slug = TARGET_STATES[state]
        party = PARTY_ALIASES.get(str(party).strip(), str(party).strip())
        per_state[slug].append({
            "ls_number": int(const_no),
            "ls_name": str(const_name).strip(),
            "constituency_type": str(const_type).strip(),    # GEN / SC / ST
            "mp_name": str(winner_name).strip(),
            "mp_party": party,
            "mp_gender": str(gender).strip().title(),         # 'Male' / 'Female'
            "mp_social_category": str(social_cat).strip(),    # GENERAL / SC / ST / OBC
            "total_valid_votes": int(total_valid or 0),
        })

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for slug, rows in per_state.items():
        rows.sort(key=lambda r: r["ls_number"])
        out = OUT_DIR / f"mps_{slug}.json"
        out.write_text(json.dumps({"state": slug, "year": 2024, "mps": rows}, indent=2))
        print(f"  {out}: {len(rows)} MPs")


if __name__ == "__main__":
    main()
