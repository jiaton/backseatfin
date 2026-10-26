import asyncio
import time

import pytest
from fastapi.testclient import TestClient

import app.stream.routes as routes
from app.container import auth_service
from app.core.db import get_session
from app.main import app
from app.stream.ports import OutputFormat


class FakeVerifier:
    async def verify_user_token(self, token, user_id):
        return True


class FakeStreams:
    """Stands in for StreamService: an endless stream, counting what was read from it."""

    def __init__(self):
        self.requests = []
        self.read = 0

    async def open(self, request, viewer, output):
        self.requests.append((request, output))
        while True:
            self.read += 1
            yield b"x" * 188
            await asyncio.sleep(0.005)


@pytest.fixture
def client(session_factory, monkeypatch):
    def override():
        with session_factory() as s:
            yield s

    app.dependency_overrides[get_session] = override
    monkeypatch.setattr(auth_service, "_emby_verifier", FakeVerifier())
    streams = FakeStreams()
    monkeypatch.setattr(routes, "stream_service", streams)
    c = TestClient(app)
    assert c.post("/api/auth/player-session", json={"emby_token": "good-emby-token", "emby_user_id": "u1"}).status_code == 204
    yield c, streams
    app.dependency_overrides.clear()


def _settle():
    time.sleep(0.3)


def test_flow_control_holds_and_releases_the_stream(client):
    c, streams = client
    with c.websocket_connect("/api/stream/ws?source=emby:5&format=h264ts&flow=1") as ws:
        ws.receive_bytes()
        request, output = streams.requests[0]
        assert output is OutputFormat.H264_TS
        assert request.paced is False  # as fast as the client takes it
        ws.send_text("hold")
        _settle()
        held = streams.read
        _settle()
        assert streams.read <= held + 1  # nothing more read while held
        ws.send_text("go")
        _settle()
        assert streams.read > held + 5


def test_acknowledging_client_gets_at_most_a_window_in_flight(client, monkeypatch):
    c, streams = client
    monkeypatch.setattr(routes, "SEND_WINDOW", 188 * 10)
    with c.websocket_connect("/api/stream/ws?source=emby:5&format=h264ts&flow=1") as ws:
        ws.receive_bytes()
        ws.send_text("ack 188")
        _settle()
        assert streams.read <= 12  # one window past the ack (plus the chunk in hand)
        ws.send_text(f"ack {188 * 11}")
        _settle()
        assert 18 <= streams.read <= 22
        ws.send_text("ack nonsense")  # ignored
        _settle()
        assert streams.read <= 22


def test_without_flow_control_the_stream_is_paced(client):
    c, streams = client
    with c.websocket_connect("/api/stream/ws?source=emby:5&format=h264ts") as ws:
        ws.receive_bytes()
        assert streams.requests[0][0].paced is True


def test_jsmpeg_is_always_paced(client):
    c, streams = client
    with c.websocket_connect("/api/stream/ws?source=emby:5&format=jsmpeg_ts&flow=1") as ws:
        ws.receive_bytes()
        assert streams.requests[0][0].paced is True
