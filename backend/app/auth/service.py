"""Device sessions + TV-style pairing.

Pairing: an unauthenticated browser (the car) starts a pairing and gets a secret
pairing_id (kept in page memory, used to poll) plus a 6-digit code (shown on screen /
in a QR). An already-authenticated browser (the phone) approves the code. The next poll
with the pairing_id receives the device token — exactly once — as a cookie.

The code alone is useless without an authenticated approver, and the pairing_id is
128 bits and never displayed, so neither needs brute-force protection beyond the
pending-pairing cap.
"""

import hashlib
import secrets
from collections.abc import Callable, Sequence
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone

from sqlmodel import Session, col, select

from app.auth import setup_codes
from app.auth.models import Device, utcnow
from app.auth.player_sessions import PlayerSessionStore
from app.auth.ports import EmbyTokenVerifierPort

PAIRING_TTL = timedelta(minutes=5)
MAX_PENDING_PAIRINGS = 10
LAST_SEEN_RESOLUTION = timedelta(minutes=10)


class InvalidCredentialsError(Exception):
    pass


class TooManyPairingsError(Exception):
    pass


class UnknownCodeError(Exception):
    pass


class NotFoundError(Exception):
    pass


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


@dataclass
class _Pairing:
    code: str
    expires_at: datetime
    token: str | None = None  # set on approval, cleared once delivered
    delivered: bool = False


@dataclass
class PairingRegistry:
    """In-memory: a pairing lives 5 minutes, so losing them on restart is harmless."""

    clock: Callable[[], datetime] = lambda: datetime.now(timezone.utc)
    _by_id: dict[str, _Pairing] = field(default_factory=dict)

    def _prune(self) -> None:
        now = self.clock()
        for pid in [pid for pid, p in self._by_id.items() if p.expires_at <= now]:
            del self._by_id[pid]

    def start(self) -> tuple[str, _Pairing]:
        self._prune()
        pending = sum(1 for p in self._by_id.values() if p.token is None)
        if pending >= MAX_PENDING_PAIRINGS:
            raise TooManyPairingsError("too many pending pairings, try again in a few minutes")
        active_codes = {p.code for p in self._by_id.values()}
        code = f"{secrets.randbelow(10**6):06d}"
        while code in active_codes:
            code = f"{secrets.randbelow(10**6):06d}"
        pairing = _Pairing(code=code, expires_at=self.clock() + PAIRING_TTL)
        pid = secrets.token_urlsafe(16)
        self._by_id[pid] = pairing
        return pid, pairing

    def find_pending_by_code(self, code: str) -> _Pairing:
        self._prune()
        for p in self._by_id.values():
            if p.code == code and p.token is None:
                return p
        raise UnknownCodeError("no pending pairing with that code (expired or mistyped)")

    def take(self, pairing_id: str) -> tuple[str, str | None]:
        """(status, token) — token only on the first poll after approval."""
        self._prune()
        p = self._by_id.get(pairing_id)
        if p is None or p.delivered:
            return "expired", None
        if p.token is None:
            return "pending", None
        p.delivered = True
        token, p.token = p.token, None
        del self._by_id[pairing_id]
        return "approved", token


@dataclass(frozen=True)
class Principal:
    via: str  # "api_key" | "device" | "player"
    device_id: int | None = None
    device_name: str | None = None
    # Set only for via="player": the Emby login the player session was minted from.
    emby_token: str | None = None
    emby_user_id: str | None = None


class AuthService:
    def __init__(
        self,
        api_key: str,
        pairings: PairingRegistry | None = None,
        emby_verifier: EmbyTokenVerifierPort | None = None,
        player_sessions: PlayerSessionStore | None = None,
    ) -> None:
        self._api_key = api_key
        self.pairings = pairings or PairingRegistry()
        self._emby_verifier = emby_verifier
        self.player_sessions = player_sessions or PlayerSessionStore()

    # --- credentials -------------------------------------------------------------------

    def check_api_key(self, candidate: str) -> bool:
        # No key configured = no key accepted (an empty one would otherwise match "").
        return bool(self._api_key) and secrets.compare_digest(candidate.encode(), self._api_key.encode())

    def authenticate_device(self, session: Session, token: str) -> Device | None:
        device = session.exec(select(Device).where(Device.token_hash == hash_token(token))).first()
        if device is None or device.revoked_at is not None:
            return None
        now = utcnow()
        last = device.last_seen_at if device.last_seen_at.tzinfo else device.last_seen_at.replace(tzinfo=timezone.utc)
        if now - last > LAST_SEEN_RESOLUTION:
            device.last_seen_at = now
            session.add(device)
            session.commit()
            session.refresh(device)
        return device

    def _issue(self, session: Session, name: str, user_agent: str) -> tuple[Device, str]:
        token = secrets.token_urlsafe(32)
        device = Device(name=name, token_hash=hash_token(token), user_agent=user_agent[:500])
        session.add(device)
        session.commit()
        session.refresh(device)
        return device, token

    def login_with_key(self, session: Session, key: str, name: str, user_agent: str) -> tuple[Device, str]:
        # The setup code is checked only when the key doesn't match, so a script's key
        # never counts as a wrong try at it.
        if not self.check_api_key(key) and not setup_codes.redeem(session, key.strip()):
            raise InvalidCredentialsError("wrong setup code or key")
        return self._issue(session, name, user_agent)

    async def start_player_session(self, emby_token: str, emby_user_id: str) -> str:
        if self._emby_verifier is None or not await self._emby_verifier.verify_user_token(emby_token, emby_user_id):
            raise InvalidCredentialsError("Emby token rejected")
        return self.player_sessions.create(emby_token, emby_user_id)

    def authenticate_player(self, sid: str) -> Principal | None:
        s = self.player_sessions.get(sid)
        if s is None:
            return None
        return Principal(via="player", emby_token=s.emby_token, emby_user_id=s.emby_user_id)

    # --- pairing -----------------------------------------------------------------------

    def start_pairing(self) -> tuple[str, str, datetime]:
        pid, p = self.pairings.start()
        return pid, p.code, p.expires_at

    def approve_pairing(self, session: Session, code: str, name: str) -> Device:
        pairing = self.pairings.find_pending_by_code(code)
        # The paired browser's UA is only known once it polls (record_user_agent then).
        device, token = self._issue(session, name, "")
        pairing.token = token
        return device

    def poll_pairing(self, pairing_id: str) -> tuple[str, str | None]:
        return self.pairings.take(pairing_id)

    def record_user_agent(self, session: Session, token: str, user_agent: str) -> None:
        device = session.exec(select(Device).where(Device.token_hash == hash_token(token))).first()
        if device is not None:
            device.user_agent = user_agent[:500]
            session.add(device)
            session.commit()

    # --- device management -------------------------------------------------------------

    def list_devices(self, session: Session) -> Sequence[Device]:
        return session.exec(select(Device).order_by(col(Device.created_at).desc())).all()

    def revoke(self, session: Session, device_id: int) -> Device:
        device = session.get(Device, device_id)
        if device is None:
            raise NotFoundError(f"device {device_id} not found")
        if device.revoked_at is None:
            device.revoked_at = utcnow()
            session.add(device)
            session.commit()
            session.refresh(device)
        return device
