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
        json={"name": "Alerts Project", "timezone": "Europe/Moscow"},
    )
    assert response.status_code == 201
    return response.json()["id"]


def test_alert_rule_and_event_flow(client: TestClient) -> None:
    token = register_user(client, "alerts@example.com")
    project_id = create_project(client, token)

    bind_response = client.put(
        f"/api/projects/{project_id}/telegram",
        headers={"Authorization": f"Bearer {token}"},
        json={"chat_id": "123456"},
    )
    assert bind_response.status_code == 200

    create_rule_response = client.post(
        f"/api/projects/{project_id}/alerts",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "metric_key": "orders",
            "rule_type": "threshold",
            "params": {"threshold": 10, "comparison": "gt", "lookback_days": 1},
            "is_enabled": True,
        },
    )
    assert create_rule_response.status_code == 201
    rule_id = create_rule_response.json()["id"]

    send_test_response = client.post(
        f"/api/projects/{project_id}/alerts/{rule_id}/send-test",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert send_test_response.status_code == 200
    send_payload = send_test_response.json()
    assert send_payload["event"]["rule_id"] == rule_id
    assert send_payload["event"]["payload"]["type"] == "test"

    events_response = client.get(
        f"/api/projects/{project_id}/alerts/{rule_id}/events",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert events_response.status_code == 200
    events_payload = events_response.json()
    assert len(events_payload) == 1
