import pytest
from fastapi.testclient import TestClient

from app.config import settings
from app.main import app

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
        cached_event = websocket.receive_json()
        assert cached_event["type"] == "session.status"

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
        websocket.receive_json()

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
