import asyncio

from app.tube.models import FollowedChannel, LaterVideo, SearchQuery, WatchedVideo
from app.tube.ports import VideoCard
from app.tube.recommend import Recommender, pick
from app.tube.service import TubeService
from tests.test_tube_service import FakeSource, FakeWeb

UCX = "UCz75RVbH8q2jdBJ4SnwuZZQ"
UCY = "UCSMOQeBJ2RAnuFungnQOxLg"


def _v(i: str, live=False) -> VideoCard:
    return VideoCard(i * 11, f"video {i}", is_live=live)


def test_pick_takes_turns_and_skips_what_was_seen_live_or_repeated():
    sources = [[_v("a"), _v("b"), _v("c")], [_v("a"), _v("d", live=True), _v("e")], [_v("f")]]
    assert [c.title for c in pick(sources, {"b" * 11}, 10)] == ["video a", "video e", "video f", "video c"]
    assert len(pick(sources, set(), 2)) == 2


def test_recommends_from_often_watched_channels_and_searches_but_nothing_already_seen(tmp_path, session_factory):
    src = FakeSource()
    src.channel_videos = [_v("w"), _v("x"), _v("y")]
    src.search_videos = [_v("s"), _v("x")]
    rec = Recommender(TubeService(src, FakeWeb(), tmp_path))
    with session_factory() as s:
        for vid in ("1", "2"):  # watched the same channel twice
            s.add(WatchedVideo(video_id=vid * 11, title=vid, channel_id=UCX, position_seconds=100))
        s.add(WatchedVideo(video_id="w" * 11, title="w", channel_id=UCX))
        s.add(LaterVideo(video_id="y" * 11, title="y"))
        rec.record_search(s, "  Blender   Open movie ")
        assert s.get(SearchQuery, "blender open movie").count == 1
        out = asyncio.run(rec.recommendations(s))
    assert [c.id for c in out] == ["x" * 11, "s" * 11]  # not watched "w", not saved "y", "x" once


def test_followed_channels_contribute_their_older_videos(tmp_path, session_factory):
    src = FakeSource()
    src.channel_videos = [_v(c) for c in "abcdefg"]  # the newest five are in the feed already
    rec = Recommender(TubeService(src, FakeWeb(), tmp_path))
    with session_factory() as s:
        s.add(FollowedChannel(channel_id=UCY, name="Y"))
        s.commit()
        assert [c.title for c in asyncio.run(rec.recommendations(s))] == ["video f", "video g"]


def test_early_on_the_channels_watched_last_fill_in(tmp_path, session_factory):
    src = FakeSource()
    src.channel_videos = [_v("n"), _v("m")]
    rec = Recommender(TubeService(src, FakeWeb(), tmp_path))
    with session_factory() as s:
        s.add(WatchedVideo(video_id="o" * 11, title="once", channel_id=UCX))  # one watch only
        s.commit()
        assert [c.title for c in asyncio.run(rec.recommendations(s))] == ["video n", "video m"]
