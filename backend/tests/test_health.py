from fastapi.testclient import TestClient

from app.main import app


def test_health_endpoint_returns_payload(monkeypatch) -> None:
    from app.services import health as health_service

    monkeypatch.setattr(health_service, "check_database", lambda _db: True)
    monkeypatch.setattr(health_service, "check_redis", lambda: True)

    client = TestClient(app)
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "database": True, "redis": True}
