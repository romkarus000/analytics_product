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


def test_dashboard_source_usage_and_delete_guard(client: TestClient) -> None:
    token = register_user(client, "dashboard-source@example.com")
    project_id = create_project(client, token)

    first_upload = client.post(
        f"/api/projects/{project_id}/uploads",
        headers={"Authorization": f"Bearer {token}"},
        data={"type": "transactions"},
        files={"file": ("first.csv", b"id,amount\n1,100\n", "text/csv")},
    ).json()

    second_upload = client.post(
        f"/api/projects/{project_id}/uploads",
        headers={"Authorization": f"Bearer {token}"},
        data={"type": "transactions"},
        files={"file": ("second.csv", b"id,amount\n2,200\n", "text/csv")},
    ).json()

    source_response = client.post(
        f"/api/projects/{project_id}/dashboard-sources",
        headers={"Authorization": f"Bearer {token}"},
        json={"data_type": "transactions", "upload_id": first_upload["id"]},
    )
    assert source_response.status_code == 200

    history_response = client.get(
        f"/api/projects/{project_id}/uploads",
        headers={"Authorization": f"Bearer {token}"},
    )
    history_payload = history_response.json()
    usage_map = {item["id"]: item["used_in_dashboard"] for item in history_payload}
    assert usage_map[first_upload["id"]] is True
    assert usage_map[second_upload["id"]] is False

    delete_response = client.delete(
        f"/api/uploads/{first_upload['id']}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert delete_response.status_code == 409

    clear_response = client.post(
        f"/api/projects/{project_id}/dashboard-sources",
        headers={"Authorization": f"Bearer {token}"},
        json={"data_type": "transactions", "upload_id": None},
    )
    assert clear_response.status_code == 200

    delete_response = client.delete(
        f"/api/uploads/{first_upload['id']}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert delete_response.status_code == 204


def test_cleanup_inactive_only_skips_active_upload(client: TestClient) -> None:
    token = register_user(client, "cleanup@example.com")
    project_id = create_project(client, token)

    active_upload = client.post(
        f"/api/projects/{project_id}/uploads",
        headers={"Authorization": f"Bearer {token}"},
        data={"type": "transactions"},
        files={"file": ("active.csv", b"id,amount\n1,100\n", "text/csv")},
    ).json()

    inactive_upload = client.post(
        f"/api/projects/{project_id}/uploads",
        headers={"Authorization": f"Bearer {token}"},
        data={"type": "transactions"},
        files={"file": ("inactive.csv", b"id,amount\n2,200\n", "text/csv")},
    ).json()

    source_response = client.post(
        f"/api/projects/{project_id}/dashboard-sources",
        headers={"Authorization": f"Bearer {token}"},
        json={"data_type": "transactions", "upload_id": active_upload["id"]},
    )
    assert source_response.status_code == 200

    cleanup_response = client.post(
        f"/api/projects/{project_id}/uploads/cleanup",
        headers={"Authorization": f"Bearer {token}"},
        json={"mode": "inactive_only"},
    )
    assert cleanup_response.status_code == 200
    assert cleanup_response.json()["deleted"] == 1

    history_response = client.get(
        f"/api/projects/{project_id}/uploads",
        headers={"Authorization": f"Bearer {token}"},
    )
    remaining_ids = {item["id"] for item in history_response.json()}
    assert active_upload["id"] in remaining_ids
    assert inactive_upload["id"] not in remaining_ids
