from typing import Optional
from sqlmodel import Field, SQLModel
from sqlalchemy import UniqueConstraint


class State(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    slug: str = Field(index=True, unique=True)
    name: str
    total_seats: int
    majority: int
    election_date: str
    results_date: str
    ls_seats: int
    status: str  # declared | counting | upcoming


class Alliance(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    state_slug: str = Field(index=True)
    alliance_id: str
    name: str
    color: str

    __table_args__ = (UniqueConstraint("state_slug", "alliance_id"),)


class Party(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    state_slug: str = Field(index=True)
    abbreviation: str
    full_name: str
    alliance_id: str
    color: str

    __table_args__ = (UniqueConstraint("state_slug", "abbreviation"),)


class LokSabhaSeat(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    state_slug: str = Field(index=True)
    name: str
    ls_number: int

    # 2024 Lok Sabha sitting MP (populated by scripts/ingest_2024_ls_mps.py
    # from ECI's "List of Successful Candidate" file). Powers the "Who
    # represents you" card on the ConstituencyDetail and Geography pages.
    # Nullable because older rows existed before these columns were added.
    mp_2024_name:     Optional[str] = Field(default=None)
    mp_2024_party:    Optional[str] = Field(default=None)
    mp_2024_gender:   Optional[str] = Field(default=None)   # 'Male' / 'Female'
    mp_2024_category: Optional[str] = Field(default=None)   # GENERAL / SC / ST / OBC
    mp_2024_seat_type: Optional[str] = Field(default=None)  # GEN / SC / ST (seat reservation)

    __table_args__ = (UniqueConstraint("state_slug", "ls_number"),)


class Constituency(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    state_slug: str = Field(index=True)
    ac_number: int
    name: str
    district: str
    ls_seat_id: Optional[int] = Field(default=None, foreign_key="loksabhaseat.id")

    __table_args__ = (UniqueConstraint("state_slug", "ac_number"),)


class Candidate(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    constituency_id: int = Field(foreign_key="constituency.id", index=True)
    state_slug: str = Field(index=True)
    name: str
    party: str
    votes: int  # total votes (EVM + postal). Source: ECI partywisewinresult / Constituencywise pages.
    is_winner: bool = False
    # EVM and postal vote splits — populated by scripts/ingest_postal.py from the
    # Constituencywise<state><ac>.htm page. Nullable because older rows existed
    # before this column was added.
    evm_votes: Optional[int] = None
    postal_votes: Optional[int] = None
    assets_cr: Optional[float] = None
    criminal_cases: Optional[int] = None
    education: Optional[str] = None
    gender: Optional[str] = None
    age: Optional[int] = None
    occupation: Optional[str] = None

    # No UniqueConstraint on (constituency_id, name, party): real elections do have
    # multiple candidates with identical name+party in the same AC (common Indian-name
    # collisions, dummy candidates, etc.). The DB allows duplicates; downstream code
    # should not assume uniqueness on this triple.


class HistoricalResult(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    state_slug: str = Field(index=True)
    ac_number: int
    constituency_name: str
    party: str
    votes: int
    is_winner: bool = False
    year: int = 2021
    # EVM and postal vote splits — populated by scripts/ingest_postal_2021.py
    # from Wayback-archived ECI Constituencywise pages. Nullable because rows
    # ingested before this column was added.
    evm_votes: Optional[int] = None
    postal_votes: Optional[int] = None

    __table_args__ = (UniqueConstraint("state_slug", "year", "ac_number", "party"),)


class NotaPerAC(SQLModel, table=True):
    """Per-AC NOTA votes for 2026. Intentionally a separate table from
    `candidate` so the existing candidate-count / per-party-stats queries
    (which already exclude NOTA) keep returning the same numbers.

    Populated by scripts/ingest_nota.py — INSERT/UPSERT only into this table,
    never touches the legacy data."""
    id: Optional[int] = Field(default=None, primary_key=True)
    state_slug: str = Field(index=True)
    ac_number: int
    votes: int
    year: int = 2026
    # When the row was last scraped — useful for refresh diffs.
    scraped_at: Optional[str] = None

    __table_args__ = (UniqueConstraint("state_slug", "year", "ac_number"),)
