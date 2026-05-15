"""
Daily probe that detects ECI 2026 assembly-result changes WITHOUT touching the
dashboard's SQLite database.

For each of the 5 states it fetches two small summary pages:
  - partywiseresult-{CODE}.htm   (party seat counts)
  - voteshareresult-{CODE}.htm   (party vote totals + share)

It extracts the structured data, hashes it, and compares against the
last-known hash in data/.eci_hashes.json. When a hash differs:
  - The state, old hash, new hash, and full new fingerprint are appended to
    logs/eci-changes.log
  - The hashes file is updated so the same delta isn't re-alerted tomorrow

This script never writes to election.db. Refreshing the dashboard remains a
deliberate manual step the user runs after reviewing the alert log.
"""
from __future__ import annotations

import hashlib
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from backend.config.states import STATE_CONFIG  # noqa: E402
from backend.scrapers.eci import scrape_partywise, scrape_voteshare  # noqa: E402

HASHES_FILE = ROOT / "data" / ".eci_hashes.json"
ALERT_LOG = ROOT / "logs" / "eci-changes.log"


def fingerprint_state(slug: str) -> dict:
    """Return a deterministic, sortable summary of ECI's published numbers."""
    partywise = sorted(
        ({"party": r["party"], "seats": r["seats_won"]} for r in scrape_partywise(slug)),
        key=lambda x: x["party"],
    )
    voteshare = scrape_voteshare(slug)
    voteshare_compact = sorted(
        ({"party": k, "votes": v["votes"], "share": v["share"]}
         for k, v in voteshare.items()),
        key=lambda x: x["party"],
    )
    return {"partywise": partywise, "voteshare": voteshare_compact}


def hash_of(data: dict) -> str:
    return hashlib.sha256(json.dumps(data, sort_keys=True).encode()).hexdigest()[:16]


def main() -> int:
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    prev = json.loads(HASHES_FILE.read_text()) if HASHES_FILE.exists() else {}
    current: dict[str, str] = {}
    changes: list[tuple[str, str, str, dict]] = []
    errors: list[tuple[str, str]] = []

    for slug in STATE_CONFIG:
        try:
            fp = fingerprint_state(slug)
        except Exception as e:
            errors.append((slug, repr(e)))
            current[slug] = prev.get(slug, "ERROR")
            continue
        h = hash_of(fp)
        current[slug] = h
        prev_h = prev.get(slug)
        if prev_h is None:
            print(f"[{slug}] baseline recorded: {h}")
        elif prev_h != h:
            changes.append((slug, prev_h, h, fp))
            print(f"[{slug}] CHANGED: {prev_h} -> {h}")
        else:
            print(f"[{slug}] unchanged ({h})")

    HASHES_FILE.parent.mkdir(parents=True, exist_ok=True)
    HASHES_FILE.write_text(json.dumps(current, indent=2) + "\n")

    if changes:
        ALERT_LOG.parent.mkdir(parents=True, exist_ok=True)
        with ALERT_LOG.open("a") as f:
            f.write(f"\n=== {now} | {len(changes)} state(s) changed ===\n")
            for slug, prev_h, new_h, fp in changes:
                f.write(f"  {slug}: {prev_h} -> {new_h}\n")
                f.write(f"    partywise: {json.dumps(fp['partywise'])}\n")
                f.write(f"    voteshare: {json.dumps(fp['voteshare'])}\n")
            f.write("  Review the diff and re-run the scrapers manually if it warrants a refresh.\n")
        print(f"\nALERT: {len(changes)} state(s) changed. Details appended to {ALERT_LOG}")

    if errors:
        print(f"\n{len(errors)} probe error(s):", file=sys.stderr)
        for slug, err in errors:
            print(f"  {slug}: {err}", file=sys.stderr)
        # Non-fatal: still exit 0 so cron treats this as a normal run.

    if not changes and not errors:
        print(f"\n[{now}] No changes across {len(STATE_CONFIG)} states.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
