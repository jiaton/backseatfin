from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from app.auth.player_sessions import PLAYER_SESSION_TTL, PlayerSessionStore
from app.container import auth_service
from app.core.db import get_session
from app.main import app


class Clock:
    def __init__(self) -> None:
        self.now = datetime(2026, 9, 29, tzinfo=timezone.utc)

    def __call__(self):
        return self.now


def test_sessions_slide_and_expire():
    clock = Clock()
    store = PlayerSessionStore(clock=clock)
    sid = store.create("tok", "u1")
    clock.now += PLAYER_SESSION_TTL - timedelta(minutes=1)
    assert store.get(sid).emby_user_id == "u1"  # refreshed here
    clock.now += PLAYER_SESSION_TTL - timedelta(minutes=1)
    assert store.get(sid) is not None
    clock.now += PLAYER_SESSION_TTL + timedelta(minutes=1)
    assert store.get(sid) is None


class FakeVerifier:
    async def verify_user_token(self, token, user_id):
        return token == "good-emby-token" and user_id == "u1"


@pytest.fixture
def client(session_factory, monkeypatch):
    def override():
        with session_factory() as s:
            yield s

    app.dependency_overrides[get_session] = override
    monkeypatch.setattr(auth_service, "_emby_verifier", FakeVerifier())
    yield TestClient(app)
    app.dependency_overrides.clear()


def test_player_cookie_plays_but_never_administers(client):
    bad = client.post("/api/auth/player-session", json={"emby_token": "wrong-token", "emby_user_id": "u1"})
    assert bad.status_code == 401
    r = client.post("/api/auth/player-session", json={"emby_token": "good-emby-token", "emby_user_id": "u1"})
    assert r.status_code == 204 and "bsf_player" in r.cookies
    # Playback-only: admin routes and the admin session stay closed.
    assert client.get("/api/youtube/sources").status_code == 401
    assert client.get("/api/auth/devices").status_code == 401
    assert client.get("/api/auth/session").json()["authenticated"] is False
    # …but the stream socket accepts it (unknown source then closes 1008 after accept).
    with client.websocket_connect("/api/stream/ws?source=nope") as ws:
        from starlette.websockets import WebSocketDisconnect

        with pytest.raises(WebSocketDisconnect) as exc:
            ws.receive_bytes()
        assert "unknown source" in exc.value.reason


def test_stale_player_cookie_is_401(client):
    client.cookies.set("bsf_player", "forged")
    assert client.get("/api/emby/items/5").status_code == 401
