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
