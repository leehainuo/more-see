from __future__ import annotations

import json
import struct
from dataclasses import dataclass
from uuid import uuid4

import websockets

from app.config import settings
from app.utils.ssl_context import build_volcengine_ssl_context
from app.utils.volcengine_speech import build_speech_ws_headers

_WS_TTS_URL = "wss://openspeech.bytedance.com/api/v3/tts/bidirection"

_MSG_TYPE_FULL_CLIENT_REQUEST = 0x1
_MSG_TYPE_FULL_SERVER_RESPONSE = 0x9
_MSG_TYPE_AUDIO_ONLY_SERVER = 0xB
_MSG_TYPE_ERROR = 0xF

_MSG_FLAG_NO_SEQ = 0x0
_MSG_FLAG_WITH_EVENT = 0x4

_EVENT_START_CONNECTION = 1
_EVENT_FINISH_CONNECTION = 2
_EVENT_CONNECTION_STARTED = 50
_EVENT_CONNECTION_FINISHED = 52
_EVENT_START_SESSION = 100
_EVENT_FINISH_SESSION = 102
_EVENT_SESSION_STARTED = 150
_EVENT_SESSION_FINISHED = 152
_EVENT_TASK_REQUEST = 200
_EVENT_TTS_RESPONSE = 352


@dataclass(slots=True)
class _VolcengineWsMessage:
    msg_type: int
    msg_flag: int
    event_type: int | None
    session_id: str | None
    connect_id: str | None
    payload: bytes
    error_code: int | None = None


def _encode_json_payload(payload: dict[str, object] | None = None) -> bytes:
    return json.dumps(payload or {}, ensure_ascii=False).encode("utf-8")


def _encode_event_frame(
    event_type: int,
    payload: bytes = b"",
    *,
    session_id: str | None = None,
    msg_type: int = _MSG_TYPE_FULL_CLIENT_REQUEST,
) -> bytes:
    header = bytes(
        [
            0x11,
            (msg_type << 4) | _MSG_FLAG_WITH_EVENT,
            0x10,
            0x00,
        ]
    )
    body = bytearray()
    body.extend(struct.pack(">i", event_type))
    if event_type not in {
        _EVENT_START_CONNECTION,
        _EVENT_FINISH_CONNECTION,
        _EVENT_CONNECTION_STARTED,
        _EVENT_CONNECTION_FINISHED,
    }:
        encoded_session = (session_id or "").encode("utf-8")
        body.extend(struct.pack(">I", len(encoded_session)))
        body.extend(encoded_session)
    body.extend(struct.pack(">I", len(payload)))
    body.extend(payload)
    return header + bytes(body)


def _decode_frame(data: bytes) -> _VolcengineWsMessage:
    if len(data) < 8:
        raise ValueError("invalid_volcengine_tts_frame")

    version_header = data[0]
    if version_header >> 4 != 1:
        raise ValueError("unsupported_volcengine_tts_version")

    header_words = version_header & 0x0F
    header_size = header_words * 4
    if len(data) < header_size:
        raise ValueError("invalid_volcengine_tts_header_size")

    msg_type = data[1] >> 4
    msg_flag = data[1] & 0x0F

    offset = header_size
    event_type: int | None = None
    session_id: str | None = None
    connect_id: str | None = None
    error_code: int | None = None

    if msg_type == _MSG_TYPE_ERROR:
        error_code = struct.unpack_from(">I", data, offset)[0]
        offset += 4

    if msg_flag == _MSG_FLAG_WITH_EVENT:
        event_type = struct.unpack_from(">i", data, offset)[0]
        offset += 4
        if event_type not in {
            _EVENT_START_CONNECTION,
            _EVENT_FINISH_CONNECTION,
            _EVENT_CONNECTION_STARTED,
            _EVENT_CONNECTION_FINISHED,
        }:
            session_length = struct.unpack_from(">I", data, offset)[0]
            offset += 4
            session_id = data[offset : offset + session_length].decode("utf-8")
            offset += session_length
        if event_type in {
            _EVENT_CONNECTION_STARTED,
            _EVENT_CONNECTION_FINISHED,
        }:
            connect_length = struct.unpack_from(">I", data, offset)[0]
            offset += 4
            connect_id = data[offset : offset + connect_length].decode("utf-8")
            offset += connect_length

    payload_length = struct.unpack_from(">I", data, offset)[0]
    offset += 4
    payload = data[offset : offset + payload_length]

    return _VolcengineWsMessage(
        msg_type=msg_type,
        msg_flag=msg_flag,
        event_type=event_type,
        session_id=session_id,
        connect_id=connect_id,
        payload=payload,
        error_code=error_code,
    )


