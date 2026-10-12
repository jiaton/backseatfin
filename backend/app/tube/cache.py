"""A small in-memory TTL cache that also shares one in-flight load per key, so ten
cards asking for the same channel cause one yt-dlp call, not ten."""

import asyncio
import time
from collections import OrderedDict
from collections.abc import Awaitable, Callable
from typing import Generic, TypeVar

T = TypeVar("T")


class TtlCache(Generic[T]):
    def __init__(self, max_entries: int, clock: Callable[[], float] = time.monotonic) -> None:
        self._entries: OrderedDict[str, tuple[float, T]] = OrderedDict()
        self._loading: dict[str, asyncio.Future[T]] = {}
        self._max = max_entries
        self._clock = clock

    def peek(self, key: str) -> T | None:
        hit = self._entries.get(key)
        if hit and hit[0] > self._clock():
            self._entries.move_to_end(key)
            return hit[1]
        return None

    def put(self, key: str, value: T, ttl: float) -> None:
        self._entries[key] = (self._clock() + ttl, value)
        self._entries.move_to_end(key)
        while len(self._entries) > self._max:
            self._entries.popitem(last=False)

    def drop(self, key: str) -> None:
        self._entries.pop(key, None)

    async def get(self, key: str, load: Callable[[], Awaitable[T]], ttl: Callable[[T], float] | float) -> T:
        if (hit := self.peek(key)) is not None:
            return hit
        if key in self._loading:
            return await asyncio.shield(self._loading[key])
        future: asyncio.Future[T] = asyncio.get_running_loop().create_future()
        self._loading[key] = future
        try:
            value = await load()
        except BaseException as e:
            future.set_exception(e)
            future.exception()  # retrieved: no "never retrieved" warning when nobody else waits
            raise
        finally:
            self._loading.pop(key, None)
        self.put(key, value, ttl(value) if callable(ttl) else ttl)
        future.set_result(value)
        return value
