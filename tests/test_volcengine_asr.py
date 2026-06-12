from __future__ import annotations

import pytest

from app.adapters import asr_adapter as asr_module
from app.adapters.volcengine_asr import extract_transcript, resolve_audio_config
from app.config import settings
from app.state.session_store import AudioChunk


def test_resolve_audio_config_supports_pcm_and_ogg() -> None:
    pcm = resolve_audio_config("audio/pcm;rate=16000")
    ogg = resolve_audio_config("audio/ogg;codecs=opus")

    assert pcm.format == "pcm"
    assert pcm.codec == "raw"
    assert ogg.format == "ogg"
    assert ogg.codec == "opus"


def test_resolve_audio_config_rejects_webm() -> None:
    with pytest.raises(ValueError, match="火山 ASR 当前仅支持"):
        resolve_audio_config("audio/webm;codecs=opus")


def test_extract_transcript_joins_segments() -> None:
    transcript = extract_transcript(
        {
            "result": [
                {"text": "你好"},
                {"text": "，世界"},
            ]
        }
    )

    assert transcript == "你好，世界"


@pytest.mark.asyncio
async def test_asr_adapter_volcengine_transcribe(monkeypatch) -> None:
    async def _fake_transcribe_chunks(_chunks: list[AudioChunk]) -> str:
        return "这是一段火山识别结果"

    monkeypatch.setattr(settings, "asr_provider", "volcengine")
    monkeypatch.setattr(asr_module.volcengine_asr_client, "transcribe_chunks", _fake_transcribe_chunks)

    result = await asr_module.asr_adapter.transcribe(
        [
            AudioChunk(
                chunk_id="chunk-1",
                mime_type="audio/pcm;rate=16000",
                base64_audio="AAAA",
                duration_ms=320,
            )
        ]
    )

    assert result["provider"] == "volcengine"
    assert result["transcript"] == "这是一段火山识别结果"
