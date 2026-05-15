#!/bin/bash
# Cron wrapper for the daily ECI probe.
# Runs scripts/probe_eci.py inside the project venv (falls back to system
# python3) and appends stdout + stderr to a per-day log.
#
# Suggested cron entry (system tz = IST, runs at 7 AM daily):
#   0 7 * * * /home/jayanth/Desktop/election-dashboard/scripts/probe_eci.sh
# If the system clock is UTC instead, use:
#   30 1 * * * /home/jayanth/Desktop/election-dashboard/scripts/probe_eci.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

LOG_DIR="$ROOT/logs"
mkdir -p "$LOG_DIR"
RUN_LOG="$LOG_DIR/probe-eci-$(date +%Y-%m-%d).log"

PY="$ROOT/venv/bin/python"
[ -x "$PY" ] || PY=python3

# Capture probe output so we can both log it AND scan it for the alert sentinel.
TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT

{
  echo "=== $(date -u +%Y-%m-%dT%H:%M:%SZ) probe starting ==="
  "$PY" "$ROOT/scripts/probe_eci.py" | tee "$TMP"
  echo "=== $(date -u +%Y-%m-%dT%H:%M:%SZ) probe finished ==="
} >> "$RUN_LOG" 2>&1

# Desktop notification + optional email when ECI data changed.
if grep -q "^ALERT:" "$TMP"; then
  ALERT_LINE="$(grep "^ALERT:" "$TMP" | head -1)"

  # 1. Desktop popup (cron has no DBUS/display env by default — inject them).
  if command -v notify-send >/dev/null 2>&1; then
    UID_NUM="$(id -u)"
    [ -z "${DBUS_SESSION_BUS_ADDRESS:-}" ] && [ -e "/run/user/$UID_NUM/bus" ] \
      && export DBUS_SESSION_BUS_ADDRESS="unix:path=/run/user/$UID_NUM/bus"
    [ -z "${DISPLAY:-}" ] && export DISPLAY=":0"
    notify-send -u critical -i dialog-warning \
      "ECI data changed" \
      "$ALERT_LINE — see logs/eci-changes.log" 2>/dev/null || true
  fi

  # 2. Email alert via SMTP if the user has credentials configured.
  SMTP_ENV="$HOME/.config/election-dashboard/smtp.env"
  if [ -f "$SMTP_ENV" ]; then
    # shellcheck disable=SC1090
    set -a; . "$SMTP_ENV"; set +a
    # Body = the most recent alert block in eci-changes.log (from last "===" header to EOF).
    ALERT_LOG="$ROOT/logs/eci-changes.log"
    BODY="$(awk 'BEGIN{block=""} /^=== / {block=$0"\n"; next} {block=block $0 "\n"} END{printf "%s", block}' "$ALERT_LOG")"
    SUBJECT="[ECI Alert] $ALERT_LINE"
    if ! printf "%s\n" "$BODY" | "$PY" "$ROOT/scripts/send_email.py" "$SUBJECT" >> "$RUN_LOG" 2>&1; then
      echo "email send failed (see run log above)" >> "$RUN_LOG"
    fi
  fi
fi
