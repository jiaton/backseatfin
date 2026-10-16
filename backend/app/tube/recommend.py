"""Recommendations from what this household does, nothing else: more from channels it
watches often (or, early on, most recently) but doesn't follow, older videos of channels it follows, and fresh
results for what it searches for most. Nothing it has watched, saved or already sees on
the home screen. Computed in the background (several YouTube lookups) and cached."""

import asyncio
import logging
import time
from collections import Counter
from collections.abc import Callable, Iterable, Sequence
from dataclasses import dataclass

from sqlmodel import Session, col, select

from app.tube.models import FeedVideo, FollowedChannel, LaterVideo, PlaylistItem, SearchQuery, WatchedVideo, utcnow
from app.tube.ports import SearchKind, TubeUnavailableError, VideoCard
from app.tube.service import InvalidIdError, TubeService

log = logging.getLogger(__name__)

RECOMMEND_TTL_S = 1800
FIRST_WAIT_S = 3.0
LIMIT = 24
SEARCH_HISTORY = 50
# Watched at least this often and not followed: "you seem to like this channel".
OFTEN = 2


@dataclass(frozen=True)
class Inputs:
    """What the household did, read from the database before asking YouTube."""

    often: list[str]  # channels watched often, not followed
    followed: list[str]  # followed channels, most watched first
    searches: list[str]
    exclude: set[str]  # videos watched, saved or on the home screen already


def read_inputs(s: Session) -> Inputs:
    watched = s.exec(select(WatchedVideo).order_by(col(WatchedVideo.watched_at).desc()).limit(200)).all()
    followed = [c.channel_id for c in s.exec(select(FollowedChannel)).all()]
    exclude = (
        {w.video_id for w in watched}
        | {v.video_id for v in s.exec(select(LaterVideo)).all()}
        | {f.video_id for f in s.exec(select(FeedVideo)).all()}
        | {p.video_id for p in s.exec(select(PlaylistItem)).all()}
    )
    searches = s.exec(select(SearchQuery).order_by(col(SearchQuery.count).desc(), col(SearchQuery.last_at).desc()).limit(2)).all()
    by_channel = Counter(w.channel_id for w in watched if w.channel_id)
    often = [c for c, n in by_channel.most_common() if n >= OFTEN and c not in followed][:3]
    # Early on nothing is watched twice: the channels watched most recently fill in.
    for w in watched:
        if len(often) >= 3:
            break
        if w.channel_id and w.channel_id not in followed and w.channel_id not in often:
            often.append(w.channel_id)
    return Inputs(
        often=often,
        # Their newest are in the feed already; the ones you watch most first.
        followed=sorted(followed, key=lambda c: -by_channel[c])[:3],
        searches=[q.query for q in searches],
        exclude=exclude,
    )


class Recommender:
    def __init__(self, tube: TubeService, clock: Callable[[], float] = time.monotonic) -> None:
        self._tube = tube
        self._clock = clock
        self._cached: list[VideoCard] | None = None
        self._cached_at = 0.0
        self._task: asyncio.Task[list[VideoCard]] | None = None

    # --- search history (an input) ------------------------------------------------------

    def record_search(self, session: Session, query: str) -> None:
        key = " ".join(query.lower().split())[:200]
        if not key:
            return
        row = session.get(SearchQuery, key) or SearchQuery(query=key, count=0)
        row.count += 1
        row.last_at = utcnow()
        session.add(row)
        session.commit()
        for stale in session.exec(select(SearchQuery).order_by(col(SearchQuery.last_at).desc()).offset(SEARCH_HISTORY)).all():
            session.delete(stale)
        session.commit()

    # --- recommendations ----------------------------------------------------------------

    def invalidate(self) -> None:
        """Something changed (followed, watched): recompute on the next ask."""
        self._cached_at = 0.0

    async def recommendations(self, session: Session) -> list[VideoCard]:
        fresh = self._cached is not None and self._clock() - self._cached_at < RECOMMEND_TTL_S
        if fresh:
            return self._cached  # type: ignore[return-value]
        if self._task is None or self._task.done():
            self._task = asyncio.create_task(self._compute(read_inputs(session)), name="tube-recommend")
            self._task.add_done_callback(self._store)
        if self._cached is not None:
            return self._cached  # a little stale while the new ones come in
        try:
            return await asyncio.wait_for(asyncio.shield(self._task), FIRST_WAIT_S)
        except TimeoutError:
            return []

    def _store(self, task: asyncio.Task[list[VideoCard]]) -> None:
        if task.cancelled() or task.exception():
            if not task.cancelled():
                log.warning("recommendations failed: %s", task.exception())
            return
        self._cached = task.result()
        self._cached_at = self._clock()

    async def _compute(self, inputs: Inputs) -> list[VideoCard]:
        sources: list[list[VideoCard]] = []
        for channel_id in inputs.often:
            sources.append(await self._channel_videos(channel_id, 0, 10))
        for channel_id in inputs.followed:
            sources.append(await self._channel_videos(channel_id, 5, 20))
        for q in inputs.searches:
            sources.append(await self._search(q))
        return pick(sources, inputs.exclude, LIMIT)

    async def _channel_videos(self, channel_id: str, start: int, end: int) -> list[VideoCard]:
        try:
            return (await self._tube.channel(channel_id)).videos[start:end]
        except (TubeUnavailableError, InvalidIdError) as e:
            log.info("recommend: channel %s: %s", channel_id, e)
            return []

    async def _search(self, query: str) -> list[VideoCard]:
        try:
            return (await self._tube.search(query, SearchKind.VIDEOS)).videos[:10]
        except TubeUnavailableError as e:
            log.info("recommend: search %r: %s", query, e)
            return []


def pick(sources: Sequence[Iterable[VideoCard]], exclude: set[str], limit: int) -> list[VideoCard]:
    """Round-robin over the sources (so no single one fills the row), skipping excluded
    and repeated videos and live streams."""
    iterators = [iter(s) for s in sources]
    seen = set(exclude)
    out: list[VideoCard] = []
    while iterators and len(out) < limit:
        for it in list(iterators):
            for card in it:
                if card.id not in seen and not card.is_live:
                    seen.add(card.id)
                    out.append(card)
                    break
            else:
                iterators.remove(it)
            if len(out) >= limit:
                break
    return out
