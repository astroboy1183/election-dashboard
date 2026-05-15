# Election Dashboard 2026 — Wireframes

Layout convention:
- Left sidebar (~240px): logo, state name, page navigation
- Main area: page content
- `[Chart: X]` = Plotly chart placeholder
- `[Map]` = Folium map placeholder
- `████` = filled bar / progress
- `░░░░` = empty bar remainder
- `[Btn]` = clickable button / link

---

## Page 0 — Home / State Picker

```
┌─────────────────────────────────────────────────────────────────────────────┐
│   🗳️  India Assembly Elections 2026              Last updated: 4 May 2026   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   Select a state to explore results                                         │
│                                                                             │
│  ┌──────────────────────────────┐  ┌──────────────────────────────┐        │
│  │  🟢 TAMIL NADU               │  │  🟢 PUDUCHERRY               │        │
│  │  ● Results Declared          │  │  ● Results Declared          │        │
│  │  ─────────────────────────── │  │  ─────────────────────────── │        │
│  │  234 seats  │  Majority: 118 │  │  30 seats  │  Majority: 16  │        │
│  │                              │  │                              │        │
│  │  Winner: TVK Alliance        │  │  Winner: INC + DMK           │        │
│  │  108 / 234 seats             │  │  16 / 30 seats               │        │
│  │                              │  │                              │        │
│  │  Turnout: 85.1%  ▲ +14pp     │  │  Turnout: 81.3%  ▲ +8pp     │        │
│  │                              │  │                              │        │
│  │      [ Explore Results → ]   │  │      [ Explore Results → ]   │        │
│  └──────────────────────────────┘  └──────────────────────────────┘        │
│                                                                             │
│  ┌──────────────────────────────┐  ┌──────────────────────────────┐        │
│  │  ⚫ WEST BENGAL              │  │  ⚫ KERALA                   │        │
│  │  ○ Upcoming                  │  │  ○ Upcoming                  │        │
│  │  ─────────────────────────── │  │  ─────────────────────────── │        │
│  │  294 seats                   │  │  140 seats                   │        │
│  │  Scheduled: Nov 2026         │  │  Scheduled: Nov 2026         │        │
│  │                              │  │                              │        │
│  │      [ Preview →]            │  │      [ Preview →]            │        │
│  └──────────────────────────────┘  └──────────────────────────────┘        │
│                                                                             │
│  ─────────────────────────────────────────────────────────────────         │
│  Data sourced from ECI · results.eci.gov.in · affidavit.eci.gov.in         │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Page 1 — State Overview

```
┌─────────────────┬───────────────────────────────────────────────────────────┐
│  SIDEBAR        │  Tamil Nadu — State Overview                               │
│                 │                                                            │
│  🗳️ TN 2026     ├────────────────────────────────────────────────────────── │
│  ─────────────  │  ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌──────────┐ │
│  > Overview     │  │  234      │ │  118      │ │  85.1%    │ │  9,400+  │ │
│  Party Analysis │  │  Seats    │ │  Majority │ │  Turnout  │ │  Candid. │ │
│  Constituency   │  └───────────┘ └───────────┘ └───────────┘ └──────────┘ │
│  Candidate      │                                                            │
│  Swing          │  SEAT TALLY ─────────────────────────── 234 total ──────  │
│  District       │                                                            │
│  Map            │  TVK Alliance  ████████████████████████░░░░░░░░  108/234  │
│  Assets         │  SPA (DMK+)    ████████████░░░░░░░░░░░░░░░░░░░░   59/234  │
│                 │  AIADMK Alln.  ██████████░░░░░░░░░░░░░░░░░░░░░░   53/234  │
│  ─────────────  │  Others        ████░░░░░░░░░░░░░░░░░░░░░░░░░░░░   14/234  │
│  State:         │                         ▲ Majority line (118)              │
│  [Tamil Nadu ▼] │                                                            │
│                 │  ┌────────────────────────────┐ ┌──────────────────────┐  │
│                 │  │ GOVERNMENT FORMATION        │ │ KEY HIGHLIGHTS       │  │
│                 │  │ ─────────────────────────── │ │ ─────────────────── │  │
│                 │  │ 🏛️ TVK — Single Largest     │ │ ★ C. Joseph Vijay   │  │
│                 │  │    108 seats (needs 118)    │ │   sworn in as CM     │  │
│                 │  │                             │ │   10 May 2026        │  │
│                 │  │ Status: Coalition forming   │ │                      │  │
│                 │  │ CM: C. Joseph Vijay (TVK)   │ │ ✕ M.K. Stalin LOST  │  │
│                 │  │ Sworn in: 10 May 2026       │ │   Kolathur           │  │
│                 │  │                             │ │                      │  │
│                 │  │                             │ │ 📈 Highest turnout   │  │
│                 │  │                             │ │   in state history   │  │
│                 │  └────────────────────────────┘ └──────────────────────┘  │
│                 │                                                            │
│                 │  ┌────────────────────────────┐ ┌──────────────────────┐  │
│                 │  │ ALLIANCE BREAKDOWN          │ │ TURNOUT vs 2021      │  │
│                 │  │                             │ │                      │  │
│                 │  │  [Chart: Donut              │ │  [Chart: Grouped     │  │
│                 │  │   TVK 46%                   │ │   Bar — 2021 vs 2026 │  │
│                 │  │   SPA 25%                   │ │   per district       │  │
│                 │  │   AIADMK+ 23%               │ │   70.97% → 85.1%]   │  │
│                 │  │   Others 6%]                │ │                      │  │
│                 │  └────────────────────────────┘ └──────────────────────┘  │
└─────────────────┴───────────────────────────────────────────────────────────┘
```

---

## Page 2 — Party & Alliance Analysis

```
┌─────────────────┬───────────────────────────────────────────────────────────┐
│  SIDEBAR        │  Tamil Nadu — Party & Alliance Analysis                    │
│  (same as P1)   ├────────────────────────────────────────────────────────── │
│                 │  Toggle: [Party View]  [Alliance View]                     │
│                 │                                                            │
│                 │  PARTY-WISE RESULTS TABLE ────────────────────────────────│
│                 │  ┌──────┬──────┬──────┬────────┬───────┬────────┬───────┐ │
│                 │  │Party │ Won  │Cntst.│Strike% │ Votes │ Share% │ Swing │ │
│                 │  ├──────┼──────┼──────┼────────┼───────┼────────┼───────┤ │
│                 │  │ TVK  │ 108  │ 233  │ 46.4%  │ 1.72Cr│ 34.92% │  NEW  │ │
│                 │  │ DMK  │  59  │ 164  │ 36.0%  │ 1.19Cr│ 24.19% │ -74   │ │
│                 │  │AIADMK│  47  │ 166  │ 28.3%  │ 1.04Cr│ 21.21% │ -19   │ │
│                 │  │ INC  │   5  │  28  │ 17.9%  │  ...  │  ...   │ -13   │ │
│                 │  │ BJP  │   1  │  26  │  3.8%  │  ...  │  ...   │  -3   │ │
│                 │  │ PMK  │   0  │  18  │  0.0%  │  ...  │  ...   │  -5   │ │
│                 │  └──────┴──────┴──────┴────────┴───────┴────────┴───────┘ │
│                 │                                                            │
│                 │  ┌──────────────────────────┐  ┌──────────────────────┐   │
│                 │  │ SEATS WON (Bar Chart)     │  │ VOTE SHARE (Pie)     │   │
│                 │  │                           │  │                      │   │
│                 │  │  [Chart: Horizontal bar   │  │  [Chart: Pie         │   │
│                 │  │   per party, colored by   │  │   TVK 35%            │   │
│                 │  │   alliance, sorted desc]  │  │   DMK 24%            │   │
│                 │  │                           │  │   AIADMK 21%         │   │
│                 │  │                           │  │   Others 20%]        │   │
│                 │  └──────────────────────────┘  └──────────────────────┘   │
│                 │                                                            │
│                 │  ┌──────────────────────────┐  ┌──────────────────────┐   │
│                 │  │ EFFICIENCY CHART          │  │ TOP GAINS / LOSSES   │   │
│                 │  │ Vote Share vs Seats Won   │  │                      │   │
│                 │  │                           │  │  ▲ Biggest Gainers   │   │
│                 │  │  [Chart: Scatter —        │  │  TVK   +108          │   │
│                 │  │   X=vote share %          │  │                      │   │
│                 │  │   Y=seats won             │  │  ▼ Biggest Losers    │   │
│                 │  │   bubble=contested        │  │  DMK    -74          │   │
│                 │  │   color=party]            │  │  INC    -13          │   │
│                 │  └──────────────────────────┘  └──────────────────────┘   │
└─────────────────┴───────────────────────────────────────────────────────────┘
```

---

## Page 3 — Constituency Results

```
┌─────────────────┬───────────────────────────────────────────────────────────┐
│  SIDEBAR        │  Tamil Nadu — Constituency Results                         │
│  (same as P1)   ├────────────────────────────────────────────────────────── │
│                 │  FILTERS ─────────────────────────────────────────────── │
│                 │  [District ▼]  [Party ▼]  [Alliance ▼]  [Status ▼]       │
│                 │  Margin: [  0  ] to [ 999999 ]   [Search constituency... ]│
│                 │                                                            │
│                 │  234 constituencies  │  230 declared  │  4 counting        │
│                 │                                                            │
│                 │  ┌──────┬────────────────┬─────┬──────┬──────┬─────────┐  │
│                 │  │  #   │ Constituency   │Dist.│Winner│Party │ Margin  │  │
│                 │  │      │                │     │      │      │ / Share │  │
│                 │  ├──────┼────────────────┼─────┼──────┼──────┼─────────┤  │
│                 │  │  1   │ Perambur       │ CH  │Vijay │ TVK  │ 32,410  │  │
│                 │  │      │ [→ detail]     │     │      │      │ 54.2%   │  │
│                 │  ├──────┼────────────────┼─────┼──────┼──────┼─────────┤  │
│                 │  │  2   │ Kolathur       │ CH  │ ...  │AIADMK│  4,210  │  │
│                 │  │      │ [→ detail]     │     │      │      │ 32.1%   │  │
│                 │  ├──────┼────────────────┼─────┼──────┼──────┼─────────┤  │
│                 │  │  3   │ Edappadi       │ SL  │  EPS │AIADMK│ 68,902  │  │
│                 │  │      │ [→ detail]     │     │      │      │ 61.3%   │  │
│                 │  ├──────┼────────────────┼─────┼──────┼──────┼─────────┤  │
│                 │  │  4   │ Coimbatore(N)  │ CB  │  ... │ TVK  │  1,204  │  │
│                 │  │      │ [→ detail]     │     │      │      │ 35.8%   │  │
│                 │  ├──────┼────────────────┼─────┼──────┼──────┼─────────┤  │
│                 │  │ ...  │ ...            │ ... │ ...  │ ...  │  ...    │  │
│                 │  └──────┴────────────────┴─────┴──────┴──────┴─────────┘  │
│                 │                                                            │
│                 │  [← Prev]   Page 1 of 24   [Next →]    [Download CSV]     │
└─────────────────┴───────────────────────────────────────────────────────────┘
```

---

## Page 4 — Constituency Detail

```
┌─────────────────┬───────────────────────────────────────────────────────────┐
│  SIDEBAR        │  ← Back to Results    Constituency: PERAMBUR (Chennai)     │
│  (same as P1)   ├────────────────────────────────────────────────────────── │
│                 │  ┌──────────────┐ ┌──────────────┐ ┌────────────────────┐ │
│                 │  │  Winner      │ │  Margin      │ │  Turnout           │ │
│                 │  │  C.J. Vijay  │ │  32,410      │ │  88.2%             │ │
│                 │  │  TVK         │ │  votes       │ │  vs avg 85.1%      │ │
│                 │  └──────────────┘ └──────────────┘ └────────────────────┘ │
│                 │                                                            │
│                 │  ALL CANDIDATES ─────────────────────────────────────────  │
│                 │  [Chart: Horizontal bar per candidate, sorted by votes]    │
│                 │                                                            │
│                 │  C.J. Vijay   TVK  ████████████████████████████  1,12,840 │
│                 │  Opponent A   DMK  ██████████░░░░░░░░░░░░░░░░░░   80,430  │
│                 │  Opponent B  ADMK  ████░░░░░░░░░░░░░░░░░░░░░░░░   31,200  │
│                 │  Others       —   ██░░░░░░░░░░░░░░░░░░░░░░░░░░░   12,100  │
│                 │                                                            │
│                 │  ┌────────────────────────────┐  ┌──────────────────────┐ │
│                 │  │ vs 2021 COMPARISON          │  │ CANDIDATE PROFILES   │ │
│                 │  │ ─────────────────────────── │  │ ─────────────────── │ │
│                 │  │  [Chart: Grouped bar        │  │  [ C.J. Vijay  TVK] │ │
│                 │  │   showing 2021 vs 2026      │  │  Assets: ₹82 Cr     │ │
│                 │  │   vote share per party]     │  │  Criminal: 0 cases  │ │
│                 │  │                             │  │  Education: B.E.    │ │
│                 │  │  2021 winner: DMK            │  │  [View Affidavit ↗] │ │
│                 │  │  2026 winner: TVK  ← New!   │  │ ─────────────────── │ │
│                 │  │                             │  │  [Runner-up  DMK  ] │ │
│                 │  │  Swing: DMK -12pp           │  │  Assets: ₹4.2 Cr    │ │
│                 │  │         TVK +35pp (new)     │  │  Criminal: 2 cases  │ │
│                 │  └────────────────────────────┘  └──────────────────────┘ │
│                 │                                                            │
│                 │  COUNTING ROUNDS (if available) ─────────────────────────  │
│                 │  [Chart: Line — votes per candidate across counting rounds] │
└─────────────────┴───────────────────────────────────────────────────────────┘
```

---

## Page 5 — Candidate Explorer

```
┌─────────────────┬───────────────────────────────────────────────────────────┐
│  SIDEBAR        │  Tamil Nadu — Candidate Explorer                           │
│  (same as P1)   ├────────────────────────────────────────────────────────── │
│                 │  SEARCH & FILTERS ────────────────────────────────────── │
│                 │  [ Search candidate name...              ]                 │
│                 │                                                            │
│                 │  [District ▼] [Constituency ▼] [Party ▼] [Alliance ▼]    │
│                 │  [Gender ▼]   [Age: 25 ──●──── 85]   [Education ▼]        │
│                 │  [Criminal cases: All / Yes / No]   [Occupation ▼]        │
│                 │                                     [ Apply Filters ]      │
│                 │                                                            │
│                 │  9,400 candidates  │  Showing 1–50  │  [Download CSV]      │
│                 │                                                            │
│                 │  ┌──────┬──────────────┬─────┬──────┬───────┬──────────┐  │
│                 │  │ Name │Constituency  │Party│Status│Votes  │Criminal  │  │
│                 │  │      │              │     │      │/Share │Cases     │  │
│                 │  ├──────┼──────────────┼─────┼──────┼───────┼──────────┤  │
│                 │  │Vijay │ Perambur     │ TVK │  Won │1.12 L │    0     │  │
│                 │  │ ...  │ ...          │ ... │  ... │  ...  │   ...    │  │
│                 │  │ EPS  │ Edappadi     │ADMK │  Won │  ...  │    3     │  │
│                 │  │ ...  │ ...          │ ... │  ... │  ...  │   ...    │  │
│                 │  └──────┴──────────────┴─────┴──────┴───────┴──────────┘  │
│                 │                                                            │
│                 │  SUMMARY STATS (updates with filters) ───────────────────  │
│                 │  ┌──────────┐ ┌──────────┐ ┌───────────┐ ┌────────────┐  │
│                 │  │ 9,400    │ │  698     │ │ Avg Assets│ │ Avg Age    │  │
│                 │  │ Total    │ │ w/ Crim. │ │ ₹4.2 Cr   │ │  47 yrs    │  │
│                 │  └──────────┘ └──────────┘ └───────────┘ └────────────┘  │
│                 │  [Chart: Age distribution histogram] [Gender split pie]    │
└─────────────────┴───────────────────────────────────────────────────────────┘
```

---

## Page 6 — Swing & Trends

```
┌─────────────────┬───────────────────────────────────────────────────────────┐
│  SIDEBAR        │  Tamil Nadu — Swing & Trends (2021 → 2026)                 │
│  (same as P1)   ├────────────────────────────────────────────────────────── │
│                 │  ┌──────────────┐ ┌──────────────┐ ┌────────────────────┐ │
│                 │  │  TVK         │ │  DMK         │ │  AIADMK            │ │
│                 │  │  +108 seats  │ │  -74 seats   │ │  -19 seats         │ │
│                 │  │  (NEW party) │ │  133 → 59    │ │  66 → 47           │ │
│                 │  └──────────────┘ └──────────────┘ └────────────────────┘ │
│                 │                                                            │
│                 │  VOTE SHARE SWING (Butterfly Chart) ─────────────────────  │
│                 │                                                            │
│                 │        2021 ◄──────────────────────────► 2026             │
│                 │  TVK   ░░░░░░░░░░░░░░░│████████████████  +34.9% (new)     │
│                 │  DMK   ████████████████│████████░░░░░░░░  -21pp → 24.2%   │
│                 │  AIADMK████████████████│██████░░░░░░░░░░  -11pp → 21.2%   │
│                 │  INC   ██████│█████░░░░│                  -3pp            │
│                 │  BJP   ████░░│                            -2pp            │
│                 │                                                            │
│                 │  ┌──────────────────────────┐  ┌──────────────────────┐   │
│                 │  │ TURNOUT BY DISTRICT       │  │ CLOSEST CONTESTS     │   │
│                 │  │ ─────────────────────     │  │ ─────────────────── │   │
│                 │  │  [Chart: Bar — districts  │  │ Constituency  Margin │   │
│                 │  │   sorted by turnout       │  │ Coimbatore N   204  │   │
│                 │  │   change 2021→2026]       │  │ Vellore        388  │   │
│                 │  │                           │  │ Ambattur       512  │   │
│                 │  │  Chennai   +18pp ↑        │  │ ...             ... │   │
│                 │  │  Madurai   +12pp ↑        │  │                     │   │
│                 │  │  Coimbatore +9pp ↑        │  │  [View all 20 →]    │   │
│                 │  └──────────────────────────┘  └──────────────────────┘   │
│                 │                                                            │
│                 │  SEATS WON vs VOTE SHARE — 2021 vs 2026 ─────────────────  │
│                 │  [Chart: Grouped bar — party on X, seats on Y,            │
│                 │   two bars per party: 2021 (grey) and 2026 (colored)]     │
└─────────────────┴───────────────────────────────────────────────────────────┘
```

---

## Page 7 — District & Lok Sabha View

```
┌─────────────────┬───────────────────────────────────────────────────────────┐
│  SIDEBAR        │  Tamil Nadu — Geographic Analysis                          │
│  (same as P1)   ├────────────────────────────────────────────────────────── │
│                 │  [ District View ]  [ Lok Sabha View ]   ← tab switcher   │
│                 │  ═══════════════                                           │
│                 │                                                            │
│                 │  ── TAB A: DISTRICT VIEW ──────────────────────────────── │
│                 │                                                            │
│                 │  Select District: [Chennai ▼]                              │
│                 │                                                            │
│                 │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌─────────────┐  │
│                 │  │ 18       │ │ 6.8 L    │ │  84.9%   │ │  TVK leads  │  │
│                 │  │ Seats    │ │ Voters   │ │  Turnout │ │  11/18      │  │
│                 │  └──────────┘ └──────────┘ └──────────┘ └─────────────┘  │
│                 │                                                            │
│                 │  ┌────────────────────────────┐  ┌──────────────────────┐ │
│                 │  │ SEAT DISTRIBUTION           │  │ VOTER DEMOGRAPHICS   │ │
│                 │  │ ─────────────────────────── │  │ ─────────────────── │ │
│                 │  │  [Chart: Bar — party-wise   │  │  [Chart: Stacked bar │ │
│                 │  │   seats within district]    │  │   Male / Female      │ │
│                 │  │                             │  │   voters per constit.│ │
│                 │  │  TVK:    11 seats            │  │                      │ │
│                 │  │  DMK:     4 seats            │  │  Total M: 3.4 L     │ │
│                 │  │  AIADMK:  2 seats            │  │  Total F: 3.4 L     │ │
│                 │  │  Others:  1 seat             │  │  3rd Gender: 1,240  │ │
│                 │  └────────────────────────────┘  └──────────────────────┘ │
│                 │                                                            │
│                 │  CONSTITUENCY LIST ── Chennai ─────────────────────────── │
│                 │  ┌────────────────┬──────────────┬───────┬──────────────┐  │
│                 │  │ Constituency   │ Winner       │ Party │    Margin    │  │
│                 │  ├────────────────┼──────────────┼───────┼──────────────┤  │
│                 │  │ Perambur       │ C.J. Vijay   │  TVK  │   32,410     │  │
│                 │  │ Kolathur       │ ...          │ ADMK  │    4,210     │  │
│                 │  │ Villivakkam    │ ...          │  TVK  │   18,900     │  │
│                 │  │ ...            │ ...          │  ...  │    ...       │  │
│                 │  └────────────────┴──────────────┴───────┴──────────────┘  │
│                 │                                                            │
│                 │  ── TAB B: LOK SABHA VIEW ─────────────────────────────── │
│                 │                                                            │
│                 │  NOTE: Each of TN's 39 LS seats = 6 assembly segments.    │
│                 │  This view aggregates 2026 assembly results to project     │
│                 │  implied LS-level outcomes & compares with 2024 LS results.│
│                 │                                                            │
│                 │  Select LS Constituency: [Chennai Central ▼]              │
│                 │                                                            │
│                 │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌─────────────┐  │
│                 │  │ 6        │ │ TVK      │ │ 4 / 6    │ │ 2024 winner │  │
│                 │  │ Segments │ │ Projected│ │ Segments │ │ DMK (actual)│  │
│                 │  │          │ │ Winner   │ │ won      │ │             │  │
│                 │  └──────────┘ └──────────┘ └──────────┘ └─────────────┘  │
│                 │                                                            │
│                 │  VOTE AGGREGATION TABLE ─────────────────────────────── │
│                 │  Votes per party summed across all 6 segments             │
│                 │  ┌──────────────────┬────────┬────────┬────────┬───────┐  │
│                 │  │ Assembly Segment │  TVK   │  DMK   │  ADMK  │Others │  │
│                 │  ├──────────────────┼────────┼────────┼────────┼───────┤  │
│                 │  │ Perambur         │ 1,12,840│ 80,430│ 31,200 │12,100 │  │
│                 │  │ Kolathur         │  74,200│ 68,100│ 78,310 │ 8,900 │  │
│                 │  │ Villivakkam      │  98,400│ 72,300│ 41,200 │ 6,200 │  │
│                 │  │ Thiruvottiyur    │  88,100│ 66,500│ 44,300 │ 7,800 │  │
│                 │  │ Dr. Radhakrishnan│  71,200│ 90,400│ 38,900 │ 9,100 │  │
│                 │  │ Royapuram        │  95,300│ 69,800│ 43,100 │ 8,400 │  │
│                 │  ├──────────────────┼────────┼────────┼────────┼───────┤  │
│                 │  │ TOTAL VOTES  ★  │5,40,040│4,47,530│2,77,010│52,500 │  │
│                 │  │ Vote Share       │ 41.3%  │ 34.2%  │ 21.2%  │  4.0% │  │
│                 │  └──────────────────┴────────┴────────┴────────┴───────┘  │
│                 │  ★ Projected LS Winner: TVK  (5,40,040 votes — 41.3%)     │
│                 │                                                            │
│                 │  ┌────────────────────────────┐  ┌──────────────────────┐ │
│                 │  │ PROJECTED VOTE SHARE (Bar)  │  │ 2024 LS vs 2026      │ │
│                 │  │ ─────────────────────────── │  │ PROJECTED SWING      │ │
│                 │  │  TVK  ████████████  41.3%   │  │ ─────────────────── │ │
│                 │  │  DMK  █████████    34.2%    │  │  [Chart: Butterfly   │ │
│                 │  │  ADMK ██████       21.2%    │  │   2024 actual LS     │ │
│                 │  │  Oth. █            4.0%     │  │   vs 2026 projected  │ │
│                 │  │                             │  │   vote share per     │ │
│                 │  │  Winner: ★ TVK              │  │   party/alliance]    │ │
│                 │  └────────────────────────────┘  └──────────────────────┘ │
│                 │                                                            │
│                 │  ALL 39 LS SEATS — PROJECTED SCOREBOARD ──────────────── │
│                 │  Winner = party with highest total votes across 6 segments │
│                 │  ┌──────────────────┬──────────┬────────────┬───────────┐  │
│                 │  │ LS Constituency  │ Proj.    │ Total Votes│2024 Winner│  │
│                 │  │                  │ Winner   │ (leading)  │ (actual)  │  │
│                 │  ├──────────────────┼──────────┼────────────┼───────────┤  │
│                 │  │ Chennai Central  │ TVK      │ 5,40,040   │DMK ← flip │  │
│                 │  │ Chennai North    │ TVK      │ 4,98,120   │DMK ← flip │  │
│                 │  │ Chennai South    │ DMK      │ 4,71,300   │DMK  hold  │  │
│                 │  │ Coimbatore       │ TVK      │ 5,12,880   │BJP ← flip │  │
│                 │  │ ...              │ ...      │ ...        │ ...       │  │
│                 │  └──────────────────┴──────────┴────────────┴───────────┘  │
│                 │                                                            │
│                 │  ┌────────────────────────────────────────────────────┐   │
│                 │  │ PROJECTED LS TALLY (vote-aggregation method)        │   │
│                 │  │ TVK  ████████████████████ 22 seats                  │   │
│                 │  │ DMK  ████████ 10 seats                              │   │
│                 │  │ ADMK ████ 5 seats                                   │   │
│                 │  │ Others ██ 2 seats                                   │   │
│                 │  │ ─────────────────────────────────────────────────   │   │
│                 │  │ Flips vs 2024: TVK +22 (new) │ DMK -17 │ BJP -1    │   │
│                 │  └────────────────────────────────────────────────────┘   │
└─────────────────┴───────────────────────────────────────────────────────────┘
```

---

## Page 8 — Interactive Map

```
┌─────────────────┬───────────────────────────────────────────────────────────┐
│  SIDEBAR        │  Tamil Nadu — Constituency Map                             │
│  (same as P1)   ├────────────────────────────────────────────────────────── │
│                 │  Layer: [Party View ●] [Alliance View] [Turnout Heat]      │
│                 │                                                            │
│                 │  ┌─────────────────────────────────────────────────────┐  │
│                 │  │                                                     │  │
│                 │  │                                                     │  │
│                 │  │          [FOLIUM INTERACTIVE MAP                    │  │
│                 │  │           Tamil Nadu state outline                  │  │
│                 │  │           234 constituency polygons                 │  │
│                 │  │           Color = winning party                     │  │
│                 │  │                                                     │  │
│                 │  │     Hover tooltip:                                  │  │
│                 │  │     ┌────────────────────────────┐                  │  │
│                 │  │     │ Perambur                   │                  │  │
│                 │  │     │ Winner: C.J. Vijay (TVK)   │                  │  │
│                 │  │     │ Margin: 32,410 votes       │                  │  │
│                 │  │     │ Vote Share: 54.2%          │                  │  │
│                 │  │     │ Turnout: 88.2%             │                  │  │
│                 │  │     │ [View full detail →]       │                  │  │
│                 │  │     └────────────────────────────┘                  │  │
│                 │  │                                                     │  │
│                 │  │   Click constituency → navigate to Page 4           │  │
│                 │  └─────────────────────────────────────────────────────┘  │
│                 │                                                            │
│                 │  LEGEND ──────────────────────────────────────────────── │
│                 │  ■ TVK (Yellow)  ■ DMK (Red)  ■ AIADMK (Green)           │
│                 │  ■ INC (Blue)    ■ BJP (Orange) ■ Others (Grey)           │
│                 │                                                            │
│                 │  ┌──────────────────────────────────────────────────────┐ │
│                 │  │ MINI STATS (updates on district click)               │ │
│                 │  │ Selected: Chennai  •  18 seats  •  TVK 11  DMK 4    │ │
│                 │  └──────────────────────────────────────────────────────┘ │
└─────────────────┴───────────────────────────────────────────────────────────┘
```

---

## Page 9 — Candidate Criminality & Assets

```
┌─────────────────┬───────────────────────────────────────────────────────────┐
│  SIDEBAR        │  Tamil Nadu — Candidate Criminality & Assets               │
│  (same as P1)   ├────────────────────────────────────────────────────────── │
│                 │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌─────────────┐  │
│                 │  │  698     │ │  404     │ │  7.4%    │ │ ₹4.2 Cr     │  │
│                 │  │ w/ Cases │ │ Serious  │ │ of total │ │ Avg Assets  │  │
│                 │  │ (7.4%)   │ │ Cases    │ │ candid.  │ │ (declared)  │  │
│                 │  └──────────┘ └──────────┘ └──────────┘ └─────────────┘  │
│                 │                                                            │
│                 │  ┌────────────────────────────┐  ┌──────────────────────┐ │
│                 │  │ CRIMINAL CASES BY PARTY     │  │ CASE SEVERITY SPLIT  │ │
│                 │  │ ─────────────────────────── │  │ ─────────────────── │ │
│                 │  │  [Chart: Bar — % candidates │  │  [Chart: Pie —       │ │
│                 │  │   with criminal cases        │  │   IPC section        │ │
│                 │  │   per party]                │  │   severity levels]   │ │
│                 │  │                             │  │                      │ │
│                 │  │  AIADMK  35.3% (60 of 166) │  │  Serious (non-bail): │ │
│                 │  │  TVK     18.6% (43 of 233) │  │  58%                 │ │
│                 │  │  DMK     18.3% (30 of 164) │  │  Bailable: 42%       │ │
│                 │  └────────────────────────────┘  └──────────────────────┘ │
│                 │                                                            │
│                 │  TOP 10 CANDIDATES BY DECLARED ASSETS ────────────────── │
│                 │  ┌──────────────────┬──────┬──────────┬─────────────────┐ │
│                 │  │ Candidate        │ Party│ Constit. │ Assets Declared │ │
│                 │  ├──────────────────┼──────┼──────────┼─────────────────┤ │
│                 │  │ C.J. Vijay       │ TVK  │ Perambur │ ₹ 82.4 Cr       │ │
│                 │  │ ...              │ ...  │ ...      │ ₹ ...           │ │
│                 │  └──────────────────┴──────┴──────────┴─────────────────┘ │
│                 │                                                            │
│                 │  ┌────────────────────────────────────────────────────┐   │
│                 │  │ WINNERS WITH CRIMINAL CASES ─────────────────────  │   │
│                 │  │  [Chart: Bar — party-wise count of elected MLAs    │   │
│                 │  │   with pending criminal cases]                     │   │
│                 │  └────────────────────────────────────────────────────┘   │
└─────────────────┴───────────────────────────────────────────────────────────┘
```
