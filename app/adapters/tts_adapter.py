from __future__ import annotations

import base64
import io
import math
import wave

from app.config import settings
from app.adapters.volcengine_tts_ws import synthesize_via_websocket


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

    def _resolve_mime_type(self, audio_format: str) -> str:
        return {
            "mp3": "audio/mpeg",
            "ogg_opus": "audio/ogg",
            "pcm": "audio/pcm",
        }.get(audio_format, "application/octet-stream")

    def _build_fallback_wav(self, text: str) -> bytes:
        duration_seconds = min(max(len(text) * 0.04, 0.6), 3.0)
        sample_rate = 16_000
        amplitude = 12_000
        frequency = 440
        frame_count = int(sample_rate * duration_seconds)

        buffer = io.BytesIO()
        with wave.open(buffer, "wb") as wav_file:
            wav_file.setnchannels(1)
            wav_file.setsampwidth(2)
            wav_file.setframerate(sample_rate)

            frames = bytearray()
            for index in range(frame_count):
                envelope = 0.35 if index < frame_count * 0.85 else 0.12
                sample = int(amplitude * envelope * math.sin((2 * math.pi * frequency * index) / sample_rate))
                frames.extend(sample.to_bytes(2, byteorder="little", signed=True))
            wav_file.writeframes(bytes(frames))

        return buffer.getvalue()


tts_adapter = TtsAdapter()
