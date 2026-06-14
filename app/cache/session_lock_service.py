from __future__ import annotations

import asyncio
import secrets

from app.cache.redis_client import get_redis
from app.core.config import settings


class SessionLockService:
    def __init__(self) -> None:
        pass

    async def acquire(self, *, session_id: str) -> str | None:
        token = secrets.token_hex(16)
        key = self._key(session_id)
        redis = get_redis()
        ok = await redis.set(key, token, ex=settings.redis_lock_ttl_seconds, nx=True)
        if ok:
            return token
        return None

    async def refresh(self, *, session_id: str, token: str) -> bool:
        key = self._key(session_id)
        redis = get_redis()
        current = await redis.get(key)
        if current != token:
            return False
        await redis.expire(key, settings.redis_lock_ttl_seconds)
        return True

    async def release(self, *, session_id: str, token: str) -> None:
        key = self._key(session_id)
        redis = get_redis()
        current = await redis.get(key)
        if current == token:
            await redis.delete(key)

    async def run_heartbeat(self, *, session_id: str, token: str, stop_event: asyncio.Event) -> None:
        while not stop_event.is_set():
            await asyncio.sleep(max(1, settings.redis_lock_ttl_seconds // 2))
            ok = await self.refresh(session_id=session_id, token=token)
            if not ok:
                stop_event.set()
                return

    @staticmethod
    def _key(session_id: str) -> str:
        return f"moresee:session-lock:{session_id}"


session_lock_service = SessionLockService()
