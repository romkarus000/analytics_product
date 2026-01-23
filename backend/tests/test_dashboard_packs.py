from __future__ import annotations

from datetime import date

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
        json={"name": "Pack project"},
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
                    transaction_id="tx-1",
                    date=date(2024, 1, 1),
                    operation_type="sale",
                    amount=100.0,
                    client_id="501",
                    product_name_norm="course-a",
                    manager_norm="ANN",
                    payment_method="card",
                    group_1="Core",
                    group_2="Level-1",
                    fee_1=5.0,
                    fee_2=2.0,
                ),
                FactTransaction(
                    project_id=project_id,
                    transaction_id="tx-2",
                    date=date(2024, 1, 2),
                    operation_type="sale",
                    amount=200.0,
                    client_id="502",
                    product_name_norm="course-b",
                    manager_norm="BOB",
                    payment_method="cash",
                    group_1="Addons",
                    group_2="Level-2",
                    fee_1=8.0,
                    fee_2=5.0,
                ),
                FactTransaction(
                    project_id=project_id,
                    transaction_id="tx-3",
                    date=date(2024, 1, 3),
                    operation_type="refund",
                    amount=20.0,
                    client_id="501",
                    product_name_norm="course-a",
                    manager_norm="ANN",
                    payment_method="card",
                    group_1="Core",
                    group_2="Level-1",
                    fee_1=0.0,
                    fee_2=0.0,
                ),
            ]
        )
        db.commit()
    finally:
        db.close()


def _find_metric(metrics: list[dict], key: str) -> dict:
    return next(item for item in metrics if item["key"] == key)


def test_dashboard_availability_partial_order_id(client: TestClient) -> None:
    token = register_user(client, "availability-pack@example.com")
    project_id = create_project(client, token)
    seed_transactions(client, project_id)

    response = client.get(
        f"/api/projects/{project_id}/dashboard",
        headers={"Authorization": f"Bearer {token}"},
        params={"from": "2024-01-01", "to": "2024-01-31"},
    )

    assert response.status_code == 200
    payload = response.json()
    orders_metric = _find_metric(payload["executive_cards"], "orders")
    assert orders_metric["availability"] == "partial"
    assert "order_id" in orders_metric["missing_fields"]


def test_dashboard_group_drilldown(client: TestClient) -> None:
    token = register_user(client, "group-pack@example.com")
    project_id = create_project(client, token)
    seed_transactions(client, project_id)

    response = client.get(
        f"/api/projects/{project_id}/dashboard",
        headers={"Authorization": f"Bearer {token}"},
        params={"from": "2024-01-01", "to": "2024-01-31"},
    )

    assert response.status_code == 200
    payload = response.json()
    groups_pack = payload["packs"]["groups_pack"]
    assert groups_pack["breakdowns"]["level"] == 1
    assert {item["name"] for item in groups_pack["breakdowns"]["revenue_by_group"]} == {
        "Core",
        "Addons",
    }

    response = client.get(
        f"/api/projects/{project_id}/dashboard",
        headers={"Authorization": f"Bearer {token}"},
        params={
            "from": "2024-01-01",
            "to": "2024-01-31",
            "filters": '{"group_1": "Core"}',
        },
    )

    assert response.status_code == 200
    payload = response.json()
    groups_pack = payload["packs"]["groups_pack"]
    assert groups_pack["breakdowns"]["level"] == 2
    assert {item["name"] for item in groups_pack["breakdowns"]["revenue_by_group"]} == {
        "Level-1"
    }


def test_dashboard_profit_pack_fees(client: TestClient) -> None:
    token = register_user(client, "profit-pack@example.com")
    project_id = create_project(client, token)
    seed_transactions(client, project_id)

    response = client.get(
        f"/api/projects/{project_id}/dashboard",
        headers={"Authorization": f"Bearer {token}"},
        params={"from": "2024-01-01", "to": "2024-01-31"},
    )

    assert response.status_code == 200
    payload = response.json()
    profit_pack = payload["packs"]["profit_pack"]
    fees_metric = _find_metric(profit_pack["metrics"], "fees_total")
    profit_metric = _find_metric(profit_pack["metrics"], "net_profit_simple")
    assert fees_metric["value"] == 20.0
    assert profit_metric["value"] == 260.0
