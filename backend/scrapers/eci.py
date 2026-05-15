"""
Scrapes ECI results from results.eci.gov.in/ResultAcGenMay2026/
Uses curl_cffi to impersonate Chrome TLS fingerprint (bypasses WAF/403).

URL patterns discovered:
  partywiseresult-{CODE}.htm        — party seat totals
  partywisewinresult-{PCODE}{CODE}  — winners per party (has total votes + margin)
  statewiseS{statenum}{page}.htm    — constituency list (winner / runner-up / margin)
"""
from curl_cffi import requests as cffi_requests
from bs4 import BeautifulSoup
import re
import time

BASE = "https://results.eci.gov.in/ResultAcGenMay2026"

STATE_CODES = {
    "tamil-nadu":  "S22",
    "kerala":      "S11",
    "west-bengal": "S25",
    "assam":       "S03",
    "puducherry":  "U07",
}

# State number used in statewise page URLs (S22 → 22)
STATE_NUM = {
    "tamil-nadu":  "22",
    "kerala":      "10",
    "west-bengal": "24",
    "assam":       "3",
    "puducherry":  "7",   # U07 → 7 for statewiseU07
}


def _get(url: str) -> BeautifulSoup:
    resp = cffi_requests.get(url, impersonate="chrome124", timeout=30)
    resp.raise_for_status()
    return BeautifulSoup(resp.text, "lxml")


def scrape_partywise(state_slug: str) -> list[dict]:
    """Party-wise seat totals from partywiseresult page."""
    code = STATE_CODES[state_slug]
    url = f"{BASE}/partywiseresult-{code}.htm"
    print(f"  [ECI] party-wise: {url}")
    soup = _get(url)
    rows = []
    for table in soup.find_all("table"):
        trs = table.find_all("tr")
        if len(trs) < 2:
            continue
        headers = [th.get_text(strip=True).lower() for th in trs[0].find_all(["th", "td"])]
        if not any("party" in h for h in headers):
            continue
        for tr in trs[1:]:
            tds = [td.get_text(strip=True) for td in tr.find_all("td")]
            if len(tds) < 2:
                continue
            party_raw = tds[0]
            # ECI format: "Tamilaga Vettri Kazhagam - TVK" → extract abbr
            abbr_match = re.search(r"-\s*([A-Z]+(?:\([A-Z]+\))?)$", party_raw)
            abbr = abbr_match.group(1) if abbr_match else party_raw[:10].upper()
            rows.append({
                "party_full": party_raw,
                "party":      abbr,
                "seats_won":  _int(tds[1]) if len(tds) > 1 else 0,
            })
        if rows:
            break
    return rows


def _get_party_win_links(state_slug: str) -> list[str]:
    """Find all partywisewinresult-* links for a state from the party-wise page."""
    code = STATE_CODES[state_slug]
    soup = _get(f"{BASE}/partywiseresult-{code}.htm")
    links = []
    for a in soup.find_all("a", href=True):
        href = a["href"]
        if href.startswith("partywisewinresult-") and code in href:
            links.append(href)
    return list(set(links))


def scrape_all_winners(state_slug: str) -> list[dict]:
    """
    Scrapes every partywisewinresult page to build full winner list.
    Returns: [{ac_number, ac_name, winner, party, votes, margin}, ...]
    """
    win_links = _get_party_win_links(state_slug)
    print(f"  [ECI] found {len(win_links)} party-win pages")
    winners = []
    for href in win_links:
        url = f"{BASE}/{href}"
        time.sleep(0.3)
        try:
            soup = _get(url)
        except Exception as e:
            print(f"    [WARN] {href}: {e}")
            continue
        # Extract party abbr from URL: partywisewinresult-1272S22.htm
        # and from page heading
        party_abbr = _abbr_from_partywin_page(soup, href)
        for table in soup.find_all("table"):
            trs = table.find_all("tr")
            if len(trs) < 2:
                continue
            headers = [th.get_text(strip=True).lower() for th in trs[0].find_all(["th", "td"])]
            if not any("constituency" in h for h in headers):
                continue
            for tr in trs[1:]:
                tds = [td.get_text(strip=True) for td in tr.find_all("td")]
                if len(tds) < 4:
                    continue
                # Columns: S.No | Constituency(AC No) | Winning Candidate | Total Votes | Margin | Status
                con_raw = tds[1]
                # format: "ALANDUR(28)"
                con_match = re.match(r"(.+?)\s*\((\d+)\)", con_raw)
                ac_name   = con_match.group(1).strip() if con_match else con_raw
                ac_number = int(con_match.group(2)) if con_match else 0
                winners.append({
                    "ac_number": ac_number,
                    "ac_name":   ac_name,
                    "winner":    tds[2],
                    "party":     party_abbr,
                    "votes":     _int(tds[3]) if len(tds) > 3 else 0,
                    "margin":    _int(tds[4]) if len(tds) > 4 else 0,
                })
            break
    winners.sort(key=lambda x: x["ac_number"])
    return winners


