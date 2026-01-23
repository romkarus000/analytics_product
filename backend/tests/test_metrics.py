from datetime import date

import pytest
from fastapi.testclient import TestClient
from app.db.session import get_db
from app.models.fact_marketing_spend import FactMarketingSpend
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
        json={"name": "Metrics project"},
    )
    assert response.status_code == 201
    return response.json()["id"]


def seed_data(client: TestClient, project_id: int) -> None:
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
                    fee_total=10.0,
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
                    product_type="Gadget",
                    manager_raw="Bob",
                    manager_norm="BOB",
                    payment_method="card",
                    fee_total=20.0,
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
                    fee_total=0.0,
                ),
            ]
        )
        db.add(
            FactMarketingSpend(
                project_id=project_id,
                date=date(2024, 1, 1),
                spend_amount=100.0,
                channel_raw="search",
                channel_norm="Search",
            )
        )
        db.commit()
    finally:
        db.close()


@pytest.mark.parametrize(
    ("metric_key", "expected"),
    [
        ("gross_sales", 300.0),
        ("refunds", 50.0),
        ("net_revenue", 250.0),
        ("refund_rate", 50.0 / 300.0),
        ("orders", 2.0),
        ("buyers", 2.0),
        ("aov", 150.0),
        ("commissions", 30.0),
        ("net_profit_simple", 220.0),
        ("commission_share", 30.0 / 300.0),
        ("spend", 100.0),
        ("roas", 2.5),
    ],
)
def test_metrics_compute(client: TestClient, metric_key: str, expected: float) -> None:
    token = register_user(client, f"metrics-{metric_key}@example.com")
    project_id = create_project(client, token)
    seed_data(client, project_id)

    response = client.get(
        f"/api/projects/{project_id}/metrics/{metric_key}",
        headers={"Authorization": f"Bearer {token}"},
        params={"from": "2024-01-01", "to": "2024-01-31"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["metric_key"] == metric_key
    assert payload["value"] == pytest.approx(expected)


def test_metrics_availability(client: TestClient) -> None:
    token = register_user(client, "availability@example.com")
    project_id = create_project(client, token)

    response = client.get(
        f"/api/projects/{project_id}/metrics",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    metrics = {metric["metric_key"]: metric for metric in response.json()}
    assert metrics["gross_sales"]["is_available"] is False
    assert metrics["spend"]["is_available"] is False

    seed_data(client, project_id)
    response = client.get(
        f"/api/projects/{project_id}/metrics",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    metrics = {metric["metric_key"]: metric for metric in response.json()}
    assert metrics["gross_sales"]["is_available"] is True
    assert metrics["spend"]["is_available"] is True
