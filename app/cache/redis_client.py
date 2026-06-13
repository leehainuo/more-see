from __future__ import annotations

from contextlib import asynccontextmanager

from redis.asyncio import Redis, from_url

from app.config import settings

_redis: Redis | None = None


def get_redis() -> Redis:
    global _redis
    if _redis is None:
        _redis = from_url(settings.redis_dsn, decode_responses=True)
    return _redis


@asynccontextmanager
async def redis_scope() -> Redis:
    yield get_redis()


async def shutdown_redis() -> None:
    global _redis
    if _redis is None:
        return
    await _redis.aclose()
    _redis = None

