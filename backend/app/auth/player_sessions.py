"""Short-lived sessions for the Emby-hosted car player (<car host>/car/play).

The player page is same-origin with Emby web, so it can read the viewer's Emby token.
It trades that token (POST body, never a URL) for an HttpOnly cookie once; the stream
WebSocket and player API then authenticate with the cookie. The Emby token stays
server-side, used to read the item and to report playback as that user.
"""

import secrets
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone

PLAYER_SESSION_TTL = timedelta(hours=12)
MAX_PLAYER_SESSIONS = 200


@dataclass
class PlayerSession:
    emby_token: str
    emby_user_id: str
    expires_at: datetime


@dataclass
class PlayerSessionStore:
    """In-memory: losing sessions on restart only means the player page re-trades its
    token (it still has it), so there is nothing worth persisting."""

    clock: Callable[[], datetime] = lambda: datetime.now(timezone.utc)
    _by_id: dict[str, PlayerSession] = field(default_factory=dict)

    def create(self, emby_token: str, emby_user_id: str) -> str:
        now = self.clock()
        for sid in [sid for sid, s in self._by_id.items() if s.expires_at <= now]:
            del self._by_id[sid]
        if len(self._by_id) >= MAX_PLAYER_SESSIONS:
            oldest = min(self._by_id, key=lambda sid: self._by_id[sid].expires_at)
            del self._by_id[oldest]
        sid = secrets.token_urlsafe(32)
        self._by_id[sid] = PlayerSession(emby_token, emby_user_id, now + PLAYER_SESSION_TTL)
        return sid

    def get(self, sid: str) -> PlayerSession | None:
        s = self._by_id.get(sid)
        now = self.clock()
        if s is None or s.expires_at <= now:
            self._by_id.pop(sid, None)
            return None
        s.expires_at = now + PLAYER_SESSION_TTL  # sliding: a long movie never expires mid-way
        return s
