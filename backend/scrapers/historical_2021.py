"""
Scrape per-constituency 2021 state legislative assembly election results
from Wikipedia. ECI's 2021 archive returns 404, so Wikipedia is the source.

Returns per-AC: ac_number, ac_name, winner, winner_party, winner_votes,
                runner_up, runner_up_party, runner_up_votes, margin
"""
import re
from curl_cffi import requests as cffi_requests
from bs4 import BeautifulSoup

URLS = {
    "tamil-nadu":  "https://en.wikipedia.org/wiki/2021_Tamil_Nadu_Legislative_Assembly_election",
    "kerala":      "https://en.wikipedia.org/wiki/Results_of_the_2021_Kerala_Legislative_Assembly_election",
    "west-bengal": "https://en.wikipedia.org/wiki/Results_of_the_2021_West_Bengal_Legislative_Assembly_election",
    "assam":       "https://en.wikipedia.org/wiki/2021_Assam_Legislative_Assembly_election",
    "puducherry":  "https://en.wikipedia.org/wiki/2021_Puducherry_Legislative_Assembly_election",
}

# Map Wikipedia party names → our DB abbreviations
PARTY_ALIASES = {
    "AITC": "AITC", "TMC": "AITC", "All India Trinamool Congress": "AITC",
    "BJP": "BJP", "Bharatiya Janata Party": "BJP",
    "INC": "INC", "Indian National Congress": "INC",
    "CPI(M)": "CPI(M)", "CPM": "CPI(M)", "CPI(ML)L": "CPI(M)",
    "CPI": "CPI",
    "DMK": "DMK", "AIADMK": "AIADMK", "ADMK": "AIADMK",
    "IUML": "IUML",
    "PMK": "PMK", "VCK": "VCK", "MDMK": "MDMK", "DMDK": "DMDK", "AMMK": "AMMK",
    "TVK": "TVK", "NTK": "OTHERS", "NMK": "NMK",
    "KC": "KC", "KC(M)": "OTHERS", "KC(J)": "KC(J)",
    "RSP": "RSP", "AIFB": "AIFB", "AISF": "AISF", "ISF": "AISF",
    "AIUDF": "AIUDF", "AGP": "AGP", "UPPL": "UPPL", "BPF": "BPF",
    "RD": "RD", "BGPM": "BGPM",
    "AINRC": "AINC", "AINC": "AINC", "NRC": "AINC",
    "RJD": "RJD",
    "IND": "I", "Independent": "I",
    "NOTA": "NOTA",
    "GNLF": "OTHERS", "BSP": "OTHERS", "BDJS": "OTHERS",
    "JD(S)": "OTHERS", "JD(U)": "OTHERS", "NCP": "OTHERS",
    "CMP": "OTHERS", "LJD": "OTHERS", "KEC": "OTHERS", "SUCI": "OTHERS",
    "KMDK": "OTHERS", "TMMK": "OTHERS", "SDPI": "OTHERS", "RMPI": "RMPI",
}


def _clean(s: str) -> str:
    s = re.sub(r"\[\d+\]", "", s)                  # strip citation markers
    s = re.sub(r"\s+", " ", s).strip()
    return s


def _abbr(party_raw: str) -> str:
    s = _clean(party_raw)
    if s in PARTY_ALIASES:
        return PARTY_ALIASES[s]
    # Try uppercase variant
    su = s.upper()
    if su in PARTY_ALIASES:
        return PARTY_ALIASES[su]
    # Fallback: keep as OTHERS for unknowns
    return "OTHERS"


def _int(s: str) -> int:
    digits = re.sub(r"[^\d]", "", s or "")
    return int(digits) if digits else 0


def _fetch(url: str) -> BeautifulSoup:
    r = cffi_requests.get(url, impersonate="chrome124", timeout=30)
    r.raise_for_status()
    return BeautifulSoup(r.text, "lxml")


# ─── State-specific parsers ───────────────────────────────────────────


