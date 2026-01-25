from __future__ import annotations

from datetime import date
from typing import Any

from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from app.models.project_settings import ProjectSettings
from app.services.dashboard import (
    _apply_filters,
    _normalize_filters,
    _order_key,
    _transaction_source,
)
from app.services.metrics import get_field_presence


def _net_revenue_sum(table: Any) -> Any:
    return func.coalesce(
        func.sum(
            case(
                (table.c.operation_type == "sale", table.c.amount),
                (table.c.operation_type == "refund", -table.c.amount),
                else_=0.0,
            )
        ),
        0.0,
    )


def _orders_count(table: Any) -> Any:
    return func.count(
        func.distinct(
            case(
                (table.c.operation_type == "sale", _order_key(table)),
                else_=None,
            )
        )
    )


def _driver_name_from_group(table: Any) -> Any:
    return func.coalesce(
        table.c.group_5,
        table.c.group_4,
        table.c.group_3,
        table.c.group_2,
        table.c.group_1,
    )


def _driver_items(
    db: Session,
    table: Any,
    dimension: Any,
    period_conditions: list[Any],
    day_conditions: list[Any],
    days_count: int,
    day_revenue: float,
    limit: int = 10,
) -> list[dict[str, Any]]:
    name_expr = func.coalesce(dimension, "Без значения")
    period_rows = db.execute(
        select(name_expr.label("name"), _net_revenue_sum(table).label("revenue"))
        .where(*period_conditions)
        .group_by(name_expr)
    ).all()
    day_rows = db.execute(
        select(name_expr.label("name"), _net_revenue_sum(table).label("revenue"))
        .where(*day_conditions)
        .group_by(name_expr)
    ).all()
    totals = {row.name: float(row.revenue or 0.0) for row in period_rows}
    items: list[dict[str, Any]] = []
    for row in day_rows:
        revenue = float(row.revenue or 0.0)
        avg_slice_day = totals.get(row.name, 0.0) / days_count if days_count else 0.0
        delta_abs = revenue - avg_slice_day
        delta_pct = delta_abs / avg_slice_day if avg_slice_day else None
        share = revenue / day_revenue if day_revenue else 0.0
        items.append(
            {
                "name": row.name,
                "revenue": revenue,
                "share": share,
                "delta_abs": delta_abs,
                "delta_pct": delta_pct,
            }
        )
    items.sort(key=lambda item: item["revenue"], reverse=True)
    return items[:limit]


def _day_details(
    db: Session,
    table: Any,
    day: dict[str, Any],
    period_conditions: list[Any],
    days_count: int,
    include_managers: bool,
) -> dict[str, Any]:
    day_conditions = list(period_conditions)
    day_conditions.append(table.c.date == day["date"])
    day_revenue = float(day["revenue"] or 0.0)
    drivers = {
        "products": _driver_items(
            db,
            table,
            table.c.product_name_norm,
            period_conditions,
            day_conditions,
            days_count,
            day_revenue,
        ),
        "groups": _driver_items(
            db,
            table,
            _driver_name_from_group(table),
            period_conditions,
            day_conditions,
            days_count,
            day_revenue,
        ),
        "managers": [],
    }
    if include_managers:
        drivers["managers"] = _driver_items(
            db,
            table,
            table.c.manager_norm,
            period_conditions,
            day_conditions,
            days_count,
            day_revenue,
        )
    return {
        "date": day["date"],
        "revenue": day_revenue,
        "orders": int(day["orders"] or 0),
        "drivers": drivers,
    }


def get_best_worst_days(
    db: Session,
    project_id: int,
    from_date: date,
    to_date: date,
    filters: dict[str, Any] | None = None,
) -> dict[str, Any]:
    filters = _normalize_filters(filters)
    settings = db.get(ProjectSettings, project_id)
    dedup_policy = settings.dedup_policy if settings else "keep_all_rows"
    table = _transaction_source(project_id, dedup_policy)

    period_conditions: list[Any] = [table.c.date >= from_date, table.c.date <= to_date]
    _apply_filters(period_conditions, table, filters)

    series_rows = db.execute(
        select(
            table.c.date.label("date"),
            _net_revenue_sum(table).label("revenue"),
            func.coalesce(_orders_count(table), 0).label("orders"),
        )
        .where(*period_conditions)
        .group_by(table.c.date)
        .order_by(table.c.date)
    ).all()

    series = [
        {
            "date": row.date,
            "revenue": float(row.revenue or 0.0),
            "orders": int(row.orders or 0),
        }
        for row in series_rows
    ]

    total_revenue = float(
        db.scalar(select(_net_revenue_sum(table)).where(*period_conditions)) or 0.0
    )
    days_count = (to_date - from_date).days + 1
    avg_day_revenue = total_revenue / days_count if days_count else 0.0

    best_day = max(series, key=lambda item: item["revenue"], default=None)
    worst_day = min(series, key=lambda item: item["revenue"], default=None)

    presence = get_field_presence(db, project_id)
    include_managers = presence.get("manager", False)
    missing_fields = []
    if not include_managers:
        missing_fields.append("manager")

    best_payload = (
        _day_details(db, table, best_day, period_conditions, days_count, include_managers)
        if best_day
        else None
    )
    worst_payload = (
        _day_details(db, table, worst_day, period_conditions, days_count, include_managers)
        if worst_day
        else None
    )

    return {
        "period": {
            "from": from_date,
            "to": to_date,
            "total_revenue": total_revenue,
            "days_count": days_count,
            "avg_day_revenue": avg_day_revenue,
        },
        "series": series,
        "best": best_payload,
        "worst": worst_payload,
        "availability": {"missing_fields": missing_fields},
    }
