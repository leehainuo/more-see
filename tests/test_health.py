import pytest
from fastapi.testclient import TestClient

import app.api.http as http_api
from app.main import app
from app.config import settings

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

    monkeypatch.setattr(http_api, "get_provider_health", fake_provider_health)

    response = client.get("/healthz/providers?probe=true")

    assert response.status_code == 200
    payload = response.json()
    assert payload["summary"]["probe"] is True
    assert payload["providers"]["asr"]["status"] == "error"
    assert payload["providers"]["tts"]["status"] == "ready"


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