def parse_wb(soup: BeautifulSoup) -> list[dict]:
    """West Bengal table format. Columns (with empty color swatch cells):
       [0]=#, [1]=name, [2]=swatch, [3]=win_party, [4]=win_name, [5]=win_votes,
       [6]=win%, [7]=swatch, [8]=ru_party, [9]=ru_name, [10]=ru_votes, [11]=ru%,
       [12]=margin, [13]=voting_date
    """
    table = soup.find("table", {"class": "wikitable"})
    out = []
    for tr in table.find_all("tr"):
        cells = [_clean(td.get_text(" ", strip=True)) for td in tr.find_all(["td", "th"])]
        if len(cells) < 12:
            continue
        if not cells[0].isdigit():
            continue
        try:
            ac_no = int(cells[0])
            ac_name = re.sub(r"\(.*?\)", "", cells[1]).strip()  # strip (SC)/(ST)
            out.append({
                "ac_number": ac_no, "ac_name": ac_name,
                "winner": cells[4], "winner_party": _abbr(cells[3]), "winner_votes": _int(cells[5]),
                "runner_up": cells[9], "runner_up_party": _abbr(cells[8]), "runner_up_votes": _int(cells[10]),
                "margin": _int(cells[12]),
            })
        except (ValueError, IndexError):
            continue
    return out


def parse_tn(soup: BeautifulSoup) -> list[dict]:
    """TN table: [0]=#, [1]=name, [2]=turnout%, [3]=win_name, [4]=swatch, [5]=win_party,
       [6]=win_votes, [7]=win%, [8]=ru_name, [9]=swatch, [10]=ru_party, [11]=ru_votes,
       [12]=ru%, [13]=margin
    """
    tables = soup.find_all("table", {"class": "wikitable"})
    largest = max(tables, key=lambda t: len(t.find_all("tr")))
    out = []
    for tr in largest.find_all("tr"):
        cells = [_clean(td.get_text(" ", strip=True)) for td in tr.find_all(["td", "th"])]
        if len(cells) < 13:
            continue
        if not cells[0].isdigit():
            continue
        try:
            ac_no = int(cells[0])
            ac_name = re.sub(r"\(.*?\)", "", cells[1]).strip()
            out.append({
                "ac_number": ac_no, "ac_name": ac_name,
                "winner": cells[3], "winner_party": _abbr(cells[5]), "winner_votes": _int(cells[6]),
                "runner_up": cells[8], "runner_up_party": _abbr(cells[10]), "runner_up_votes": _int(cells[11]),
                "margin": _int(cells[13]) if len(cells) > 13 else _int(cells[6]) - _int(cells[11]),
            })
        except (ValueError, IndexError):
            continue
    return out


def parse_kerala(soup: BeautifulSoup) -> list[dict]:
    """Kerala has 3-alliance columns:
       [0]=#, [1]=name, [2]=district, [3]=UDF_cand, [4]=UDF_party, [5]=UDF_votes,
       [6]=LDF_cand, [7]=LDF_party, [8]=LDF_votes, [9]=NDA_cand, [10]=NDA_party,
       [11]=NDA_votes, [12]=winner_name, [13]=margin, [14]=winning_party, [15]=winning_alliance
    """
    table = soup.find("table", {"class": "wikitable"})
    out = []
    for tr in table.find_all("tr"):
        cells = [_clean(td.get_text(" ", strip=True)) for td in tr.find_all(["td", "th"])]
        if len(cells) < 14:
            continue
        if not cells[0].isdigit():
            continue
        try:
            ac_no = int(cells[0])
            ac_name = cells[1]
            winner_name = cells[12]
            winner_party_raw = cells[14] if len(cells) > 14 else ""
            margin = _int(cells[13])

            # Find the three alliance candidates with their votes
            slots = [
                {"name": cells[3], "party": _abbr(cells[4]), "votes": _int(cells[5])},   # UDF
                {"name": cells[6], "party": _abbr(cells[7]), "votes": _int(cells[8])},   # LDF
                {"name": cells[9], "party": _abbr(cells[10]), "votes": _int(cells[11])}, # NDA
            ]
            # Winner = whichever name matches the winner_name; if not, highest votes
            winner = next((s for s in slots if s["name"] and s["name"] in winner_name), None)
            if not winner:
                winner = max(slots, key=lambda s: s["votes"])
            runner_up = max((s for s in slots if s is not winner), key=lambda s: s["votes"])

            out.append({
                "ac_number": ac_no, "ac_name": ac_name,
                "winner": winner["name"], "winner_party": winner["party"], "winner_votes": winner["votes"],
                "runner_up": runner_up["name"], "runner_up_party": runner_up["party"], "runner_up_votes": runner_up["votes"],
                "margin": margin or (winner["votes"] - runner_up["votes"]),
            })
        except (ValueError, IndexError):
            continue
    return out


