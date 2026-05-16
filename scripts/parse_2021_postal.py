"""
Parse ECI's 2021 'Detailed Results' PDFs into per-candidate rows with
EVM + postal vote splits.

Strategy (improved for multi-line candidate names):
  1. Run `pdftotext -layout` on each PDF.
  2. Walk lines. Track current AC via "Constituency N . NAME" / "N - NAME".
  3. Within an AC, candidate ROW DATA lines end with 4 numbers (EVM POSTAL TOTAL PCT)
     and contain a SEX token (MALE/FEMALE/Third).
  4. The SEX-bearing line provides: sex, age, category, party, AND the vote counts.
  5. The candidate name is split across the SEX-line and adjacent text-only lines.
     We reconstruct it by: looking at the rank-prefixed line before AND any text-only
     lines around the SEX-line.
"""
import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

PDF_DIR = Path("data/eci_2021_pdfs")
OUT_DIR = Path("data/eci_2021_parsed")

STATES = ["tamil-nadu", "kerala", "west-bengal", "assam", "puducherry"]
SEX_TOKENS = {"MALE", "FEMALE", "Third"}
CATEGORY_TOKENS = {"GENERAL", "SC", "ST"}

ROW_END_RE = re.compile(r"\s+(\d{1,7})\s+(\d{1,6})\s+(\d{1,7})\s+(\d{1,3}(?:\.\d{1,2})?)\s*$")
CONST_HEADER_RE = re.compile(r"Constituency\s+(\d+)\s*[.\-]\s*(.+?)\s+TOTAL\s+ELECTORS\s+(\d+)")
TURN_OUT_RE = re.compile(r"TURN\s*OUT\s+TOTAL\s*:\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d{1,3}\.\d{1,2})")
RANK_LINE_RE = re.compile(r"^\s*(\d+)\s+(\S.*?)\s*$")  # "1 ADHIKARY PARESH  symbol-part"


def pdftotext_layout(pdf_path: Path) -> str:
    res = subprocess.run(
        ["pdftotext", "-layout", str(pdf_path), "-"],
        capture_output=True, text=True, timeout=60,
    )
    return res.stdout


