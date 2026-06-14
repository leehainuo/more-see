from __future__ import annotations

import base64
import asyncio
import pytest

from app.adapters import asr_adapter as asr_module
import gzip
import json

from app.adapters.volcengine_asr import (
    _SERVER_ACK,
    _SERVER_ERROR_RESPONSE,
    _SERVER_FULL_RESPONSE,
    VolcengineAsrClient,
    _build_audio_request,
    _extract_payload_or_raise,
    _recv_final_payload,
    _parse_response,
    _resolve_send_interval_seconds,
    extract_transcript,
    resolve_audio_config,
)
from app.core.config import settings
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


def test_extract_transcript_supports_dict_payload() -> None:
    transcript = extract_transcript(
        {
            "result": {
                "text": "你好世界",
            }
        }
    )

    assert transcript == "你好世界"


def test_parse_response_supports_sequence_prefixed_server_payload() -> None:
    payload = gzip.compress(
        json.dumps({"code": 1000, "result": [{"text": "你好"}]}, ensure_ascii=False).encode("utf-8")
    )
    frame = bytearray(
        [
            0x11,
            0x91,  # full server response + sequence present
            0x11,  # json + gzip
            0x00,
        ]
    )
    frame.extend((1).to_bytes(4, "big", signed=True))
    frame.extend(len(payload).to_bytes(4, "big"))
    frame.extend(payload)

    result = _parse_response(bytes(frame))

    assert result["sequence"] == 1
    assert result["payload"] == {"code": 1000, "result": [{"text": "你好"}]}


def _build_server_response_frame(
    *,
    message_type: int,
    message_flags: int,
    payload_dict: dict[str, object],
    sequence: int | None = None,
) -> bytes:
    payload = gzip.compress(json.dumps(payload_dict, ensure_ascii=False).encode("utf-8"))
    frame = bytearray(
        [
            0x11,
            (message_type << 4) | message_flags,
            0x11,
            0x00,
        ]
    )
    if sequence is not None:
        frame.extend(sequence.to_bytes(4, "big", signed=True))
    frame.extend(len(payload).to_bytes(4, "big"))
    frame.extend(payload)
    return bytes(frame)


def test_build_audio_request_uses_last_packet_flag_without_sequence() -> None:
    regular = _build_audio_request(b"\x01\x02", last=False)
    ending = _build_audio_request(b"\x01\x02", last=True)

    assert regular[1] & 0x0F == 0b0000
    assert int.from_bytes(regular[4:8], "big", signed=False) > 0

    assert ending[1] & 0x0F == 0b0010
    assert int.from_bytes(ending[4:8], "big", signed=False) > 0


def test_resolve_send_interval_seconds_clamps_to_protocol_window() -> None:
    assert _resolve_send_interval_seconds(40) == 0.1
    assert _resolve_send_interval_seconds(160) == 0.16
    assert _resolve_send_interval_seconds(380) == 0.2


def test_extract_payload_or_raise_uses_server_error_message() -> None:
    with pytest.raises(RuntimeError, match="sequence mismatch"):
        _extract_payload_or_raise(
            {
                "messageType": _SERVER_ERROR_RESPONSE,
                "code": 45000000,
                "payload": {"error": "sequence mismatch"},
            }
        )


@pytest.mark.asyncio
async def test_recv_final_payload_reads_trailing_result_after_ack() -> None:
    class FakeWebSocket:
        def __init__(self, frames: list[bytes]) -> None:
            self._frames = frames

        async def recv(self) -> bytes:
            if not self._frames:
                raise asyncio.TimeoutError()
            return self._frames.pop(0)

    websocket = FakeWebSocket(
        [
            _build_server_response_frame(
                message_type=_SERVER_ACK,
                message_flags=0b0001,
                sequence=1,
                payload_dict={"code": 1000},
            ),
            _build_server_response_frame(
                message_type=_SERVER_FULL_RESPONSE,
                message_flags=0b0001,
                sequence=-1,
                payload_dict={"code": 1000, "result": [{"text": "真正结果"}]},
            ),
        ]
    )

    payload = await _recv_final_payload(websocket, latest_payload={})

    assert payload == {"code": 1000, "result": [{"text": "真正结果"}]}


@pytest.mark.asyncio
async def test_recv_final_payload_treats_normal_close_as_non_error(monkeypatch: pytest.MonkeyPatch) -> None:
    class FakeConnectionClosedOK(Exception):
        def __init__(self) -> None:
            self.code = 1000
            self.reason = "finish last sequence"

    class FakeWebSocket:
        async def recv(self) -> bytes:
            raise FakeConnectionClosedOK()

    monkeypatch.setattr("app.adapters.volcengine_asr.websockets.ConnectionClosedOK", FakeConnectionClosedOK)

    payload = await _recv_final_payload(
        FakeWebSocket(),
        latest_payload={},
    )

    assert payload == {}


