import pytest
from fastapi.testclient import TestClient

import app.routers.public as public_routes
from app.services.provider_health_service import _probe_speech_ws
from app.utils import volcengine_speech as speech_utils
from app.main import app
from app.core.config import settings

client = TestClient(app)


@pytest.fixture(autouse=True)
def force_tts_fallback(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "volcengine_speech_api_key", "")


def test_healthz() -> None:
    response = client.get("/healthz")

    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_provider_healthz_config_snapshot() -> None:
    response = client.get("/healthz/providers")

    assert response.status_code == 200
    payload = response.json()
    assert payload["summary"]["probe"] is False
    assert payload["providers"]["asr"]["status"] == "misconfigured"
    assert payload["providers"]["tts"]["status"] == "misconfigured"
    assert payload["providers"]["llm"]["requiredConfig"] == ["ARK_API_KEY"]


def test_provider_healthz_probe(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_provider_health(*, probe: bool = False) -> dict[str, object]:
        assert probe is True
        return {
            "summary": {"probe": True, "readyCount": 3, "errorCount": 1},
            "providers": {
                "asr": {"status": "error", "message": "SSLCertVerificationError"},
                "tts": {"status": "ready", "message": "语音 WebSocket 握手成功"},
                "llm": {"status": "ready", "message": "文本模型可用"},
                "vision": {"status": "ready", "message": "视觉模型可用"},
            },
        }

    monkeypatch.setattr(public_routes, "get_provider_health", fake_provider_health)

    response = client.get("/healthz/providers?probe=true")

    assert response.status_code == 200
    payload = response.json()
    assert payload["summary"]["probe"] is True
    assert payload["providers"]["asr"]["status"] == "error"
    assert payload["providers"]["tts"]["status"] == "ready"


@pytest.mark.asyncio
async def test_probe_speech_ws_closes_connection(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "volcengine_speech_api_key", "speech-key")

    class FakeWebSocket:
        def __init__(self) -> None:
            self.close_calls = 0
            self.close_code = None

        async def close(self) -> None:
            self.close_calls += 1
            self.close_code = 1000

    fake_websocket = FakeWebSocket()
    captured: dict[str, object] = {}

    async def fake_connect(*_args, **kwargs):
        captured.update(kwargs)
        return fake_websocket

    monkeypatch.setattr("app.services.provider_health_service.websockets.connect", fake_connect)

    ok, message = await _probe_speech_ws("wss://example.com/ws", resource_id="seed-test")

    assert ok is True
    assert message == "语音 WebSocket 握手成功"
    assert fake_websocket.close_calls == 1
    assert captured["additional_headers"]["X-Api-Key"] == "speech-key"
    assert captured["additional_headers"]["X-Api-Resource-Id"] == "seed-test"
    assert captured["additional_headers"]["X-Api-Connect-Id"]


def test_explain_speech_ws_error_forbidden(monkeypatch: pytest.MonkeyPatch) -> None:
    class FakeInvalidStatus(Exception):
        def __init__(self) -> None:
            self.response = type(
                "Response",
                (),
                {
                    "status_code": 403,
                    "headers": {
                        "X-Tt-Logid": "logid-123",
                    },
                },
            )()

    monkeypatch.setattr(speech_utils.websockets, "InvalidStatus", FakeInvalidStatus)

    message = speech_utils.explain_speech_ws_error(
        exc=FakeInvalidStatus(),
        service_name="ASR",
        resource_id="volc.seedasr.sauc.duration",
    )

    assert "HTTP 403" in message
    assert "X-Tt-Logid=logid-123" in message
    assert "volc.seedasr.sauc.duration" in message


def test_public_config() -> None:
    response = client.get("/api/config/public")

    assert response.status_code == 200
    assert response.json()["frontendMode"] == "react-shadcn"


def test_tts_synthesize_fallback_endpoint() -> None:
    response = client.post(
        "/api/tts/synthesize",
        json={
            "text": "你好，欢迎使用 More See。",
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["provider"] == "fallback"
    assert payload["mimeType"] == "audio/wav"
    assert payload["audioBase64"]
    assert payload["textLength"] > 0
