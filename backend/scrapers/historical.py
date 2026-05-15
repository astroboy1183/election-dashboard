"""
Scrapes 2021 election results from Wikipedia for swing analysis.
Falls back to ECI archive pages where available.
"""
from curl_cffi import requests as cffi_requests
from bs4 import BeautifulSoup
import re

WIKI_URLS = {
    "tamil-nadu":  "https://en.wikipedia.org/wiki/2021_Tamil_Nadu_Legislative_Assembly_election",
    "kerala":      "https://en.wikipedia.org/wiki/2021_Kerala_legislative_assembly_election",
    "west-bengal": "https://en.wikipedia.org/wiki/2021_West_Bengal_legislative_assembly_election",
    "assam":       "https://en.wikipedia.org/wiki/2021_Assam_Legislative_Assembly_election",
    "puducherry":  "https://en.wikipedia.org/wiki/2021_Puducherry_Legislative_Assembly_election",
}

def scrape_historical_partywise(state_slug: str) -> list[dict]:
    """Returns 2021 party-wise seat and vote share from Wikipedia."""
    url = WIKI_URLS.get(state_slug)
    if not url:
        return []
    print(f"  Fetching historical (Wikipedia): {url}")
    resp = cffi_requests.get(url, impersonate="chrome124", timeout=30)
    if resp.status_code != 200:
        print(f"  [WARN] Wikipedia returned {resp.status_code} for {state_slug}")
        return []
    soup = BeautifulSoup(resp.text, "lxml")

    results = []
    # Wikipedia election result tables have class "wikitable"
    # We look for the summary results table which lists party, seats, votes
    for table in soup.find_all("table", {"class": "wikitable"}):
        headers = [th.get_text(strip=True).lower() for th in table.find_all("th")]
        if not any("seat" in h or "won" in h for h in headers):
            continue
        for tr in table.find_all("tr")[1:]:
            tds = tr.find_all(["td", "th"])
            if len(tds) < 3:
                continue
            texts = [td.get_text(strip=True) for td in tds]
            party = texts[0]
            if not party or party.lower() in ("total", "others", "nota"):
                continue
            seats = _find_int(texts, 1)
            votes = _find_int(texts, -2)
            vote_pct = _find_float(texts)
            results.append({
                "party": party,
                "seats": seats,
                "votes": votes,
                "vote_pct": vote_pct,
            })
        if results:
            break
    return results


def _find_int(texts: list[str], idx: int) -> int:
    try:
        return int(re.sub(r"[^\d]", "", texts[idx])) if texts[idx] else 0
    except Exception:
        return 0


def _find_float(texts: list[str]) -> float:
    for t in texts:
        m = re.search(r"(\d+\.\d+)", t)
        if m:
            return float(m.group(1))
    return 0.0
