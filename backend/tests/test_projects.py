from fastapi.testclient import TestClient


def register_user(client: TestClient, email: str) -> str:
    response = client.post(
        "/api/auth/register",
        json={"email": email, "password": "password123"},
    )
    assert response.status_code == 201
    return response.json()["tokens"]["access_token"]


def test_create_project(client: TestClient) -> None:
    token = register_user(client, "owner@example.com")

    response = client.post(
        "/api/projects",
        headers={"Authorization": f"Bearer {token}"},
        json={"name": "Новый проект", "timezone": "Europe/Paris"},
    )

    assert response.status_code == 201
    payload = response.json()
    assert payload["name"] == "Новый проект"
    assert payload["timezone"] == "Europe/Paris"

    list_response = client.get(
        "/api/projects",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert list_response.status_code == 200
    list_payload = list_response.json()
    assert len(list_payload["projects"]) == 1


def test_project_access_is_limited_to_owner(client: TestClient) -> None:
    owner_token = register_user(client, "owner-one@example.com")
    other_token = register_user(client, "owner-two@example.com")

    create_response = client.post(
        "/api/projects",
        headers={"Authorization": f"Bearer {owner_token}"},
        json={"name": "Секретный проект"},
    )
    project_id = create_response.json()["id"]

    forbidden_response = client.get(
        f"/api/projects/{project_id}",
        headers={"Authorization": f"Bearer {other_token}"},
    )
    assert forbidden_response.status_code == 404

    own_response = client.get(
        f"/api/projects/{project_id}",
        headers={"Authorization": f"Bearer {owner_token}"},
    )
    assert own_response.status_code == 200
