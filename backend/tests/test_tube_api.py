import pytest
from fastapi.testclient import TestClient

from app.container import tube_service
from app.core.db import get_session
from app.main import app
from app.tube.models import WatchedVideo
from tests.test_tube_service import VID, FakeSource, FakeWeb

KEY = {"X-API-Key": "test-key"}


@pytest.fixture
def client(session_factory, monkeypatch):
    def override():
        with session_factory() as s:
            yield s

    app.dependency_overrides[get_session] = override
    monkeypatch.setattr(tube_service, "_source", FakeSource())
    monkeypatch.setattr(tube_service, "_web", FakeWeb())
    yield TestClient(app)
    app.dependency_overrides.clear()


def test_home_with_a_video_to_continue_prefetches_it_without_failing(client, session_factory):
    # Regression: home ran in a worker thread, where starting the prefetch task raised.
    with session_factory() as s:
        s.add(WatchedVideo(video_id=VID, title="BBB", duration_seconds=635, position_seconds=100))
        s.commit()
    r = client.get("/api/tube/home", headers=KEY)
    assert r.status_code == 200
    assert [v["id"] for v in r.json()["continue_watching"]] == [VID]


def test_tube_routes_need_a_signed_in_device(client):
    assert client.get("/api/tube/home").status_code == 401
    assert client.get("/api/tube/link", params={"url": "https://youtu.be/aqz-KE-bpKQ"}, headers=KEY).json() == {"kind": "video", "id": VID}
