from fastapi.testclient import TestClient


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