def parse_pdf(pdf_path: Path, state: str) -> list[dict]:
    text = pdftotext_layout(pdf_path)
    lines = text.splitlines()
    rows: list[dict] = []
    current_ac: int | None = None
    current_ac_name: str | None = None

    i = 0
    while i < len(lines):
        line = lines[i]

        # AC header?
        m = CONST_HEADER_RE.search(line)
        if m:
            current_ac = int(m.group(1))
            current_ac_name = m.group(2).strip()
            i += 1
            continue

        # End of AC?
        if TURN_OUT_RE.search(line):
            current_ac = None
            current_ac_name = None
            i += 1
            continue

        if current_ac is None:
            i += 1
            continue

        # Try to match this line as a data row (ending in 4 numbers)
        rm = ROW_END_RE.search(line)
        if not rm:
            i += 1
            continue
        evm, postal, total, pct = int(rm.group(1)), int(rm.group(2)), int(rm.group(3)), float(rm.group(4))
        if evm + postal != total:
            i += 1
            continue

        prefix = line[: rm.start()].strip()
        tokens = prefix.split()

        # Find SEX position
        sex_idx = next((j for j, t in enumerate(tokens) if t in SEX_TOKENS), None)

        if sex_idx is None:
            # NOTA row? (no sex/age/category, party is "NOTA")
            if any(t == "NOTA" for t in tokens):
                rows.append({
                    "state": state, "ac_number": current_ac, "ac_name": current_ac_name,
                    "name": "NOTA", "party": "NOTA",
                    "evm_votes": evm, "postal_votes": postal, "total_votes": total, "pct": pct,
                })
            i += 1
            continue

        # We have sex_idx. Extract sex / age / category / party.
        if sex_idx + 3 >= len(tokens):
            i += 1
            continue
        age = tokens[sex_idx + 1]
        cat = tokens[sex_idx + 2]
        if cat not in CATEGORY_TOKENS:
            i += 1
            continue
        party = tokens[sex_idx + 3]

        # Name reconstruction:
        # 1. Tokens BEFORE sex_idx on this line are part of the name.
        # 2. If sex_idx > 0 and the FIRST token before sex_idx is a digit (the rank),
        #    drop it. The remaining tokens are the name part 1.
        # 3. Look at the PRIOR text-only line (rank-prefixed) for the leading part.
        # 4. Look at the NEXT text-only line for name continuations.
        name_pieces: list[str] = []
        rank_found = False
        before_sex = tokens[:sex_idx]
        if before_sex and before_sex[0].isdigit():
            # Standard case: rank + name on this line
            rank_found = True
            name_pieces.append(" ".join(before_sex[1:]))
        elif before_sex:
            # Continuation: name fragment on this line (no rank)
            name_pieces.append(" ".join(before_sex))
        # If we didn't see a rank on this line, look back for the most recent
        # rank-prefixed line (no trailing numbers — pure text).
        if not rank_found:
            for j in range(i - 1, max(-1, i - 4), -1):
                prev = lines[j].strip()
                if not prev:
                    continue
                # Stop if we hit another data row or AC header
                if ROW_END_RE.search(prev) or CONST_HEADER_RE.search(prev) or TURN_OUT_RE.search(prev):
                    break
                rm2 = RANK_LINE_RE.match(prev)
                if rm2:
                    name_pieces.insert(0, rm2.group(2))
                    rank_found = True
                    break

        # Look at the NEXT non-blank text-only line for continuation (limited to
        # a couple of lines so we don't gobble the next candidate's prefix).
        for j in range(i + 1, min(len(lines), i + 4)):
            nxt = lines[j].strip()
            if not nxt:
                continue
            if ROW_END_RE.search(nxt) or CONST_HEADER_RE.search(nxt) or TURN_OUT_RE.search(nxt):
                break
            # Skip lines that look like a "rank name" line (those are the NEXT
            # candidate's header, not a continuation of this one).
            if RANK_LINE_RE.match(nxt) and nxt.split()[0].isdigit():
                break
            # Skip page-header / table-header pollution
            up = nxt.upper()
            if any(token in up for token in ("PAGE ", "CANDIDATE NAME", "ELECTION COMMISSION", "DETAILED RESULTS", "VALID VOTES POLLED", "VOTES POLLED", "TURN OUT")):
                break
            name_pieces.append(nxt)

        name = " ".join(p.strip() for p in name_pieces if p.strip())
        # Clean up extra whitespace
        name = re.sub(r"\s+", " ", name).strip()

        # Strip symbol text — symbols often appear as right-tail words on the
        # data line. Heuristic: drop everything in the name AFTER any token
        # whose lowercase form looks like a symbol descriptor (not robust;
        # better to compare against an allowlist). For now, accept the name as-is.

        if name:
            rows.append({
                "state": state, "ac_number": current_ac, "ac_name": current_ac_name,
                "name": name, "party": party,
                "evm_votes": evm, "postal_votes": postal, "total_votes": total, "pct": pct,
            })
        i += 1
    return rows


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--state", default=None, help="Only parse one state")
    ap.add_argument("--dump", default=None, help="Print parsed rows for a state to stdout")
    args = ap.parse_args()

    OUT_DIR.mkdir(exist_ok=True, parents=True)
    targets = [args.state] if args.state else STATES

    for state in targets:
        pdf_path = PDF_DIR / f"{state}_detailed_2021.pdf"
        if not pdf_path.exists():
            print(f"  ✗ {state}: PDF not found at {pdf_path}", file=sys.stderr)
            continue
        rows = parse_pdf(pdf_path, state)
        ac_set = {r["ac_number"] for r in rows}
        nota_count = sum(1 for r in rows if r["party"] == "NOTA")
        total_votes = sum(r["total_votes"] for r in rows)
        avg_per_ac = len(rows) / max(len(ac_set), 1)
        print(
            f"  {state:<13s}  {len(rows):>5d} rows  {len(ac_set):>3d} ACs  "
            f"{nota_count:>3d} NOTA  avg-per-ac={avg_per_ac:>5.1f}  total_votes={total_votes:>12,}"
        )

        if args.dump == state:
            print(json.dumps(rows[:15], indent=2))

        out = OUT_DIR / f"{state}_postal_2021.json"
        out.write_text(json.dumps(rows, indent=2))


if __name__ == "__main__":
    main()
