import pytest
from fastapi.testclient import TestClient

from app.adapters.asr_adapter import asr_adapter
from app.config import settings
from app.main import app
from app.state.session_store import session_store
from app.services.audio_service import audio_service

client = TestClient(app)


@pytest.fixture(autouse=True)
def force_fallback_runtime(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "volcengine_speech_api_key", "")
    monkeypatch.setattr(settings, "ark_api_key", "")


def receive_llm_stream_events(websocket) -> tuple[list[dict], dict]:
    delta_events: list[dict] = []
    while True:
        event = websocket.receive_json()
        if event["type"] == "llm.done":
            return delta_events, event
        delta_events.append(event)


def test_session_start_audio_commit_returns_asr_result() -> None:
    with client.websocket_connect("/ws/session") as websocket:
        connection_event = websocket.receive_json()
        assert connection_event["type"] == "connection.ready"

        websocket.send_json(
            {
                "type": "session.start",
                "inputSource": "camera",
                "deviceInfo": {
                    "micLabel": "Test mic",
                    "cameraLabel": "Test camera",
                },
            }
        )

        ready_event = websocket.receive_json()
        status_event = websocket.receive_json()

        assert ready_event["type"] == "session.ready"
        assert ready_event["sessionId"]
        assert status_event["type"] == "session.status"

        websocket.send_json(
            {
                "type": "audio.chunk",
                "sessionId": ready_event["sessionId"],
                "chunkId": "chunk-1",
                "mimeType": "audio/pcm;rate=16000",
                "base64Audio": "dGVzdA==",
                "durationMs": 920,
            }
        )

        websocket.send_json(
            {
                "type": "turn.commit",
                "sessionId": ready_event["sessionId"],
                "turnId": "turn-1",
                "silenceMs": 1500,
                "includeVision": False,
            }
        )
        asr_event = websocket.receive_json()
        warning_event = websocket.receive_json()

        assert asr_event["type"] == "asr.result"
        assert asr_event["turnId"] == "turn-1"
        assert asr_event["provider"] == "fallback"
        assert "火山语音识别暂不可用" in asr_event["transcript"]
        assert warning_event["type"] == "session.status"
        assert warning_event["level"] == "warning"
        assert "已跳过 AI 回复与语音播报" in warning_event["message"]
        assert "语音片段偏短" in warning_event["message"]


def test_session_frame_capture_and_commit_returns_vision_result() -> None:
    with client.websocket_connect("/ws/session") as websocket:
        websocket.receive_json()
        websocket.send_json(
            {
                "type": "session.start",
                "inputSource": "camera",
            }
        )

        ready_event = websocket.receive_json()
        websocket.receive_json()

        websocket.send_json(
            {
                "type": "frame.capture",
                "sessionId": ready_event["sessionId"],
                "frameId": "frame-1",
                "inputSource": "camera",
                "imageBase64": "ZmFrZS1pbWFnZQ==",
                "width": 1280,
                "height": 720,
                "capturedAt": "2026-06-12T10:00:00+00:00",
            }
        )
        frame_event = websocket.receive_json()
        assert frame_event["type"] == "frame.stored"
        assert frame_event["frameId"] == "frame-1"

        websocket.send_json(
            {
                "type": "audio.chunk",
                "sessionId": ready_event["sessionId"],
                "chunkId": "chunk-vision-1",
                "mimeType": "audio/pcm;rate=16000",
                "base64Audio": "dGVzdA==",
                "durationMs": 1200,
            }
        )

        websocket.send_json(
            {
                "type": "turn.commit",
                "sessionId": ready_event["sessionId"],
                "turnId": "turn-vision-1",
                "silenceMs": 1500,
                "includeVision": True,
            }
        )
        asr_event = websocket.receive_json()
        warning_event = websocket.receive_json()

        assert asr_event["type"] == "asr.result"
        assert warning_event["type"] == "session.status"
        assert warning_event["level"] == "warning"
        assert "已跳过 AI 回复与语音播报" in warning_event["message"]
        assert "本轮语音识别未成功" in warning_event["message"]


def test_session_ping_and_end() -> None:
    with client.websocket_connect("/ws/session") as websocket:
        websocket.receive_json()
        websocket.send_json(
            {
                "type": "session.start",
                "inputSource": "camera",
            }
        )

        ready_event = websocket.receive_json()
        websocket.receive_json()

        websocket.send_json(
            {
                "type": "session.ping",
                "sessionId": ready_event["sessionId"],
            }
        )
        pong_event = websocket.receive_json()
        assert pong_event["type"] == "session.pong"

        websocket.send_json(
            {
                "type": "session.end",
                "sessionId": ready_event["sessionId"],
            }
        )
        closed_event = websocket.receive_json()
        assert closed_event["type"] == "session.closed"


