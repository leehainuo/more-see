import json
import ssl

import pytest

from app.adapters.tts_adapter import tts_adapter
from app.adapters import volcengine_tts_ws
from app.config import settings


class FakeWebSocket:
    def __init__(self, frames: list[bytes]) -> None:
        self._frames = list(frames)
        self.sent_frames: list[bytes] = []

    async def __aenter__(self) -> "FakeWebSocket":
        return self

    async def __aexit__(self, exc_type, exc, tb) -> None:
        return None

    async def send(self, data: bytes) -> None:
        self.sent_frames.append(data)

    async def recv(self) -> bytes:
        if not self._frames:
            raise RuntimeError("no_more_frames")
        return self._frames.pop(0)


def test_build_ssl_context_uses_certifi_by_default(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.utils import ssl_context as ssl_module

    monkeypatch.setattr(settings, "volcengine_ssl_cert_file", "")
    monkeypatch.setattr(ssl_module.certifi, "where", lambda: "/tmp/certifi.pem")

    recorded: dict[str, str] = {}
    original = ssl.create_default_context

    def fake_create_default_context(*, cafile=None, _capath=None, _cadata=None):
        recorded["cafile"] = cafile
        return original()

    monkeypatch.setattr(ssl_module.ssl, "create_default_context", fake_create_default_context)

    context = ssl_module.build_volcengine_ssl_context()

    assert isinstance(context, ssl.SSLContext)
    assert recorded["cafile"] == "/tmp/certifi.pem"


@pytest.mark.asyncio
async def test_synthesize_via_websocket(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "volcengine_speech_api_key", "speech-key")
    monkeypatch.setattr(settings, "volcengine_tts_resource_id", "seed-tts-2.0")
    monkeypatch.setattr(settings, "volcengine_tts_speaker", "test-speaker")
    monkeypatch.setattr(settings, "volcengine_tts_format", "mp3")
    monkeypatch.setattr(settings, "volcengine_tts_sample_rate", 24000)

    session_id = "session-123"
    connect_id = "connect-123"
    fake_socket = FakeWebSocket(
        [
            _server_frame(
                event_type=50,
                payload=b"{}",
                connect_id=connect_id,
            ),
            _server_frame(
                event_type=150,
                payload=b"{}",
                session_id=session_id,
            ),
            _server_frame(
                msg_type=0xB,
                event_type=352,
                payload=b"audio-1",
                session_id=session_id,
            ),
            _server_frame(
                msg_type=0xB,
                event_type=352,
                payload=b"audio-2",
                session_id=session_id,
            ),
            _server_frame(
                event_type=152,
                payload=json.dumps({"usage": {"text_words": 4}}).encode("utf-8"),
                session_id=session_id,
            ),
            _server_frame(
                event_type=52,
                payload=b"{}",
                connect_id=connect_id,
            ),
        ]
    )

    captured: dict[str, object] = {}

    def fake_connect(*_args, **kwargs) -> FakeWebSocket:
        captured.update(kwargs)
        return fake_socket

    monkeypatch.setattr(volcengine_tts_ws.websockets, "connect", fake_connect)
    uuid_iter = iter([connect_id, session_id])
    monkeypatch.setattr(volcengine_tts_ws, "uuid4", lambda: next(uuid_iter))

    result = await volcengine_tts_ws.synthesize_via_websocket("你好")

    assert result == b"audio-1audio-2"
    assert len(fake_socket.sent_frames) == 5

    start_connection = volcengine_tts_ws._decode_frame(fake_socket.sent_frames[0])
    assert start_connection.event_type == 1
    assert json.loads(start_connection.payload) == {}

    start_session = volcengine_tts_ws._decode_frame(fake_socket.sent_frames[1])
    assert start_session.event_type == 100
    assert start_session.session_id == session_id
    assert json.loads(start_session.payload)["req_params"]["speaker"] == "test-speaker"
    assert (
        json.loads(start_session.payload)["req_params"]["additions"]
        == "{\"disable_markdown_filter\": true}"
    )

    task_request = volcengine_tts_ws._decode_frame(fake_socket.sent_frames[2])
    assert task_request.event_type == 200
    assert task_request.session_id == session_id
    assert json.loads(task_request.payload)["req_params"]["text"] == "你好"

    finish_session = volcengine_tts_ws._decode_frame(fake_socket.sent_frames[3])
    assert finish_session.event_type == 102
    assert finish_session.session_id == session_id
    assert json.loads(finish_session.payload) == {}

    finish_connection = volcengine_tts_ws._decode_frame(fake_socket.sent_frames[4])
    assert finish_connection.event_type == 2
    assert json.loads(finish_connection.payload) == {}
    assert isinstance(captured["ssl"], ssl.SSLContext)
    assert captured["additional_headers"]["X-Api-Key"] == "speech-key"
    assert captured["additional_headers"]["X-Api-Resource-Id"] == "seed-tts-2.0"
    assert captured["additional_headers"]["X-Control-Require-Usage-Tokens-Return"] == "*"


@pytest.mark.asyncio
async def test_stream_synthesize_via_websocket(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "volcengine_speech_api_key", "speech-key")
    session_id = "session-stream"
    connect_id = "connect-stream"
    fake_socket = FakeWebSocket(
        [
            _server_frame(event_type=50, payload=b"{}", connect_id=connect_id),
            _server_frame(event_type=150, payload=b"{}", session_id=session_id),
            _server_frame(msg_type=0xB, event_type=352, payload=b"audio-a", session_id=session_id),
            _server_frame(msg_type=0xB, event_type=352, payload=b"audio-b", session_id=session_id),
            _server_frame(event_type=152, payload=b"{}", session_id=session_id),
            _server_frame(event_type=52, payload=b"{}", connect_id=connect_id),
        ]
    )

    monkeypatch.setattr(volcengine_tts_ws.websockets, "connect", lambda *_args, **_kwargs: fake_socket)
    uuid_iter = iter([connect_id, session_id])
    monkeypatch.setattr(volcengine_tts_ws, "uuid4", lambda: next(uuid_iter))

    chunks = []
    async for chunk in volcengine_tts_ws.stream_synthesize_via_websocket("你好"):
        chunks.append(chunk)

    assert chunks == [b"audio-a", b"audio-b"]


@pytest.mark.asyncio
async def test_synthesize_via_websocket_requires_api_key(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "volcengine_speech_api_key", "")

    with pytest.raises(ValueError, match="missing_volcengine_tts_credentials"):
        await volcengine_tts_ws.synthesize_via_websocket("你好")


@pytest.mark.asyncio
async def test_tts_adapter_stream_falls_back_when_volcengine_returns_no_chunks(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "tts_provider", "volcengine")

    async def fake_stream_synthesize_via_websocket(_text: str, *, audio_format: str | None = None):
        if False:
            yield b""

    monkeypatch.setattr(
        "app.adapters.tts_adapter.stream_synthesize_via_websocket",
        fake_stream_synthesize_via_websocket,
    )

    chunks = []
    async for chunk in tts_adapter.stream_synthesize("你好"):
        chunks.append(chunk)

    assert chunks
    assert all(chunk["provider"] == "fallback" for chunk in chunks)
    assert all(chunk["mimeType"] == "audio/pcm" for chunk in chunks)


def _server_frame(
    *,
    event_type: int,
    payload: bytes,
    session_id: str | None = None,
    connect_id: str | None = None,
    msg_type: int = 0x9,
) -> bytes:
    header = bytes([0x11, (msg_type << 4) | 0x4, 0x10, 0x00])
    body = bytearray()
    body.extend(event_type.to_bytes(4, byteorder="big", signed=True))
    if event_type not in {1, 2, 50, 52}:
        encoded_session = (session_id or "").encode("utf-8")
        body.extend(len(encoded_session).to_bytes(4, byteorder="big"))
        body.extend(encoded_session)
    if event_type in {50, 52}:
        encoded_connect = (connect_id or "").encode("utf-8")
        body.extend(len(encoded_connect).to_bytes(4, byteorder="big"))
        body.extend(encoded_connect)
    body.extend(len(payload).to_bytes(4, byteorder="big"))
    body.extend(payload)
    return header + bytes(body)
