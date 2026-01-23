from fastapi.testclient import TestClient
from sqlalchemy import select

from app.db.session import get_db
from app.models.dim_product_alias import DimProductAlias
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
        json={"name": "Проект для справочников"},
    )
    assert response.status_code == 201
    return response.json()["id"]


def create_product(
    client: TestClient, token: str, project_id: int, name: str
) -> int:
    response = client.post(
        f"/api/projects/{project_id}/products",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "canonical_name": name,
            "category": "Категория",
            "product_type": "course",
        },
    )
    assert response.status_code == 201
    return response.json()["id"]


def add_product_alias(
    client: TestClient, token: str, project_id: int, product_id: int, alias: str
) -> None:
    response = client.post(
        f"/api/projects/{project_id}/products/{product_id}/aliases",
        headers={"Authorization": f"Bearer {token}"},
        json={"alias": alias},
    )
    assert response.status_code == 201


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
            "paid_at": "paid_at",
            "operation_type": "operation_type",
            "amount": "amount",
            "client_id": "client_id",
            "product_name": "product_name",
            "product_category": "product_category",
            "manager": "manager",
        },
        "normalization": {
            "product_name": {"trim": True, "lowercase": True},
            "manager": {"trim": True, "lowercase": True},
        },
        "operation_type_mapping": {"sale": "sale", "refund": "refund"},
        "unknown_operation_policy": "error",
    }
    response = client.post(
        f"/api/uploads/{upload_id}/mapping",
        headers={"Authorization": f"Bearer {token}"},
        json=payload,
    )
    assert response.status_code == 201


def import_transactions(client: TestClient, token: str, upload_id: int) -> None:
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


def test_alias_merge_updates_product(client: TestClient) -> None:
    token = register_user(client, "aliases@example.com")
    project_id = create_project(client, token)
    first_product = create_product(client, token, project_id, "Первый продукт")
    second_product = create_product(client, token, project_id, "Второй продукт")

    add_product_alias(client, token, project_id, first_product, "alias-one")
    add_product_alias(client, token, project_id, second_product, "alias-one")

    override = client.app.dependency_overrides[get_db]
    db = next(override())
    try:
        alias_row = db.scalar(
            select(DimProductAlias).where(
                DimProductAlias.project_id == project_id,
                DimProductAlias.alias == "alias-one",
            )
        )
        assert alias_row is not None
        assert alias_row.product_id == second_product
    finally:
        db.close()


def test_recompute_canonical_after_alias_addition(client: TestClient) -> None:
    token = register_user(client, "recompute@example.com")
    project_id = create_project(client, token)
    content = (
        "order_id,paid_at,operation_type,amount,client_id,product_name,"
        "product_category,manager\n"
        "1001,2024-01-01,sale,1500,501,Legacy,Electronics,Sam\n"
    ).encode("utf-8")
    upload_id = upload_transactions(client, token, project_id, content)
    save_mapping(client, token, upload_id)
    import_transactions(client, token, upload_id)

    override = client.app.dependency_overrides[get_db]
    db = next(override())
    try:
        record = db.scalar(select(FactTransaction))
        assert record is not None
        assert record.product_name_norm == "legacy"
    finally:
        db.close()

    product_id = create_product(client, token, project_id, "Каноничный продукт")
    add_product_alias(client, token, project_id, product_id, "legacy")

    override = client.app.dependency_overrides[get_db]
    db = next(override())
    try:
        record = db.scalar(select(FactTransaction))
        assert record is not None
        assert record.product_name_norm == "Каноничный продукт"
        assert record.product_id == product_id
    finally:
        db.close()
