import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.db.session import get_db
from app.main import app


@pytest.fixture()
def client() -> TestClient:
    engine = create_engine(
        "sqlite+pysqlite:///:memory:",
        connect_args={"check_same_thread": False},
    )
    TestingSessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    Base.metadata.create_all(bind=engine)

    def override_get_db():
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


def test_register_and_login(client: TestClient) -> None:
    register_response = client.post(
        "/api/auth/register",
        json={"email": "demo@example.com", "password": "password123"},
    )
    assert register_response.status_code == 201
    register_payload = register_response.json()
    assert register_payload["tokens"]["access_token"]

    login_response = client.post(
        "/api/auth/login",
        json={"email": "demo@example.com", "password": "password123"},
    )
    assert login_response.status_code == 200
    login_payload = login_response.json()
    assert login_payload["tokens"]["access_token"]


def test_projects_requires_auth(client: TestClient) -> None:
    response = client.get("/api/projects")
    assert response.status_code == 401


def test_projects_with_token(client: TestClient) -> None:
    register_response = client.post(
        "/api/auth/register",
        json={"email": "owner@example.com", "password": "password123"},
    )
    token = register_response.json()["tokens"]["access_token"]
    response = client.get("/api/projects", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200
    assert "projects" in response.json()
