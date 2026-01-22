from fastapi.testclient import TestClient
from sqlalchemy import select

from app.db.session import get_db
from app.models.fact_transaction import FactTransaction


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
        json={"name": "Проект для импорта"},
    )
    assert response.status_code == 201
    return response.json()["id"]


def upload_transactions(client: TestClient, token: str, project_id: int, content: bytes) -> int:
    response = client.post(
        f"/api/projects/{project_id}/uploads",
        headers={"Authorization": f"Bearer {token}"},
        data={"type": "transactions"},
        files={"file": ("transactions.csv", content, "text/csv")},
    )
    assert response.status_code == 201
    return response.json()["id"]


def save_mapping(client: TestClient, token: str, upload_id: int) -> None:
    payload = {
        "mapping": {
            "order_id": "order_id",
            "date": "date",
            "operation_type": "operation_type",
            "amount": "amount",
            "client_id": "client_id",
            "product_name": "product_name",
            "product_category": "product_category",
            "manager": "manager",
        },
        "normalization": {
            "product_name": {"trim": True, "lowercase": True},
            "manager": {"trim": True, "uppercase": True},
        },
    }
    response = client.post(
        f"/api/uploads/{upload_id}/mapping",
        headers={"Authorization": f"Bearer {token}"},
        json=payload,
    )
    assert response.status_code == 201


def test_validate_report_with_errors(client: TestClient) -> None:
    token = register_user(client, "validator@example.com")
    project_id = create_project(client, token)
    content = (
        "order_id,date,operation_type,amount,client_id,product_name,"
        "product_category,manager\n"
        "1001,2024-01-01,sale,1500,501,Phone,Electronics,Irina\n"
        "1001,2024-13-01,sale,-10,502,Laptop,Electronics,Sergey\n"
        "1002,2024-01-03,invalid,100,503,Tablet,Electronics,Anna\n"
    ).encode("utf-8")
    upload_id = upload_transactions(client, token, project_id, content)
    save_mapping(client, token, upload_id)

    response = client.post(
        f"/api/uploads/{upload_id}/validate",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["stats"]["total_rows"] == 3
    assert payload["stats"]["valid_rows"] == 1
    assert payload["stats"]["error_count"] == 3
    assert payload["stats"]["warning_count"] == 1


def test_successful_import(client: TestClient) -> None:
    token = register_user(client, "importer@example.com")
    project_id = create_project(client, token)
    content = (
        "order_id,date,operation_type,amount,client_id,product_name,"
        "product_category,manager\n"
        "1001,2024-01-01,sale,1500,501,Phone,Electronics,Irina\n"
        "1002,2024-01-02,refund,500,502,Tablet,Electronics,Anna\n"
    ).encode("utf-8")
    upload_id = upload_transactions(client, token, project_id, content)
    save_mapping(client, token, upload_id)

    validate_response = client.post(
        f"/api/uploads/{upload_id}/validate",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert validate_response.status_code == 200

    response = client.post(
        f"/api/uploads/{upload_id}/import",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    assert response.json()["imported"] == 2

    override = client.app.dependency_overrides[get_db]
    db = next(override())
    try:
        records = db.scalars(select(FactTransaction)).all()
    finally:
        db.close()

    assert len(records) == 2
