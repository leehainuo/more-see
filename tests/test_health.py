from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_healthz() -> None:
    response = client.get("/healthz")

    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_public_config() -> None:
    response = client.get("/api/config/public")

    assert response.status_code == 200
    assert response.json()["frontendMode"] == "react-shadcn"


def test_tts_synthesize_mock_endpoint() -> None:
    response = client.post(
        "/api/tts/synthesize",
        json={
            "text": "你好，欢迎使用 More See。",
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["provider"] == "mock"
    assert payload["mimeType"] == "audio/wav"
    assert payload["audioBase64"]
    assert payload["textLength"] > 0
