"""One-time setup codes (see models.SetupCode).

A code works once, for a limited time, and is burnt after MAX_ATTEMPTS wrong tries, so
guessing 6 digits is hopeless (5 in a million) and the worst a stranger can do is make
the owner issue a new one. Only the hash is stored."""

import hashlib
import secrets
from datetime import datetime, timedelta, timezone

from sqlmodel import Session, col, select

from app.auth.models import Device, SetupCode, utcnow

FIRST_START_TTL = timedelta(hours=24)
COMMAND_TTL = timedelta(minutes=15)
MAX_ATTEMPTS = 5


def hash_token(code: str) -> str:
    return hashlib.sha256(code.encode()).hexdigest()


def _aware(t: datetime) -> datetime:
    return t if t.tzinfo else t.replace(tzinfo=timezone.utc)


def issue(session: Session, ttl: timedelta) -> str:
    """A new code, replacing any earlier one."""
    code = f"{secrets.randbelow(10**6):06d}"
    row = session.get(SetupCode, 1) or SetupCode(id=1, code_hash="", expires_at=utcnow())
    row.code_hash = hash_token(code)
    row.expires_at = utcnow() + ttl
    row.attempts = 0
    session.add(row)
    session.commit()
    return code


def redeem(session: Session, candidate: str) -> bool:
    """True once for the right code within its time; a wrong try counts toward burning it."""
    row = session.get(SetupCode, 1)
    if row is None or _aware(row.expires_at) <= utcnow():
        return False
    if secrets.compare_digest(row.code_hash, hash_token(candidate)):
        session.delete(row)
        session.commit()
        return True
    row.attempts += 1
    if row.attempts >= MAX_ATTEMPTS:
        session.delete(row)
    else:
        session.add(row)
    session.commit()
    return False


def has_devices(session: Session) -> bool:
    return session.exec(select(Device.id).where(col(Device.revoked_at).is_(None))).first() is not None