def _abbr_from_partywin_page(soup: BeautifulSoup, href: str) -> str:
    """Extract party abbreviation from a partywisewinresult page."""
    for tag in soup.find_all(["h1", "h2", "h3", "h4", "th", "caption"]):
        t = tag.get_text(strip=True)
        # Matches "- ABBR" or "- CPI(M)" at end of string
        m = re.search(r"-\s*([A-Z]{2,10}(?:\([A-Z]+\))?)(?:\s*$|\s+[^A-Z])", t)
        if m:
            return m.group(1)
    return href[:20]


def scrape_statewise_pages(state_slug: str) -> list[dict]:
    """
    Scrapes all statewise{CODE}{page}.htm pages.
    Returns: [{ac_number, ac_name, winner, winner_party, runner_up, runner_up_party, margin, status}, ...]
    """
    code = STATE_CODES[state_slug]
    # statewiseS221.htm, statewiseS222.htm, … (up to ~12 pages for TN)
    constituencies = []
    page = 1
    seen = set()
    while True:
        url = f"{BASE}/statewise{code}{page}.htm"
        time.sleep(0.3)
        try:
            resp = cffi_requests.get(url, impersonate="chrome124", timeout=30)
            if resp.status_code == 404:
                break
            soup = BeautifulSoup(resp.text, "lxml")
        except Exception:
            break

        table = soup.find("table")
        if not table:
            break

        found_any = False
        for tr in table.find_all("tr"):
            tds = tr.find_all("td")
            if len(tds) < 5:
                continue
            texts = [td.get_text(strip=True) for td in tds]
            # Row pattern: [0]=constituency [1]=AC# [2]=winner [3]=winner_party_noisy [4]=winner_party_clean ... [15]=runner_up [17]=runner_up_party_clean [28]=margin [30]=status
            if len(tds) >= 29:
                ac_name   = texts[0]
                ac_number = _int(texts[1])
                winner    = texts[2]
                win_party = texts[4]  # clean party name
                runner_up = texts[15] if len(texts) > 15 else ""
                ru_party  = texts[17] if len(texts) > 17 else ""
                margin    = _int(texts[28]) if len(texts) > 28 else 0
                status    = texts[30] if len(texts) > 30 else ""
                if ac_number and ac_number not in seen:
                    seen.add(ac_number)
                    found_any = True
                    constituencies.append({
                        "ac_number":      ac_number,
                        "ac_name":        ac_name,
                        "winner":         winner,
                        "winner_party":   _abbr(win_party),
                        "winner_party_full": win_party,
                        "runner_up":      runner_up,
                        "runner_up_party": _abbr(ru_party),
                        "margin":         margin,
                        "status":         status,
                    })

        if not found_any:
            break
        page += 1

    print(f"  [ECI] statewise pages scraped: {len(constituencies)} constituencies")
    return constituencies


def _abbr(party_full: str) -> str:
    """Extract abbreviation from 'Full Name - ABBR' or return short form."""
    s = party_full.strip()
    # Normalize "CPI (M)" → "CPI(M)"
    s_norm = re.sub(r'([A-Z]{2,})\s+\(([A-Z]+)\)', r'\1(\2)', s)

    # Try "- ABBR" or "- CPI(M)" suffix
    m = re.search(r"-\s*([A-Z]{2,10}(?:\([A-Z]+\))?)$", s_norm)
    if m:
        return m.group(1)

    # String is already an abbreviation (short, mostly uppercase)
    if len(s_norm) <= 12 and re.match(r'^[A-Z]{2,}(?:\([A-Z]+\))?$', s_norm):
        return s_norm

    # Last word is an all-caps abbreviation
    words = s.split()
    if words and re.match(r'^[A-Z]{2,10}$', words[-1]):
        return words[-1]

    # Build initials from uppercase-starting meaningful words;
    # if last token is "(Something)", append "(X)" to result
    skip = {'of', 'the', 'and', 'for', 'in', 'a', 'an'}
    qualifier = ""
    main_words = []
    for w in words:
        if re.match(r'^\([A-Z][a-z]+\)$', w):
            qualifier = f"({w[1].upper()})"
        else:
            main_words.append(w)
    initials = [w[0].upper() for w in main_words
                if w and w[0].isupper() and w.lower() not in skip]
    result = "".join(initials[:8])
    return (result + qualifier) if result else s[:8].upper()


def _int(s: str) -> int:
    digits = re.sub(r"[^\d]", "", s)
    return int(digits) if digits else 0


