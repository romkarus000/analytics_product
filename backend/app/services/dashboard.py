from __future__ import annotations

from datetime import date
from typing import Any

from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from app.models.fact_transaction import FactTransaction


FILTER_COLUMNS = {
    "product_category": FactTransaction.product_category,
    "product_name": FactTransaction.product_name_norm,
    "manager": FactTransaction.manager_norm,
    "product_type": FactTransaction.product_type,
}


def _normalize_filters(filters: dict[str, Any] | None) -> dict[str, Any]:
    if not filters:
        return {}
    normalized: dict[str, Any] = {}
    for key, value in filters.items():
        if isinstance(value, str):
            normalized[key] = value.strip()
        elif isinstance(value, list):
            normalized[key] = [item.strip() if isinstance(item, str) else item for item in value]
        else:
            normalized[key] = value
    return normalized


def _apply_filters(conditions: list[Any], filters: dict[str, Any]) -> list[Any]:
    for key, value in filters.items():
        column = FILTER_COLUMNS.get(key)
        if column is None:
            continue
        if isinstance(value, list):
            conditions.append(column.in_(value))
        else:
            conditions.append(column == value)
    return conditions


def _revenue_expression() -> Any:
    return func.sum(
        case(
            (FactTransaction.operation_type == "sale", FactTransaction.amount),
            (FactTransaction.operation_type == "refund", -FactTransaction.amount),
            else_=0.0,
        )
    )


def get_dashboard_data(
    db: Session,
    project_id: int,
    from_date: date | None,
    to_date: date | None,
    filters: dict[str, Any] | None = None,
) -> dict[str, Any]:
    filters = _normalize_filters(filters)
    conditions: list[Any] = [FactTransaction.project_id == project_id]
    if from_date:
        conditions.append(FactTransaction.date >= from_date)
    if to_date:
        conditions.append(FactTransaction.date <= to_date)
    _apply_filters(conditions, filters)

    revenue_expr = _revenue_expression().label("net_revenue")
    gross_sales_expr = func.sum(
        case(
            (FactTransaction.operation_type == "sale", FactTransaction.amount),
            else_=0.0,
        )
    ).label("gross_sales")
    refunds_expr = func.sum(
        case(
            (FactTransaction.operation_type == "refund", FactTransaction.amount),
            else_=0.0,
        )
    ).label("refunds")
    orders_expr = func.count(
        func.distinct(
            case(
                (
                    FactTransaction.operation_type == "sale",
                    func.coalesce(
                        FactTransaction.transaction_id, FactTransaction.order_id
                    ),
                ),
                else_=None,
            )
        )
    ).label("orders")

    series_rows = db.execute(
        select(
            FactTransaction.date.label("date"),
            func.coalesce(gross_sales_expr, 0.0).label("gross_sales"),
            func.coalesce(refunds_expr, 0.0).label("refunds"),
            func.coalesce(revenue_expr, 0.0).label("net_revenue"),
            func.coalesce(orders_expr, 0).label("orders"),
        )
        .where(*conditions)
        .group_by(FactTransaction.date)
        .order_by(FactTransaction.date)
    ).all()

    series = [
        {
            "date": row.date,
            "gross_sales": float(row.gross_sales or 0.0),
            "refunds": float(row.refunds or 0.0),
            "net_revenue": float(row.net_revenue or 0.0),
            "orders": int(row.orders or 0),
        }
        for row in series_rows
    ]

    top_products = db.execute(
        select(
            FactTransaction.product_name_norm.label("name"),
            func.coalesce(revenue_expr, 0.0).label("revenue"),
        )
        .where(*conditions)
        .group_by(FactTransaction.product_name_norm)
        .order_by(func.coalesce(revenue_expr, 0.0).desc())
        .limit(5)
    ).all()

    top_managers = db.execute(
        select(
            FactTransaction.manager_norm.label("name"),
            func.coalesce(revenue_expr, 0.0).label("revenue"),
        )
        .where(*conditions)
        .group_by(FactTransaction.manager_norm)
        .order_by(func.coalesce(revenue_expr, 0.0).desc())
        .limit(5)
    ).all()

    revenue_by_category_rows = db.execute(
        select(
            FactTransaction.product_category.label("name"),
            func.coalesce(revenue_expr, 0.0).label("revenue"),
        )
        .where(*conditions)
        .group_by(FactTransaction.product_category)
        .order_by(FactTransaction.product_category.asc())
    ).all()

    revenue_by_type_rows = db.execute(
        select(
            func.coalesce(FactTransaction.product_type, "Без типа").label("name"),
            func.coalesce(revenue_expr, 0.0).label("revenue"),
        )
        .where(*conditions)
        .group_by(func.coalesce(FactTransaction.product_type, "Без типа"))
        .order_by(func.coalesce(FactTransaction.product_type, "Без типа").asc())
    ).all()

    breakdowns = {
        "top_products_by_revenue": [
            {"name": row.name, "revenue": float(row.revenue or 0.0)}
            for row in top_products
        ],
        "top_managers_by_revenue": [
            {"name": row.name, "revenue": float(row.revenue or 0.0)}
            for row in top_managers
        ],
        "revenue_by_category": [
            {"name": row.name, "revenue": float(row.revenue or 0.0)}
            for row in revenue_by_category_rows
        ],
        "revenue_by_type": [
            {"name": row.name, "revenue": float(row.revenue or 0.0)}
            for row in revenue_by_type_rows
        ],
    }

    return {
        "series": series,
        "breakdowns": breakdowns,
    }
