"""
Tiny SMTP sender used by probe_eci.sh to email ECI change alerts.

Reads the message body from stdin and SMTP credentials from environment
variables (see scripts/smtp.env.example). Usage:

  cat body.txt | python scripts/send_email.py "Subject line"

Exits 0 on success, non-zero on failure. Required env vars:
  SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, ALERT_FROM, ALERT_TO
"""
from __future__ import annotations

import os
import smtplib
import ssl
import sys
from email.message import EmailMessage


def main() -> int:
    try:
        host = os.environ["SMTP_HOST"]
        port = int(os.environ.get("SMTP_PORT", "587"))
        user = os.environ["SMTP_USER"]
        password = os.environ["SMTP_PASS"]
        sender = os.environ.get("ALERT_FROM", user)
        recipient = os.environ["ALERT_TO"]
    except KeyError as e:
        print(f"missing SMTP env var: {e}", file=sys.stderr)
        return 2

    subject = sys.argv[1] if len(sys.argv) > 1 else "ECI alert"
    body = sys.stdin.read() or "(empty body)"

    msg = EmailMessage()
    msg["From"] = sender
    msg["To"] = recipient
    msg["Subject"] = subject
    msg.set_content(body)

    with smtplib.SMTP(host, port, timeout=30) as s:
        s.ehlo()
        s.starttls(context=ssl.create_default_context())
        s.ehlo()
        s.login(user, password)
        s.send_message(msg)
    print(f"sent to {recipient}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
