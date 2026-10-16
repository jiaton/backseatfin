import asyncio

from app.tube.playlists import PlaylistLibrary
from app.tube.ports import VideoCard
from app.tube.service import TubeService
from tests.test_tube_service import FakeSource, FakeWeb

PL = "PLa1F2ddGya_-UvuAqHAksYnB0qL9yWDO6"


def _lib(tmp_path):
    src = FakeSource()
    return PlaylistLibrary(TubeService(src, FakeWeb(), tmp_path)), src


def test_following_a_playlist_lists_its_videos_newest_added_first(tmp_path, session_factory):
    lib, _ = _lib(tmp_path)
    with session_factory() as s:
        row = asyncio.run(lib.follow(s, PL))
        assert row.title == "Car list"
        assert [i.title for i in lib.items(s, PL, 10)] == ["Second added", "First added"]


def test_a_video_added_on_the_phone_leads_and_a_removed_one_goes(tmp_path, session_factory):
    lib, src = _lib(tmp_path)
    with session_factory() as s:
        row = asyncio.run(lib.follow(s, PL))
        src.playlist_videos = [src.playlist_videos[1], VideoCard("ccccccccccc", "Added in the car park")]
        asyncio.run(lib.refresh_playlist(s, row))
        assert [i.title for i in lib.items(s, PL, 10)] == ["Added in the car park", "Second added"]
        lib.unfollow(s, PL)
        assert lib.items(s, PL, 10) == [] and lib.followed(s) == []


def test_only_stale_playlists_are_read_again_on_open(tmp_path, session_factory):
    lib, src = _lib(tmp_path)
    calls = []
    original = src.playlist
    src.playlist = lambda pid, limit: calls.append(pid) or original(pid, limit)
    with session_factory() as s:
        asyncio.run(lib.follow(s, PL))
        calls.clear()
        asyncio.run(lib.refresh_stale_playlists(s))
        assert calls == []  # just read
