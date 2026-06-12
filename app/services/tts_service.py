from __future__ import annotations

from app.adapters.tts_adapter import tts_adapter


class TtsService:
    async def synthesize(self, text: str) -> dict[str, str | int]:
        return await tts_adapter.synthesize(text)


tts_service = TtsService()