# ECI uses slightly different abbreviations than our internal config — translate.
# Verified vote-for-vote against ECI's voteshareresult-{code}.htm for 2026 ACs.
ECI_ABBR_TO_OUR = {
    # Older mappings (Dravidian + NE party variants)
    "ADMK":       "AIADMK",
    "AINRC":      "AINC",
    "BOPF":       "BPF",
    "KEC":        "KC",
    # National-level ECI codes vs colloquial / dashboard-internal forms
    "AAAP":       "AAP",        # Aam Aadmi Party (ECI registration code "AAAP")
    "NPEP":       "NPP",        # National People's Party
    "CPI(ML)(L)": "CPI(L)",     # CPI (Marxist-Leninist) Liberation
    "AIMIM":      "AIMM",       # All India Majlis-e-Ittehadul Muslimeen
    "RASLJP":     "RLJP",       # Rashtriya Lok Janshakti Party
    # ECI's "Other" bucket and KEC(M) we'll keep as OTHERS — they have no slot
    # in our per-state alliance config.
    "Other":      "OTHERS",
    "KEC(M)":     "OTHERS",
}


def scrape_voteshare(state_slug: str) -> dict[str, dict]:
    """
    Fetch ECI's official party-wise vote totals + shares from
    voteshareresult-{code}.htm. The page embeds the data in inline JS arrays.

    Returns: { our_party_abbr: {votes: int, share: float} }
             Plus "__TOTAL__": {votes: int, share: 100.0} for the state grand total.
             Plus "NOTA" and "OTHERS" buckets when ECI reports them.
    """
    code = STATE_CODES[state_slug]
    url = f"{BASE}/voteshareresult-{code}.htm"
    resp = cffi_requests.get(url, impersonate="chrome124", timeout=30)
    resp.raise_for_status()
    text = resp.text

    x_match = re.search(r"var xValues\s*=\s*\[([^\]]+)\];", text)
    y_match = re.search(r"var yValues\s*=\s*\[([^\]]+)\];", text)
    if not x_match or not y_match:
        return {}

    # xValues entries look like 'BJP{45.84%}', 'CPI(M){4.45%}', 'Other{4.26%}', 'NOTA{0.78%}'
    parties_pct = re.findall(r"'([^{]+?)\{([\d.]+)%\}'", x_match.group(1))
    votes_list = [int(v.strip()) for v in y_match.group(1).split(",") if v.strip()]

    out: dict[str, dict] = {}
    grand_total = 0
    for (party_eci, pct_str), votes in zip(parties_pct, votes_list):
        eci_abbr = party_eci.strip()
        our_abbr = ECI_ABBR_TO_OUR.get(eci_abbr, eci_abbr)
        share = float(pct_str)
        # OTHERS may accumulate (KEC(M) + Other) — sum into a single bucket
        if our_abbr in out:
            out[our_abbr]["votes"] += votes
            out[our_abbr]["share"] = round(out[our_abbr]["share"] + share, 2)
        else:
            out[our_abbr] = {"votes": votes, "share": share}
        grand_total += votes
    out["__TOTAL__"] = {"votes": grand_total, "share": 100.0}
    return out


def scrape_all_candidates_for_ac(state_slug: str, ac_number: int) -> list[dict]:
    """
    Scrape the Constituencywise page for ALL candidates contesting an AC, with
    their EVM + postal votes. Source for accurate vote totals/shares.

    Returns: [{name, party_full, party, evm_votes, postal_votes, total_votes, share}, ...]
    """
    code = STATE_CODES[state_slug]
    url = f"{BASE}/Constituencywise{code}{ac_number}.htm"
    try:
        soup = _get(url)
    except Exception as e:
        print(f"  [WARN] AC{ac_number} fetch failed: {e}")
        return []

    candidates = []
    for table in soup.find_all("table"):
        trs = table.find_all("tr")
        if len(trs) < 2:
            continue
        headers = [th.get_text(strip=True).lower() for th in trs[0].find_all(["th", "td"])]
        if not any("candidate" in h for h in headers) or not any("total votes" in h for h in headers):
            continue
        for tr in trs[1:]:
            tds = [td.get_text(strip=True) for td in tr.find_all("td")]
            if len(tds) < 6:
                continue
            # Columns: S.N. | Candidate | Party | EVM Votes | Postal Votes | Total Votes | % of Votes
            name = tds[1]
            party_full = tds[2]
            evm = _int(tds[3])
            postal = _int(tds[4])
            total = _int(tds[5])
            share = 0.0
            try:
                share = float(tds[6].replace("%", "").strip())
            except (ValueError, IndexError):
                pass
            # Skip NOTA / blank rows
            if not name or name.lower() in ("nota", "none of the above"):
                # NOTA is a real category but not a candidate — track separately
                if name and "nota" in name.lower():
                    candidates.append({
                        "name": "NOTA", "party_full": "NOTA", "party": "NOTA",
                        "evm_votes": evm, "postal_votes": postal,
                        "total_votes": total, "share": share,
                    })
                continue
            candidates.append({
                "name": name,
                "party_full": party_full,
                "party": _abbr(party_full),
                "evm_votes": evm,
                "postal_votes": postal,
                "total_votes": total,
                "share": share,
            })
        break
    return candidates