async def _receive_message(websocket: websockets.ClientConnection) -> _VolcengineWsMessage:
    data = await websocket.recv()
    if isinstance(data, str):
        data = data.encode("utf-8")
    return _decode_frame(data)


async def _wait_for_event(
    websocket: websockets.ClientConnection,
    *,
    msg_type: int,
    event_type: int,
    session_id: str | None = None,
) -> _VolcengineWsMessage:
    while True:
        message = await _receive_message(websocket)
        if message.msg_type == _MSG_TYPE_ERROR:
            raise RuntimeError(
                f"volcengine_tts_error:{message.error_code}:{message.payload.decode('utf-8', errors='ignore')}"
            )
        if message.msg_type != msg_type:
            continue
        if message.event_type != event_type:
            continue
        if session_id is not None and message.session_id != session_id:
            continue
        return message


def _build_session_request() -> dict[str, object]:
    return {
        "user": {
            "uid": "more-see-demo",
        },
        "req_params": {
            "speaker": settings.volcengine_tts_speaker,
            "audio_params": {
                "format": settings.volcengine_tts_format,
                "sample_rate": settings.volcengine_tts_sample_rate,
            },
            # Avoid sending nested objects directly here. The upstream V3 protocol
            # expects `additions` to be an escaped JSON string.
            "additions": json.dumps(
                {
                    "disable_markdown_filter": True,
                },
                ensure_ascii=False,
            ),
        }
    }


def _build_task_request(text: str) -> dict[str, object]:
    return {
        "user": {
            "uid": "more-see-demo",
        },
        "req_params": {
            "text": text,
        },
    }


async def synthesize_via_websocket(text: str) -> bytes:
    if not settings.volcengine_speech_api_key:
        raise ValueError("missing_volcengine_tts_credentials")

    connect_id = str(uuid4())
    session_id = str(uuid4())
    headers = build_speech_ws_headers(
        resource_id=settings.volcengine_tts_resource_id,
        connect_id=connect_id,
        include_usage_tokens_return=True,
    )

    async with websockets.connect(
        _WS_TTS_URL,
        additional_headers=headers,
        max_size=10 * 1024 * 1024,
        ssl=build_volcengine_ssl_context(),
    ) as websocket:
        await websocket.send(
            _encode_event_frame(
                _EVENT_START_CONNECTION,
                _encode_json_payload(),
            )
        )
        await _wait_for_event(
            websocket,
            msg_type=_MSG_TYPE_FULL_SERVER_RESPONSE,
            event_type=_EVENT_CONNECTION_STARTED,
        )

        await websocket.send(
            _encode_event_frame(
                _EVENT_START_SESSION,
                _encode_json_payload(_build_session_request()),
                session_id=session_id,
            )
        )
        await _wait_for_event(
            websocket,
            msg_type=_MSG_TYPE_FULL_SERVER_RESPONSE,
            event_type=_EVENT_SESSION_STARTED,
            session_id=session_id,
        )

        await websocket.send(
            _encode_event_frame(
                _EVENT_TASK_REQUEST,
                _encode_json_payload(_build_task_request(text)),
                session_id=session_id,
            )
        )
        await websocket.send(
            _encode_event_frame(
                _EVENT_FINISH_SESSION,
                _encode_json_payload(),
                session_id=session_id,
            )
        )

        audio_chunks: list[bytes] = []
        while True:
            message = await _receive_message(websocket)
            if message.msg_type == _MSG_TYPE_ERROR:
                raise RuntimeError(
                    f"volcengine_tts_error:{message.error_code}:{message.payload.decode('utf-8', errors='ignore')}"
                )
            if message.session_id not in {None, session_id}:
                continue
            if (
                message.msg_type == _MSG_TYPE_AUDIO_ONLY_SERVER
                and message.event_type == _EVENT_TTS_RESPONSE
            ):
                audio_chunks.append(message.payload)
                continue
            if (
                message.msg_type == _MSG_TYPE_FULL_SERVER_RESPONSE
                and message.event_type == _EVENT_SESSION_FINISHED
            ):
                break

        await websocket.send(
            _encode_event_frame(
                _EVENT_FINISH_CONNECTION,
                _encode_json_payload(),
            )
        )
        await _wait_for_event(
            websocket,
            msg_type=_MSG_TYPE_FULL_SERVER_RESPONSE,
            event_type=_EVENT_CONNECTION_FINISHED,
        )

        return b"".join(audio_chunks)
