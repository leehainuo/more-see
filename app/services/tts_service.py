from __future__ import annotations

from collections.abc import AsyncIterator

from app.adapters.tts_adapter import tts_adapter


class TtsService:
    async def synthesize(self, text: str) -> dict[str, str | int]:
        return await tts_adapter.synthesize(text)

    async def stream_synthesize(self, text: str) -> AsyncIterator[dict[str, str | int]]:
        async for chunk in tts_adapter.stream_synthesize(text):
            yield chunk


tts_service = TtsService()