def test_invalid_json_returns_error() -> None:
    with client.websocket_connect("/ws/session") as websocket:
        websocket.receive_json()
        websocket.send_text("{bad json")
        error_event = websocket.receive_json()
        assert error_event["type"] == "error"
        assert error_event["code"] == "invalid_json"


def test_turn_commit_without_audio_returns_error() -> None:
    with client.websocket_connect("/ws/session") as websocket:
        websocket.receive_json()
        websocket.send_json(
            {
                "type": "session.start",
                "inputSource": "camera",
            }
        )
        ready_event = websocket.receive_json()
        websocket.receive_json()

        websocket.send_json(
            {
                "type": "turn.commit",
                "sessionId": ready_event["sessionId"],
                "turnId": "turn-empty",
                "silenceMs": 1500,
                "includeVision": False,
            }
        )
        error_event = websocket.receive_json()
        assert error_event["type"] == "error"
        assert error_event["code"] == "empty_audio"


def test_asr_partial_request_returns_disabled_status() -> None:
    with client.websocket_connect("/ws/session") as websocket:
        websocket.receive_json()
        websocket.send_json(
            {
                "type": "session.start",
                "inputSource": "camera",
            }
        )

        ready_event = websocket.receive_json()
        websocket.receive_json()

        websocket.send_json(
            {
                "type": "audio.chunk",
                "sessionId": ready_event["sessionId"],
                "chunkId": "chunk-p-1",
                "mimeType": "audio/pcm;rate=16000",
                "base64Audio": "dGVzdA==",
                "durationMs": 240,
            }
        )
        websocket.send_json(
            {
                "type": "audio.chunk",
                "sessionId": ready_event["sessionId"],
                "chunkId": "chunk-p-2",
                "mimeType": "audio/pcm;rate=16000",
                "base64Audio": "dGVzdA==",
                "durationMs": 240,
            }
        )
        session_store.set_assistant_speaking(ready_event["sessionId"], True)
        session_store.set_assistant_transcript(ready_event["sessionId"], "这是 AI 正在播报的内容")

        websocket.send_json(
            {
                "type": "asr.partial.request",
                "sessionId": ready_event["sessionId"],
                "requestId": "partial-1",
            }
        )
        partial_event = websocket.receive_json()

        assert partial_event["type"] == "session.status"
        assert "已关闭打断功能" in partial_event["message"]


@pytest.mark.asyncio
async def test_server_driven_partial_barge_in_confirms_after_stable_partials(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    session_id = "session-barge-in"
    session_store.create_session(session_id=session_id, input_source="camera")
    session_store.set_assistant_speaking(session_id, True)
    session_store.set_assistant_transcript(session_id, "我先继续讲一下当前页面")

    partial_transcripts = iter(
        [
            {
                "transcript": "等等",
                "provider": "volcengine",
                "durationMs": 320,
                "chunkCount": 2,
            },
            {
                "transcript": "等等我补充一下",
                "provider": "volcengine",
                "durationMs": 480,
                "chunkCount": 3,
            },
        ]
    )

    async def fake_transcribe_partial(_chunks):
        return next(partial_transcripts)

    monkeypatch.setattr(asr_adapter, "transcribe_partial", fake_transcribe_partial)

    session_store.add_audio_chunk(session_id, "chunk-1", "audio/pcm;rate=16000", "dGVzdA==", 160)
    session_store.add_audio_chunk(session_id, "chunk-2", "audio/pcm;rate=16000", "dGVzdA==", 160)

    assert audio_service.should_probe_barge_in(session_id) is True
    candidate = await audio_service.probe_barge_in(session_id)

    assert candidate is not None
    assert candidate["verdict"] == "candidate"
    assert candidate["transcript"] == "等等"

    session_store.add_audio_chunk(session_id, "chunk-3", "audio/pcm;rate=16000", "dGVzdA==", 160)

    assert audio_service.should_probe_barge_in(session_id) is True
    confirmed = await audio_service.probe_barge_in(session_id)

    assert confirmed is not None
    assert confirmed["verdict"] == "confirmed"
    assert confirmed["transcript"] == "等等我补充一下"

    session_store.remove_session(session_id)
