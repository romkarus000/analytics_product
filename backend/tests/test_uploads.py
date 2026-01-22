from fastapi.testclient import TestClient


def register_user(client: TestClient, email: str) -> str:
    response = client.post(
        "/api/auth/register",
        json={"email": email, "password": "password123"},
    )
    assert response.status_code == 201
    return response.json()["tokens"]["access_token"]


def create_project(client: TestClient, token: str) -> int:
    response = client.post(
        "/api/projects",
        headers={"Authorization": f"Bearer {token}"},
        json={"name": "Проект для загрузки"},
    )
    assert response.status_code == 201
    return response.json()["id"]


def test_upload_file_and_history(client: TestClient) -> None:
    token = register_user(client, "uploader@example.com")
    project_id = create_project(client, token)

    upload_response = client.post(
        f"/api/projects/{project_id}/uploads",
        headers={"Authorization": f"Bearer {token}"},
        data={"type": "transactions"},
        files={"file": ("transactions.csv", b"id,amount\n1,100\n", "text/csv")},
    )

    assert upload_response.status_code == 201
    payload = upload_response.json()
    assert payload["type"] == "transactions"
    assert payload["status"] == "uploaded"
    assert payload["original_filename"] == "transactions.csv"

    history_response = client.get(
        f"/api/projects/{project_id}/uploads",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert history_response.status_code == 200
    history_payload = history_response.json()
    assert len(history_payload) == 1
    assert history_payload[0]["id"] == payload["id"]
