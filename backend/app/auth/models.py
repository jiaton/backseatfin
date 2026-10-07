from datetime import datetime, timezone

from sqlmodel import Field, SQLModel


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Device(SQLModel, table=True):
    """A browser that holds a long-lived session cookie (the car, a phone). Only the
    SHA-256 of the token is stored; the raw token only ever exists in the cookie."""

    id: int | None = Field(default=None, primary_key=True)
    name: str
    token_hash: str = Field(unique=True, index=True)
    user_agent: str = ""
    created_at: datetime = Field(default_factory=utcnow)
    last_seen_at: datetime = Field(default_factory=utcnow)
    revoked_at: datetime | None = None
