from __future__ import annotations

import asyncio
import base64
import gzip
import json
import logging
from dataclasses import dataclass
from uuid import uuid4

import websockets

from app.config import settings
from app.state.session_store import AudioChunk
from app.utils.ssl_context import build_volcengine_ssl_context
from app.utils.volcengine_speech import build_speech_ws_headers

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
_FINAL_RESULT_TIMEOUT_SECONDS = 1.0
_FINAL_RESULT_MAX_FRAMES = 6
_MIN_SEND_INTERVAL_MS = 100
_MAX_SEND_INTERVAL_MS = 200

logger = logging.getLogger(__name__)


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


def _resolve_send_interval_seconds(duration_ms: int) -> float:
    clamped_ms = min(max(duration_ms, _MIN_SEND_INTERVAL_MS), _MAX_SEND_INTERVAL_MS)
    return clamped_ms / 1000


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
    message_flags = frame[1] & 0x0F
    compression = frame[2] & 0x0F
    payload = frame[header_size * 4 :]
    result: dict[str, object] = {
        "messageType": message_type,
        "messageFlags": message_flags,
    }
    offset = 0

    # Fire ASR response packets may carry a 4-byte sequence field when bit0 is set.
    if message_flags & 0b0001 and len(payload) >= 4:
        result["sequence"] = int.from_bytes(payload[:4], "big", signed=True)
        offset += 4

    if message_type == _SERVER_ERROR_RESPONSE:
        if len(payload) < offset + 8:
            return result
        result["code"] = int.from_bytes(payload[offset : offset + 4], "big", signed=False)
        offset += 4

    if len(payload) < offset + 4:
        return result

    payload_size = int.from_bytes(payload[offset : offset + 4], "big", signed=False)
    offset += 4
    payload_bytes = payload[offset : offset + payload_size]

    if payload_bytes is None:
        return result

    if compression == _GZIP and payload_bytes:
        payload_bytes = gzip.decompress(payload_bytes)

    if payload_bytes:
        try:
            result["payload"] = json.loads(payload_bytes.decode("utf-8"))
        except json.JSONDecodeError:
            result["payloadText"] = payload_bytes.decode("utf-8", errors="ignore")
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
    if isinstance(items, dict):
        text = items.get("text")
        if isinstance(text, str):
            return text.strip()
        return ""
    if not isinstance(items, list):
        return ""

    parts: list[str] = []
    for item in items:
        if isinstance(item, dict):
            text = item.get("text")
            if isinstance(text, str) and text.strip():
                parts.append(text.strip())
    return "".join(parts)


def _extract_payload_or_raise(response: dict[str, object]) -> dict[str, object] | None:
    payload = response.get("payload")
    if not isinstance(payload, dict):
        return None
    if isinstance(payload.get("error"), str) and payload["error"].strip():
        raise RuntimeError(str(payload["error"]))
    if isinstance(response.get("code"), int) and int(response["code"]) != _SUCCESS_CODE:
        raise RuntimeError(str(payload.get("error") or payload.get("message") or "火山 ASR 识别失败。"))
    if int(payload.get("code", _SUCCESS_CODE)) != _SUCCESS_CODE:
        raise RuntimeError(str(payload.get("message", "火山 ASR 识别失败。")))
    return payload


async def _recv_final_payload(
    websocket,
    *,
    latest_payload: dict[str, object],
    timeout_seconds: float = _FINAL_RESULT_TIMEOUT_SECONDS,
    max_frames: int = _FINAL_RESULT_MAX_FRAMES,
) -> dict[str, object]:
    current_payload = latest_payload
    for index in range(max_frames):
        try:
            frame = await asyncio.wait_for(websocket.recv(), timeout=timeout_seconds)
        except websockets.ConnectionClosedOK as exc:
            logger.info(
                "asr trailing recv closed normally: waited_frames=%s close_code=%s reason=%s has_transcript=%s",
                index,
                exc.code,
                exc.reason,
                bool(extract_transcript(current_payload)),
            )
            break
        except asyncio.TimeoutError:
            logger.info(
                "asr trailing recv timeout: waited_frames=%s has_transcript=%s",
                index,
                bool(extract_transcript(current_payload)),
            )
            break

        response = _parse_response(frame)
        payload = _extract_payload_or_raise(response)
        logger.info(
            "asr trailing frame: index=%s message_type=%s message_flags=%s sequence=%s has_payload=%s has_transcript=%s",
            index,
            response.get("messageType"),
            response.get("messageFlags"),
            response.get("sequence"),
            payload is not None,
            bool(payload and extract_transcript(payload)),
        )
        if payload is None:
            continue
        current_payload = payload
        if extract_transcript(current_payload):
            break

    return current_payload


class VolcengineAsrClient:
    async def transcribe_chunks(self, chunks: list[AudioChunk]) -> str:
        if not chunks:
            raise ValueError("没有可供识别的音频分段。")

        if not settings.volcengine_speech_api_key:
            raise ValueError(
                "火山 ASR 缺少鉴权配置，请设置 `VOLCENGINE_SPEECH_API_KEY`。"
            )
        headers = build_speech_ws_headers(
            resource_id=settings.volcengine_asr_resource_id,
            connect_id=str(uuid4()),
        )

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
            ssl=build_volcengine_ssl_context(),
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
                is_last_chunk = index == len(chunks) - 1
                send_interval_seconds = _resolve_send_interval_seconds(chunk.duration_ms)
                logger.info(
                    "asr send frame: chunk_index=%s is_last_chunk=%s duration_ms=%s interval_ms=%s audio_bytes=%s",
                    index,
                    is_last_chunk,
                    chunk.duration_ms,
                    round(send_interval_seconds * 1000),
                    len(audio_bytes),
                )
                request_bytes = _build_audio_request(
                    audio_bytes,
                    last=is_last_chunk,
                )
                await ws.send(request_bytes)
                response = _parse_response(await ws.recv())
                payload = _extract_payload_or_raise(response)
                logger.info(
                    "asr receive frame: chunk_index=%s is_last_chunk=%s message_type=%s message_flags=%s sequence=%s has_payload=%s has_transcript=%s",
                    index,
                    is_last_chunk,
                    response.get("messageType"),
                    response.get("messageFlags"),
                    response.get("sequence"),
                    payload is not None,
                    bool(payload and extract_transcript(payload)),
                )
                if payload is not None:
                    latest_payload = payload
                if not is_last_chunk:
                    await asyncio.sleep(send_interval_seconds)

            if not extract_transcript(latest_payload):
                latest_payload = await _recv_final_payload(
                    ws,
                    latest_payload=latest_payload,
                )

        transcript = extract_transcript(latest_payload)
        if not transcript:
            raise RuntimeError("火山 ASR 未返回可用 transcript。")
        return transcript


volcengine_asr_client = VolcengineAsrClient()
