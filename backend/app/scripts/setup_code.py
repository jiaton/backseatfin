"""`backseatfin-code`: print a one-time code that signs in a new phone (lost the old
one, or a new browser with none signed in to approve it). Running it needs a shell on
the server, which is the proof of ownership."""

from sqlmodel import Session

from app.auth import setup_codes
from app.core.db import engine, init_db


def main() -> None:
    init_db()
    with Session(engine) as session:
        code = setup_codes.issue(session, setup_codes.COMMAND_TTL)
    minutes = int(setup_codes.COMMAND_TTL.total_seconds() // 60)
    print(f"Setup code: {code}  (works once, for {minutes} minutes)")
    print("Open BackseatFin on the phone and choose \"Sign in with a setup code\".")


if __name__ == "__main__":
    main()
