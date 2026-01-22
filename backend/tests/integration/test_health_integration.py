import os

import pytest
from fastapi.testclient import TestClient

from app.main import app


def _has_db() -> bool:
    return bool(os.getenv("DATABASE_URL"))


@pytest.mark.integration
@pytest.mark.skipif(not _has_db(), reason="DATABASE_URL not set")
def test_health_integration() -> None:
    client = TestClient(app)
    response = client.get("/health")

    assert response.status_code == 200
    payload = response.json()
    assert "status" in payload
    assert "database" in payload
    assert "redis" in payload
