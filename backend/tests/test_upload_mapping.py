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
        json={"name": "Проект для маппинга"},
    )
    assert response.status_code == 201
    return response.json()["id"]


def upload_transactions(client: TestClient, token: str, project_id: int) -> int:
    content = (
        "order_id,paid_at,operation_type,amount,client_id,product_name,"
        "product_category,manager\n"
        "1001,2024-01-01,sale,1500,501,Phone,Electronics,Irina\n"
    ).encode("utf-8")
    response = client.post(
        f"/api/projects/{project_id}/uploads",
        headers={"Authorization": f"Bearer {token}"},
        data={"type": "transactions"},
        files={"file": ("transactions.csv", content, "text/csv")},
    )
    assert response.status_code == 201
    return response.json()["id"]


def test_preview_upload(client: TestClient) -> None:
    token = register_user(client, "previewer@example.com")
    project_id = create_project(client, token)
    upload_id = upload_transactions(client, token, project_id)

    response = client.get(
        f"/api/uploads/{upload_id}/preview",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["headers"] == [
        "order_id",
        "paid_at",
        "operation_type",
        "amount",
        "client_id",
        "product_name",
        "product_category",
        "manager",
    ]
    assert len(payload["sample_rows"]) == 1
    assert "amount" in payload["inferred_types"]
    assert "order_id" in payload["mapping_suggestions"]
    assert "column_stats" in payload


def test_save_mapping(client: TestClient) -> None:
    token = register_user(client, "mapper@example.com")
    project_id = create_project(client, token)
    upload_id = upload_transactions(client, token, project_id)

    payload = {
        "mapping": {
            "order_id": "order_id",
            "paid_at": "paid_at",
            "operation_type": "operation_type",
            "amount": "amount",
            "client_id": "client_id",
            "product_name": "product_name",
            "product_category": "product_category",
            "manager": "manager",
        },
        "normalization": {"amount": {"trim": True}},
        "operation_type_mapping": {"sale": "sale", "refund": "refund"},
        "unknown_operation_policy": "error",
    }
    response = client.post(
        f"/api/uploads/{upload_id}/mapping",
        headers={"Authorization": f"Bearer {token}"},
        json=payload,
    )

    assert response.status_code == 201
    body = response.json()
    assert body["upload_id"] == upload_id
    assert body["mapping_json"]["mapping"]["amount"] == "amount"


def test_reject_mapping_without_required_fields(client: TestClient) -> None:
    token = register_user(client, "missing@example.com")
    project_id = create_project(client, token)
    upload_id = upload_transactions(client, token, project_id)

    payload = {
        "mapping": {
            "order_id": "order_id",
            "paid_at": "paid_at",
            "client_id": "client_id",
            "product_name": "product_name",
            "product_category": "product_category",
        }
    }
    response = client.post(
        f"/api/uploads/{upload_id}/mapping",
        headers={"Authorization": f"Bearer {token}"},
        json=payload,
    )

    assert response.status_code == 400
