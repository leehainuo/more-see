from __future__ import annotations

import base64
import io
import math
import wave
from collections.abc import AsyncIterator

from app.config import settings
from app.adapters.volcengine_tts_ws import stream_synthesize_via_websocket, synthesize_via_websocket


class TtsAdapter:
    async def synthesize(self, text: str) -> dict[str, str | int]:
        cleaned_text = text.strip()
        if not cleaned_text:
            raise ValueError("合成文本不能为空。")

        if settings.tts_provider == "volcengine":
            try:
                audio_bytes = await synthesize_via_websocket(cleaned_text)
                if audio_bytes:
                    return {
                        "audioBase64": base64.b64encode(audio_bytes).decode("utf-8"),
                        "mimeType": self._resolve_mime_type(settings.volcengine_tts_format),
                        "provider": "volcengine",
                        "textLength": len(cleaned_text),
                    }
            except Exception:
                pass

        audio_bytes = self._build_fallback_wav(cleaned_text)
        return {
            "audioBase64": base64.b64encode(audio_bytes).decode("utf-8"),
            "mimeType": "audio/wav",
            "provider": "fallback",
            "textLength": len(cleaned_text),
        }

    async def stream_synthesize(self, text: str) -> AsyncIterator[dict[str, str | int]]:
        cleaned_text = text.strip()
        if not cleaned_text:
            raise ValueError("合成文本不能为空。")

        if settings.tts_provider == "volcengine":
            try:
                yielded_chunk = False
                async for audio_bytes in stream_synthesize_via_websocket(cleaned_text, audio_format="pcm"):
                    if audio_bytes:
                        yielded_chunk = True
                        yield {
                            "audioBase64": base64.b64encode(audio_bytes).decode("utf-8"),
                            "mimeType": "audio/pcm",
                            "provider": "volcengine",
                            "sampleRate": settings.volcengine_tts_sample_rate,
                            "textLength": len(cleaned_text),
                        }
                if yielded_chunk:
                    return
            except Exception:
                pass

        audio_bytes = self._build_fallback_pcm(cleaned_text)
        chunk_size = 3200
        for index in range(0, len(audio_bytes), chunk_size):
            yield {
                "audioBase64": base64.b64encode(audio_bytes[index : index + chunk_size]).decode("utf-8"),
                "mimeType": "audio/pcm",
                "provider": "fallback",
                "sampleRate": 16_000,
                "textLength": len(cleaned_text),
            }

    def _resolve_mime_type(self, audio_format: str) -> str:
        return {
            "mp3": "audio/mpeg",
            "ogg_opus": "audio/ogg",
            "pcm": "audio/pcm",
        }.get(audio_format, "application/octet-stream")

    def _build_fallback_wav(self, text: str) -> bytes:
        pcm_bytes = self._build_fallback_pcm(text)
        sample_rate = 16_000

        buffer = io.BytesIO()
        with wave.open(buffer, "wb") as wav_file:
            wav_file.setnchannels(1)
            wav_file.setsampwidth(2)
            wav_file.setframerate(sample_rate)
            wav_file.writeframes(pcm_bytes)

        return buffer.getvalue()

    def _build_fallback_pcm(self, text: str) -> bytes:
        duration_seconds = min(max(len(text) * 0.04, 0.6), 3.0)
        sample_rate = 16_000
        amplitude = 12_000
        frequency = 440
        frame_count = int(sample_rate * duration_seconds)

        frames = bytearray()
        for index in range(frame_count):
            envelope = 0.35 if index < frame_count * 0.85 else 0.12
            sample = int(amplitude * envelope * math.sin((2 * math.pi * frequency * index) / sample_rate))
            frames.extend(sample.to_bytes(2, byteorder="little", signed=True))
        return bytes(frames)


tts_adapter = TtsAdapter()
