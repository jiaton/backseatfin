import pytest

from app.youtube.models import PlaylistSource, Video, VideoStatus
from app.youtube.ports import PlaylistEntry, PlaylistInfo, SourceUnavailableError
from app.youtube.service import MAX_ATTEMPTS, ConflictError, PlaylistService, VideoService


class FakeSource:
    def __init__(self, entries: list[str], fail: bool = False) -> None:
        self.entries = entries
        self.fail = fail
        self.fetches = 0

    def fetch_playlist(self, url: str) -> PlaylistInfo:
        self.fetches += 1
        if self.fail:
            raise SourceUnavailableError("private playlist")
        return PlaylistInfo(
            title="Car",
            entries=[PlaylistEntry(video_id=v, title=f"T {v}", channel="Ch", duration_seconds=60) for v in self.entries],
        )

    def download(self, *a, **kw):  # not used by these services
        raise NotImplementedError


class FakeQueue:
    def __init__(self) -> None:
        self.wakes = 0
        self.cancel_requests: list[int] = []

    def wake(self) -> None:
        self.wakes += 1

    def request_cancel(self, video_id: int) -> bool:
        self.cancel_requests.append(video_id)
        return True


async def test_add_source_queues_every_entry_and_wakes_worker(session_factory):
    source, queue = FakeSource(["a", "b"]), FakeQueue()
    svc = PlaylistService(source, queue)
    with session_factory() as s:
        src = await svc.add_source(s, "https://youtube.com/playlist?list=X")
        videos = s.exec(Video.__table__.select()).all()
    assert src.title == "Car"
    assert len(videos) == 2 and all(v.status == VideoStatus.QUEUED for v in videos)
    assert queue.wakes == 1


async def test_duplicate_source_is_rejected_before_fetching(session_factory):
    source = FakeSource(["a"])
    svc = PlaylistService(source, FakeQueue())
    with session_factory() as s:
        await svc.add_source(s, "u")
        with pytest.raises(ConflictError):
            await svc.add_source(s, "u")
    assert source.fetches == 1


async def test_unreadable_source_is_not_created(session_factory):
    svc = PlaylistService(FakeSource([], fail=True), FakeQueue())
    with session_factory() as s:
        with pytest.raises(SourceUnavailableError):
            await svc.add_source(s, "u")
        assert s.exec(PlaylistSource.__table__.select()).all() == []


async def test_sync_only_adds_new_and_requeues_failed_under_attempt_cap(session_factory):
    source, queue = FakeSource(["a", "b"]), FakeQueue()
    svc = PlaylistService(source, queue)
    with session_factory() as s:
        src = await svc.add_source(s, "u")
        a, b = s.get(Video, 1), s.get(Video, 2)
        a.status, a.attempts = VideoStatus.FAILED, 1
        b.status, b.attempts = VideoStatus.FAILED, MAX_ATTEMPTS
        s.add_all([a, b])
        s.commit()

        source.entries = ["a", "b", "c"]
        new, err = await svc.sync_source(s, src.id)
        assert (new, err) == (2, None)  # c is new, a is requeued, b hit the cap
        statuses = {v.youtube_id: v.status for v in s.exec(Video.__table__.select()).all()}
    assert statuses == {"a": VideoStatus.QUEUED, "b": VideoStatus.FAILED, "c": VideoStatus.QUEUED}


async def test_sync_failure_is_recorded_on_the_source_not_raised(session_factory):
    source = FakeSource(["a"])
    svc = PlaylistService(source, FakeQueue())
    with session_factory() as s:
        src = await svc.add_source(s, "u")
        source.fail = True
        new, err = await svc.sync_source(s, src.id)
        s.refresh(src)
    assert new == 0 and "private" in err and src.last_error == err


async def test_cancel_queued_is_immediate_downloading_is_delegated(session_factory):
    queue = FakeQueue()
    svc = PlaylistService(FakeSource(["a", "b"]), queue)
    videos = VideoService(queue)
    with session_factory() as s:
        await svc.add_source(s, "u")
        assert videos.cancel(s, 1).status == VideoStatus.CANCELLED
        b = s.get(Video, 2)
        b.status = VideoStatus.DOWNLOADING
        s.add(b)
        s.commit()
        videos.cancel(s, 2)
        assert queue.cancel_requests == [2]
        with pytest.raises(ConflictError):
            videos.cancel(s, 1)
        assert videos.retry(s, 1).status == VideoStatus.QUEUED
