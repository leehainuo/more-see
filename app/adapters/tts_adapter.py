from __future__ import annotations

import base64
import io
import json
import math
import wave
from uuid import uuid4

import httpx

from app.config import settings


class TtsAdapter:
    async def synthesize(self, text: str) -> dict[str, str | int]:
        cleaned_text = text.strip()
        if not cleaned_text:
            raise ValueError("合成文本不能为空。")

        if settings.tts_provider == "volcengine":
            try:
                headers = {
                    "X-Api-Resource-Id": settings.volcengine_tts_resource_id,
                    "X-Control-Require-Usage-Tokens-Return": "text_words",
                }
                if not settings.volcengine_speech_api_key:
                    raise ValueError("missing_volcengine_tts_credentials")
                headers["X-Api-Key"] = settings.volcengine_speech_api_key

                audio_chunks: list[bytes] = []
                async with httpx.AsyncClient(timeout=45.0) as client:
                    async with client.stream(
                        "POST",
                        "https://openspeech.bytedance.com/api/v3/tts/unidirectional",
                        headers=headers,
                        json={
                            "user": {
                                "uid": "more-see-demo",
                            },
                            "req_params": {
                                "text": cleaned_text,
                                "speaker": settings.volcengine_tts_speaker,
                                "audio_params": {
                                    "format": settings.volcengine_tts_format,
                                    "sample_rate": settings.volcengine_tts_sample_rate,
                                },
                                "additions": {
                                    "reqid": str(uuid4()),
                                },
                            },
                        },
                    ) as response:
                        response.raise_for_status()
                        async for line in response.aiter_lines():
                            payload = line.strip()
                            if not payload:
                                continue
                            event = json.loads(payload)
                            if event.get("data"):
                                audio_chunks.append(base64.b64decode(event["data"]))
                            if event.get("code") == 20000000:
                                break

                audio_bytes = b"".join(audio_chunks)
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
