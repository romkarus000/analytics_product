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
        json={"name": "Gross sales details"},
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
                    order_id="2001",
                    date=date(2024, 1, 7),
                    operation_type="sale",
                    amount=100.0,
                    product_name_norm="alpha",
                    group_1="Group A",
                ),
                FactTransaction(
                    project_id=project_id,
                    order_id="2002",
                    date=date(2024, 1, 8),
                    operation_type="sale",
                    amount=200.0,
                    product_name_norm="beta",
                    group_1="Group B",
                ),
                FactTransaction(
                    project_id=project_id,
                    order_id="2003",
                    date=date(2024, 1, 10),
                    operation_type="sale",
                    amount=400.0,
                    product_name_norm="alpha",
                    group_1="Group A",
                ),
                FactTransaction(
                    project_id=project_id,
                    order_id="2004",
                    date=date(2024, 1, 11),
                    operation_type="sale",
                    amount=100.0,
                    product_name_norm="gamma",
                    group_1="Group B",
                ),
                FactTransaction(
                    project_id=project_id,
                    order_id="2005",
                    date=date(2024, 1, 12),
                    operation_type="sale",
                    amount=50.0,
                    product_name_norm="beta",
                    group_1="Group B",
                ),
            ]
        )
        db.commit()
    finally:
        db.close()


def test_gross_sales_details_endpoint(client: TestClient) -> None:
    token = register_user(client, "details@example.com")
    project_id = create_project(client, token)
    seed_transactions(client, project_id)

    response = client.get(
        f"/api/projects/{project_id}/metrics/gross-sales/details",
        headers={"Authorization": f"Bearer {token}"},
        params={"from": "2024-01-10", "to": "2024-01-12"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["current"]["value"] == 550.0
    assert payload["previous"]["value"] == 300.0
    assert payload["change"]["delta_abs"] == 250.0
    assert payload["change"]["delta_pct"] == pytest.approx(250.0 / 300.0)
    assert payload["series_granularity"] == "day"
    assert payload["drivers"]["products"]["up"][0]["name"] == "alpha"
    assert payload["drivers"]["products"]["up"][0]["delta_abs"] == 400.0 - 100.0
    assert payload["concentration"]["top1_share"] == pytest.approx(400.0 / 550.0)
    assert payload["availability"]["status"] == "partial"
