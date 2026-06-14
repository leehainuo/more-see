from __future__ import annotations

import asyncio
import base64
import binascii

from app.adapters.volcengine_asr import VolcengineAsrStreamSession
from app.core.config import settings


class AsrStreamService:
    def __init__(self) -> None:
        self._sessions: dict[str, VolcengineAsrStreamSession] = {}
        self._lock = asyncio.Lock()

    async def push_audio_chunk(self, *, session_id: str, mime_type: str, base64_audio: str) -> None:
        if not settings.volcengine_asr_streaming_enabled:
            return
        if settings.asr_provider != "volcengine":
            return
        if not settings.volcengine_speech_api_key:
            return
        if not base64_audio:
            return
        try:
            audio_bytes = base64.b64decode(base64_audio)
        except (binascii.Error, ValueError):
            return
        if not audio_bytes:
            return
        async with self._lock:
            session = self._sessions.get(session_id)
            if session is None:
                session = VolcengineAsrStreamSession(mime_type=mime_type)
                await session.start()
                self._sessions[session_id] = session
        await session.push_audio(audio_bytes)

    async def finalize(self, *, session_id: str) -> str | None:
        if not settings.volcengine_asr_streaming_enabled:
            return None
        async with self._lock:
            session = self._sessions.pop(session_id, None)
        if session is None:
            return None
        try:
            return await session.finish()
        finally:
            await session.close()

    async def cancel(self, *, session_id: str) -> None:
        async with self._lock:
            session = self._sessions.pop(session_id, None)
        if session is None:
            return
        await session.close()


asr_stream_service = AsrStreamService()

