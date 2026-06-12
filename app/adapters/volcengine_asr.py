from __future__ import annotations

import base64
import gzip
import json
from dataclasses import dataclass
from uuid import uuid4

import websockets

from app.config import settings
from app.state.session_store import AudioChunk

_PROTOCOL_VERSION = 0b0001
_CLIENT_FULL_REQUEST = 0b0001
_CLIENT_AUDIO_ONLY_REQUEST = 0b0010
_SERVER_FULL_RESPONSE = 0b1001
_SERVER_ACK = 0b1011
_SERVER_ERROR_RESPONSE = 0b1111
_NO_SEQUENCE = 0b0000
_NEG_SEQUENCE = 0b0010
_JSON = 0b0001
_GZIP = 0b0001
_SUCCESS_CODE = 1000
_WS_URL = "wss://openspeech.bytedance.com/api/v3/sauc/bigmodel_nostream"


@dataclass(frozen=True)
class VolcengineAudioConfig:
    format: str
    codec: str
    rate: int = 16000
    bits: int = 16
    channel: int = 1


def _generate_header(*, message_type: int, flags: int = _NO_SEQUENCE) -> bytearray:
    return bytearray(
        [
            (_PROTOCOL_VERSION << 4) | 0b0001,
            (message_type << 4) | flags,
            (_JSON << 4) | _GZIP,
            0x00,
        ]
    )


def _build_full_request(payload: dict[str, object]) -> bytes:
    payload_bytes = gzip.compress(json.dumps(payload, ensure_ascii=False).encode("utf-8"))
    frame = _generate_header(message_type=_CLIENT_FULL_REQUEST)
    frame.extend(len(payload_bytes).to_bytes(4, "big"))
    frame.extend(payload_bytes)
    return bytes(frame)


def _build_audio_request(audio_bytes: bytes, *, last: bool) -> bytes:
    payload_bytes = gzip.compress(audio_bytes)
    frame = _generate_header(
        message_type=_CLIENT_AUDIO_ONLY_REQUEST,
        flags=_NEG_SEQUENCE if last else _NO_SEQUENCE,
    )
    frame.extend(len(payload_bytes).to_bytes(4, "big"))
    frame.extend(payload_bytes)
    return bytes(frame)


def _parse_response(frame: bytes) -> dict[str, object]:
    header_size = frame[0] & 0x0F
    message_type = frame[1] >> 4
    compression = frame[2] & 0x0F
    payload = frame[header_size * 4 :]
    result: dict[str, object] = {}
    payload_bytes: bytes | None = None

    if message_type == _SERVER_FULL_RESPONSE:
        payload_bytes = payload[4:]
    elif message_type == _SERVER_ACK:
        if len(payload) >= 8:
            payload_bytes = payload[8:]
    elif message_type == _SERVER_ERROR_RESPONSE:
        if len(payload) >= 8:
            result["code"] = int.from_bytes(payload[:4], "big", signed=False)
            payload_bytes = payload[8:]

    if payload_bytes is None:
        return result

    if compression == _GZIP and payload_bytes:
        payload_bytes = gzip.decompress(payload_bytes)

    if payload_bytes:
        result["payload"] = json.loads(payload_bytes.decode("utf-8"))
    return result


def resolve_audio_config(mime_type: str) -> VolcengineAudioConfig:
    lowered = mime_type.lower()
    if lowered.startswith("audio/pcm"):
        return VolcengineAudioConfig(format="pcm", codec="raw")
    if lowered.startswith("audio/wav"):
        return VolcengineAudioConfig(format="wav", codec="raw")
    if lowered.startswith("audio/ogg") and "opus" in lowered:
        return VolcengineAudioConfig(format="ogg", codec="opus")
    raise ValueError(
        "火山 ASR 当前仅支持 `audio/pcm`、`audio/wav` 或 `audio/ogg;codecs=opus`。"
    )


def extract_transcript(payload: dict[str, object]) -> str:
    items = payload.get("result")
    if not isinstance(items, list):
        return ""

    parts: list[str] = []
    for item in items:
        if isinstance(item, dict):
            text = item.get("text")
            if isinstance(text, str) and text.strip():
                parts.append(text.strip())
    return "".join(parts)


class VolcengineAsrClient:
    async def transcribe_chunks(self, chunks: list[AudioChunk]) -> str:
        if not chunks:
            raise ValueError("没有可供识别的音频分段。")

        if not settings.volcengine_speech_api_key:
            raise ValueError(
                "火山 ASR 缺少鉴权配置，请设置 `VOLCENGINE_SPEECH_API_KEY`。"
            )
        headers = {
            "X-Api-Key": settings.volcengine_speech_api_key,
            "X-Api-Resource-Id": settings.volcengine_asr_resource_id,
            "X-Api-Connect-Id": str(uuid4()),
        }

        audio_config = resolve_audio_config(chunks[0].mime_type)
        request_payload = {
            "user": {
                "uid": "more-see-demo",
            },
            "audio": {
                "format": audio_config.format,
                "codec": audio_config.codec,
                "rate": audio_config.rate,
                "bits": audio_config.bits,
                "channel": audio_config.channel,
                "language": settings.volcengine_asr_language,
            },
            "request": {
                "model_name": "bigmodel",
                "enable_itn": True,
                "enable_punc": True,
                "enable_ddc": False,
            },
        }

        async with websockets.connect(
            _WS_URL,
            additional_headers=headers,
            max_size=10_000_000,
        ) as ws:
            await ws.send(_build_full_request(request_payload))
            first_response = _parse_response(await ws.recv())
            first_payload = first_response.get("payload")
            if isinstance(first_payload, dict) and int(first_payload.get("code", _SUCCESS_CODE)) != _SUCCESS_CODE:
                raise RuntimeError(str(first_payload.get("message", "火山 ASR 初始化失败。")))

            latest_payload: dict[str, object] = {}
            for index, chunk in enumerate(chunks):
                audio_bytes = base64.b64decode(chunk.base64_audio)
                if not audio_bytes:
                    continue
                await ws.send(_build_audio_request(audio_bytes, last=index == len(chunks) - 1))
                response = _parse_response(await ws.recv())
                payload = response.get("payload")
                if isinstance(payload, dict):
                    if int(payload.get("code", _SUCCESS_CODE)) != _SUCCESS_CODE:
                        raise RuntimeError(str(payload.get("message", "火山 ASR 识别失败。")))
                    latest_payload = payload

        transcript = extract_transcript(latest_payload)
        if not transcript:
            raise RuntimeError("火山 ASR 未返回可用 transcript。")
        return transcript


volcengine_asr_client = VolcengineAsrClient()