@pytest.mark.asyncio
async def test_transcribe_chunks_replays_audio_with_last_flag_and_pacing(monkeypatch: pytest.MonkeyPatch) -> None:
    sent_frames: list[bytes] = []
    slept_seconds: list[float] = []

    class FakeWebSocket:
        def __init__(self) -> None:
            self._responses = [
                _build_server_response_frame(
                    message_type=_SERVER_ACK,
                    message_flags=0b0001,
                    sequence=0,
                    payload_dict={"code": 1000},
                ),
                _build_server_response_frame(
                    message_type=_SERVER_ACK,
                    message_flags=0b0001,
                    sequence=1,
                    payload_dict={"code": 1000},
                ),
                _build_server_response_frame(
                    message_type=_SERVER_FULL_RESPONSE,
                    message_flags=0b0001,
                    sequence=-2,
                    payload_dict={"code": 1000, "result": [{"text": "测试通过"}]},
                ),
            ]

        async def __aenter__(self) -> "FakeWebSocket":
            return self

        async def __aexit__(self, exc_type, exc, tb) -> None:
            return None

        async def send(self, data: bytes) -> None:
            sent_frames.append(data)

        async def recv(self) -> bytes:
            return self._responses.pop(0)

    async def fake_sleep(seconds: float) -> None:
        slept_seconds.append(seconds)

    def fake_connect(*_args, **_kwargs) -> FakeWebSocket:
        return FakeWebSocket()

    monkeypatch.setattr(settings, "volcengine_speech_api_key", "test-key")
    monkeypatch.setattr("app.adapters.volcengine_asr.websockets.connect", fake_connect)
    monkeypatch.setattr("app.adapters.volcengine_asr.asyncio.sleep", fake_sleep)

    transcript = await VolcengineAsrClient().transcribe_chunks(
        [
            AudioChunk(
                chunk_id="chunk-1",
                mime_type="audio/pcm;rate=16000",
                base64_audio=base64.b64encode(b"\x01\x00" * 1600).decode("utf-8"),
                duration_ms=120,
            ),
            AudioChunk(
                chunk_id="chunk-2",
                mime_type="audio/pcm;rate=16000",
                base64_audio=base64.b64encode(b"\x02\x00" * 1600).decode("utf-8"),
                duration_ms=180,
            ),
        ]
    )

    assert transcript == "测试通过"
    assert len(sent_frames) == 3
    assert sent_frames[1][1] & 0x0F == 0b0000
    assert sent_frames[2][1] & 0x0F == 0b0010
    assert slept_seconds == [0.12]


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


@pytest.mark.asyncio
async def test_asr_adapter_fallback_marks_short_audio(monkeypatch) -> None:
    async def _raise_empty_transcript(_chunks: list[AudioChunk]) -> str:
        raise RuntimeError("火山 ASR 未返回可用 transcript。")

    monkeypatch.setattr(settings, "asr_provider", "volcengine")
    monkeypatch.setattr(asr_module.volcengine_asr_client, "transcribe_chunks", _raise_empty_transcript)

    result = await asr_module.asr_adapter.transcribe(
        [
            AudioChunk(
                chunk_id="chunk-short",
                mime_type="audio/pcm;rate=16000",
                base64_audio=base64.b64encode((1000).to_bytes(2, "little", signed=True) * 1000).decode("utf-8"),
                duration_ms=300,
            )
        ]
    )

    assert result["provider"] == "fallback"
    assert result["diagnosticCode"] == "short_audio"
    assert "语音片段偏短" in str(result["diagnosticMessage"])


@pytest.mark.asyncio
async def test_asr_adapter_fallback_marks_low_audio_level(monkeypatch) -> None:
    async def _raise_empty_transcript(_chunks: list[AudioChunk]) -> str:
        raise RuntimeError("火山 ASR 未返回可用 transcript。")

    monkeypatch.setattr(settings, "asr_provider", "volcengine")
    monkeypatch.setattr(asr_module.volcengine_asr_client, "transcribe_chunks", _raise_empty_transcript)

    result = await asr_module.asr_adapter.transcribe(
        [
            AudioChunk(
                chunk_id="chunk-quiet",
                mime_type="audio/pcm;rate=16000",
                base64_audio=base64.b64encode(b"\x00\x00" * 16000).decode("utf-8"),
                duration_ms=1200,
            )
        ]
    )

    assert result["provider"] == "fallback"
    assert result["diagnosticCode"] == "low_audio_level"
    assert "音量疑似过小" in str(result["diagnosticMessage"])
