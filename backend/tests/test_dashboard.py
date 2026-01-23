from datetime import date

import pytest
from fastapi.testclient import TestClient
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
        json={"name": "Dashboard project"},
    )
    assert response.status_code == 201
    return response.json()["id"]


def seed_transactions(client: TestClient, project_id: int) -> None:
    override = client.app.dependency_overrides[get_db]
    db = next(override())
    try:
        db.add_all(
            [
                FactTransaction(
                    project_id=project_id,
                    order_id="1001",
                    date=date(2024, 1, 1),
                    operation_type="sale",
                    amount=100.0,
                    client_id="501",
                    product_name_raw="Phone",
                    product_name_norm="phone",
                    product_category="Electronics",
                    product_type="Gadget",
                    manager_raw="Ann",
                    manager_norm="ANN",
                    payment_method="card",
                    commission=10.0,
                ),
                FactTransaction(
                    project_id=project_id,
                    order_id="1002",
                    date=date(2024, 1, 2),
                    operation_type="sale",
                    amount=200.0,
                    client_id="502",
                    product_name_raw="Laptop",
                    product_name_norm="laptop",
                    product_category="Electronics",
                    product_type="Laptop",
                    manager_raw="Bob",
                    manager_norm="BOB",
                    payment_method="card",
                    commission=20.0,
                ),
                FactTransaction(
                    project_id=project_id,
                    order_id="1001",
                    date=date(2024, 1, 3),
                    operation_type="refund",
                    amount=50.0,
                    client_id="501",
                    product_name_raw="Phone",
                    product_name_norm="phone",
                    product_category="Electronics",
                    product_type="Gadget",
                    manager_raw="Ann",
                    manager_norm="ANN",
                    payment_method="card",
                    commission=0.0,
                ),
                FactTransaction(
                    project_id=project_id,
                    order_id="1003",
                    date=date(2024, 1, 4),
                    operation_type="sale",
                    amount=300.0,
                    client_id="503",
                    product_name_raw="Chair",
                    product_name_norm="chair",
                    product_category="Furniture",
                    product_type="Home",
                    manager_raw="Ann",
                    manager_norm="ANN",
                    payment_method="card",
                    commission=30.0,
                ),
            ]
        )
        db.commit()
    finally:
        db.close()


def test_dashboard_breakdowns(client: TestClient) -> None:
    token = register_user(client, "dashboard-breakdowns@example.com")
    project_id = create_project(client, token)
    seed_transactions(client, project_id)

    response = client.get(
        f"/api/projects/{project_id}/dashboard",
        headers={"Authorization": f"Bearer {token}"},
        params={"from": "2024-01-01", "to": "2024-01-31"},
    )

    assert response.status_code == 200
    payload = response.json()
    sales_pack = payload["packs"]["sales_pack"]
    assert sales_pack["breakdowns"]["top_products_by_revenue"] == [
        {"name": "chair", "revenue": 300.0},
        {"name": "laptop", "revenue": 200.0},
        {"name": "phone", "revenue": 50.0},
    ]
    assert sales_pack["breakdowns"]["top_managers_by_revenue"] == [
        {"name": "ANN", "revenue": 350.0},
        {"name": "BOB", "revenue": 200.0},
    ]
    product_pack = payload["packs"]["product_pack"]
    assert product_pack["breakdowns"]["top_products_by_revenue"] == [
        {"name": "chair", "revenue": 300.0},
        {"name": "laptop", "revenue": 200.0},
        {"name": "phone", "revenue": 50.0},
    ]


def test_dashboard_filters(client: TestClient) -> None:
    token = register_user(client, "dashboard-filters@example.com")
    project_id = create_project(client, token)
    seed_transactions(client, project_id)

    response = client.get(
        f"/api/projects/{project_id}/dashboard",
        headers={"Authorization": f"Bearer {token}"},
        params={
            "from": "2024-01-01",
            "to": "2024-01-31",
            "filters": '{"product_category": "Electronics", "manager": "ANN", "product_name": "phone", "product_type": "Gadget"}',
        },
    )

    assert response.status_code == 200
    payload = response.json()
    sales_pack = payload["packs"]["sales_pack"]
    assert sales_pack["series"] == [
        {
            "date": "2024-01-01",
            "gross_sales": 100.0,
            "refunds": 0.0,
            "net_revenue": 100.0,
            "orders": 1,
        },
        {
            "date": "2024-01-03",
            "gross_sales": 0.0,
            "refunds": 50.0,
            "net_revenue": -50.0,
            "orders": 0,
        },
    ]
    assert sales_pack["breakdowns"]["top_products_by_revenue"] == [
        {"name": "phone", "revenue": 50.0}
    ]
    assert sales_pack["breakdowns"]["top_managers_by_revenue"] == [
        {"name": "ANN", "revenue": 50.0}
    ]
