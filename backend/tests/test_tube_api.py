import pytest
from fastapi.testclient import TestClient

from app.container import tube_service
from app.core.db import get_session
from app.main import app
from datetime import timedelta

from app.tube.models import WatchedVideo, utcnow
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


def test_home_never_recommends_what_another_row_shows(client, session_factory, monkeypatch):
    from app.container import recommender
    from app.tube.ports import VideoCard

    async def fixed(session):
        return [VideoCard(VID, "BBB"), VideoCard("zzzzzzzzzzz", "Something new")]

    monkeypatch.setattr(recommender, "recommendations", fixed)
    with session_factory() as s:
        s.add(WatchedVideo(video_id=VID, title="BBB", duration_seconds=635, position_seconds=100))
        s.commit()
    body = client.get("/api/tube/home", headers=KEY).json()
    assert [v["id"] for v in body["recommended"]] == ["zzzzzzzzzzz"]


def test_next_follows_watch_later_and_a_followed_playlist_row(client, session_factory):
    import asyncio

    from app.container import playlist_library
    from app.tube.models import LaterVideo

    with session_factory() as s:
        for i, vid in enumerate(["aaaaaaaaaaa", "bbbbbbbbbbb"]):
            s.add(LaterVideo(video_id=vid, title=vid, added_at=utcnow() - timedelta(minutes=i)))
        s.commit()
        asyncio.run(playlist_library.follow(s, "PLa1F2ddGya_-UvuAqHAksYnB0qL9yWDO6"))
    nxt = lambda lst, after: client.get("/api/tube/next", params={"list": lst, "after": after}, headers=KEY)
    assert nxt("later", "aaaaaaaaaaa").json()["id"] == "bbbbbbbbbbb"  # newest saved first
    assert nxt("later", "bbbbbbbbbbb").json() is None  # the end
    # the home row is newest added first: "Second added", then "First added"
    assert nxt("shelf:PLa1F2ddGya_-UvuAqHAksYnB0qL9yWDO6", "bbbbbbbbbbb").json()["id"] == "aaaaaaaaaaa"
    assert nxt("playlist:PLa1F2ddGya_-UvuAqHAksYnB0qL9yWDO6", "aaaaaaaaaaa").json()["id"] == "bbbbbbbbbbb"  # YouTube's order
    assert nxt("nonsense", "aaaaaaaaaaa").status_code == 422
