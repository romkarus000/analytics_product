from datetime import date

from fastapi.testclient import TestClient

from app.db.session import get_db
from app.models.fact_transaction import FactTransaction
from app.services.insights import generate_insights_for_project


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
        json={"name": "Insight project"},
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
                    date=date(2024, 1, 2),
                    operation_type="sale",
                    amount=100.0,
                    client_id="501",
                    product_name_raw="Phone",
                    product_name_norm="Electronics",
                    product_category="Electronics",
                    product_type="Gadget",
                    manager_raw="Ann",
                    manager_norm="ANN",
                ),
                FactTransaction(
                    project_id=project_id,
                    order_id="1002",
                    date=date(2024, 1, 3),
                    operation_type="sale",
                    amount=50.0,
                    client_id="502",
                    product_name_raw="Chair",
                    product_name_norm="Furniture",
                    product_category="Furniture",
                    product_type="Home",
                    manager_raw="Bob",
                    manager_norm="BOB",
                ),
                FactTransaction(
                    project_id=project_id,
                    order_id="1003",
                    date=date(2024, 1, 10),
                    operation_type="sale",
                    amount=220.0,
                    client_id="503",
                    product_name_raw="Phone",
                    product_name_norm="Electronics",
                    product_category="Electronics",
                    product_type="Gadget",
                    manager_raw="Ann",
                    manager_norm="ANN",
                ),
                FactTransaction(
                    project_id=project_id,
                    order_id="1004",
                    date=date(2024, 1, 11),
                    operation_type="sale",
                    amount=40.0,
                    client_id="504",
                    product_name_raw="Chair",
                    product_name_norm="Furniture",
                    product_category="Furniture",
                    product_type="Home",
                    manager_raw="Bob",
                    manager_norm="BOB",
                ),
            ]
        )
        db.commit()
    finally:
        db.close()


def test_generate_insight_with_breakdowns(client: TestClient) -> None:
    token = register_user(client, "insights@example.com")
    project_id = create_project(client, token)
    seed_transactions(client, project_id)

    override = client.app.dependency_overrides[get_db]
    db = next(override())
    try:
        insights = generate_insights_for_project(db, project_id)
        db.commit()
        gross_sales = next(
            insight for insight in insights if insight.metric_key == "gross_sales"
        )
        expected_text = (
            "Gross Sales: вырос на 110.00 (+73.3%) vs 150.00 → 260.00 "
            "за период 2024-01-08–2024-01-14. Драйвер: Категория "
            "Electronics (рост 120.00)."
        )
        assert gross_sales.text == expected_text
    finally:
        db.close()