def parse_assam(soup: BeautifulSoup) -> list[dict]:
    """Assam page has multiple tables. We want the per-constituency results table
    which has 13 cells per row: [#, name, winner, swatch, party, votes, %,
                                  runner_up, swatch, party, votes, %, margin].
    Both the "candidate list" table and the "results" table have 171 rows, so
    we identify the correct one by checking that data rows have 13 cells with
    numeric vote counts.
    """
    tables = soup.find_all("table", {"class": "wikitable"})

    def is_results_table(t):
        # Look for any row where AC# is digit, len(cells)==13, and cells[5] is a vote count
        for tr in t.find_all("tr"):
            cells = [_clean(td.get_text(" ", strip=True)) for td in tr.find_all(["td", "th"])]
            if len(cells) == 13 and cells[0].isdigit() and _int(cells[5]) > 100:
                return True
        return False

    results_table = next((t for t in tables if is_results_table(t)), None)
    if results_table is None:
        return []

    out = []
    for tr in results_table.find_all("tr"):
        cells = [_clean(td.get_text(" ", strip=True)) for td in tr.find_all(["td", "th"])]
        if len(cells) != 13 or not cells[0].isdigit():
            continue
        try:
            ac_no = int(cells[0])
            ac_name = re.sub(r"\(.*?\)", "", cells[1]).strip()
            winner = {"name": cells[2], "party": _abbr(cells[4]), "votes": _int(cells[5])}
            runner_up = {"name": cells[7], "party": _abbr(cells[9]), "votes": _int(cells[10])}
            if winner["votes"] <= 0:
                continue
            out.append({
                "ac_number": ac_no, "ac_name": ac_name,
                "winner": winner["name"], "winner_party": winner["party"], "winner_votes": winner["votes"],
                "runner_up": runner_up["name"], "runner_up_party": runner_up["party"], "runner_up_votes": runner_up["votes"],
                "margin": winner["votes"] - runner_up["votes"],
            })
        except (ValueError, IndexError):
            continue
    return out


def parse_puducherry(soup: BeautifulSoup) -> list[dict]:
    """Puducherry has similar 2-alliance + extras layout."""
    tables = soup.find_all("table", {"class": "wikitable"})
    largest = max(tables, key=lambda t: len(t.find_all("tr")))
    out = []
    for tr in largest.find_all("tr"):
        cells = [_clean(td.get_text(" ", strip=True)) for td in tr.find_all(["td", "th"])]
        if len(cells) < 8:
            continue
        if not cells[1].isdigit() and not cells[0].isdigit():
            continue
        try:
            # Find AC number — might be cells[0] or cells[1]
            ac_no = int(cells[0]) if cells[0].isdigit() else int(cells[1])
            # Find AC name — usually next cell
            ac_name_idx = 1 if cells[0].isdigit() else 2
            ac_name = re.sub(r"\(.*?\)", "", cells[ac_name_idx]).strip()
            # Two-alliance grouping common; parse defensively
            # Try to pull two candidate/party/votes triples from remaining cells
            remaining = cells[ac_name_idx + 1:]
            slots = []
            # Look for numbers (votes) and back up to get party/name
            for i, c in enumerate(remaining):
                if c.replace(",", "").isdigit() and len(c) >= 3:
                    votes = _int(c)
                    if votes > 100:  # filter noise
                        party = _abbr(remaining[i - 2]) if i >= 2 else ""
                        name = remaining[i - 1] if i >= 1 else ""
                        slots.append({"name": name, "party": party, "votes": votes})
            slots = [s for s in slots if s["votes"] > 0][:5]
            if len(slots) < 2:
                continue
            slots.sort(key=lambda s: -s["votes"])
            winner, runner_up = slots[0], slots[1]
            out.append({
                "ac_number": ac_no, "ac_name": ac_name,
                "winner": winner["name"], "winner_party": winner["party"], "winner_votes": winner["votes"],
                "runner_up": runner_up["name"], "runner_up_party": runner_up["party"], "runner_up_votes": runner_up["votes"],
                "margin": winner["votes"] - runner_up["votes"],
            })
        except (ValueError, IndexError):
            continue
    return out


PARSERS = {
    "tamil-nadu":  parse_tn,
    "kerala":      parse_kerala,
    "west-bengal": parse_wb,
    "assam":       parse_assam,
    "puducherry":  parse_puducherry,
}


def scrape_state(state_slug: str) -> list[dict]:
    soup = _fetch(URLS[state_slug])
    return PARSERS[state_slug](soup)


if __name__ == "__main__":
    for state in URLS:
        results = scrape_state(state)
        print(f"{state}: {len(results)} ACs scraped")
        if results:
            print(f"  sample: {results[0]}")
