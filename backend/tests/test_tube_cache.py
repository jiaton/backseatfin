import asyncio

import pytest

from app.tube.cache import TtlCache


def test_entries_expire_and_the_oldest_is_evicted():
    now = [0.0]
    cache: TtlCache[int] = TtlCache(2, clock=lambda: now[0])
    cache.put("a", 1, ttl=10)
    cache.put("b", 2, ttl=10)
    cache.put("c", 3, ttl=10)
    assert cache.peek("a") is None and cache.peek("c") == 3
    now[0] = 11
    assert cache.peek("c") is None


def test_one_load_per_key_while_it_is_in_flight():
    calls = 0

    async def load():
        nonlocal calls
        calls += 1
        await asyncio.sleep(0.01)
        return calls

    async def main():
        cache: TtlCache[int] = TtlCache(10)
        return await asyncio.gather(*(cache.get("k", load, 60) for _ in range(5)))

    assert asyncio.run(main()) == [1] * 5 and calls == 1


def test_a_failed_load_is_not_cached():
    async def main():
        cache: TtlCache[int] = TtlCache(10)

        async def boom():
            raise ValueError("no")

        with pytest.raises(ValueError):
            await cache.get("k", boom, 60)

        async def ok():
            return 7

        return await cache.get("k", ok, 60)

    assert asyncio.run(main()) == 7
