from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


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
                "mimeType": "audio/webm",
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
        committed_event = websocket.receive_json()

        assert asr_event["type"] == "asr.result"
        assert asr_event["turnId"] == "turn-1"
        assert asr_event["provider"] == "mock"
        assert "模拟识别结果" in asr_event["transcript"]
        assert committed_event["type"] == "session.status"


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
