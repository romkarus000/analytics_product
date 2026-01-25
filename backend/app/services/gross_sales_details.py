from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import Any

from sqlalchemy import case, func, literal, select, union_all
from sqlalchemy.orm import Session

from app.models.project_settings import ProjectSettings
from app.services.dashboard import _apply_filters, _normalize_filters, _transaction_source
from app.services.metrics import evaluate_metric_availability, get_field_presence


def _gross_sales_sum(table: Any) -> Any:
    return func.coalesce(
        func.sum(
            case((table.c.operation_type == "sale", table.c.amount), else_=0.0)
        ),
        0.0,
    )


def _current_conditions(
    table: Any, from_date: date, to_date: date, filters: dict[str, Any]
) -> list[Any]:
    conditions: list[Any] = [table.c.date >= from_date, table.c.date <= to_date]
    _apply_filters(conditions, table, filters)
    return conditions


def _previous_period(from_date: date, to_date: date) -> tuple[date, date]:
    days = (to_date - from_date).days + 1
    prev_to = from_date - timedelta(days=1)
    prev_from = from_date - timedelta(days=days)
    return prev_from, prev_to


def _driver_rows(
    db: Session,
    table: Any,
    dimension: Any,
    current_conditions: list[Any],
    previous_conditions: list[Any],
) -> list[dict[str, Any]]:
    name_expr = func.coalesce(dimension, "Без значения")
    current_query = (
        select(
            name_expr.label("name"),
            _gross_sales_sum(table).label("value"),
            literal("current").label("period"),
        )
        .where(*current_conditions)
        .group_by(name_expr)
    )
    previous_query = (
        select(
            name_expr.label("name"),
            _gross_sales_sum(table).label("value"),
            literal("previous").label("period"),
        )
        .where(*previous_conditions)
        .group_by(name_expr)
    )
    unioned = union_all(current_query, previous_query).subquery()
    rows = db.execute(
        select(
            unioned.c.name,
            func.sum(
                case((unioned.c.period == "current", unioned.c.value), else_=0.0)
            ).label("current"),
            func.sum(
                case((unioned.c.period == "previous", unioned.c.value), else_=0.0)
            ).label("previous"),
        ).group_by(unioned.c.name)
    ).all()
    return [
        {
            "name": row.name,
            "current": float(row.current or 0.0),
            "previous": float(row.previous or 0.0),
        }
        for row in rows
    ]


def _build_driver_items(
    rows: list[dict[str, Any]], total_current: float
) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    for row in rows:
        current = row["current"]
        previous = row["previous"]
        delta_abs = current - previous
        delta_pct = delta_abs / previous if previous else None
        share_current = current / total_current if total_current else 0.0
        items.append(
            {
                "name": row["name"],
                "current": current,
                "previous": previous,
                "delta_abs": delta_abs,
                "delta_pct": delta_pct,
                "share_current": share_current,
            }
        )
    return items


def _split_driver_items(items: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    up_items = [item for item in items if item["delta_abs"] > 0]
    down_items = [item for item in items if item["delta_abs"] < 0]
    up_items.sort(key=lambda item: item["delta_abs"], reverse=True)
    down_items.sort(key=lambda item: item["delta_abs"])
    return {"up": up_items[:10], "down": down_items[:10]}


def _driver_name_from_group(table: Any) -> Any:
    return func.coalesce(
        table.c.group_5,
        table.c.group_4,
        table.c.group_3,
        table.c.group_2,
        table.c.group_1,
    )


def _format_currency(value: float) -> str:
    return f"{value:,.0f}".replace(",", " ")


def get_gross_sales_details(
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

    current_conditions = _current_conditions(table, from_date, to_date, filters)
    prev_from, prev_to = _previous_period(from_date, to_date)
    previous_conditions = _current_conditions(table, prev_from, prev_to, filters)

    current_value = float(db.scalar(select(_gross_sales_sum(table)).where(*current_conditions)) or 0.0)
    previous_value = float(
        db.scalar(select(_gross_sales_sum(table)).where(*previous_conditions)) or 0.0
    )
    delta_abs = current_value - previous_value
    delta_pct = delta_abs / previous_value if previous_value else None

    series_granularity = "day" if (to_date - from_date).days + 1 <= 31 else "week"
    bucket_expr = (
        table.c.date.label("bucket")
        if series_granularity == "day"
        else func.date_trunc("week", table.c.date).label("bucket")
    )
    series_rows = db.execute(
        select(
            bucket_expr,
            _gross_sales_sum(table).label("value"),
        )
        .where(*current_conditions)
        .group_by(bucket_expr)
        .order_by(bucket_expr)
    ).all()
    series: list[dict[str, Any]] = []
    for row in series_rows:
        bucket_value = row.bucket
        if series_granularity == "week":
            bucket_date = (
                bucket_value.date()
                if isinstance(bucket_value, datetime)
                else bucket_value
            )
            iso = bucket_date.isocalendar()
            bucket_label = f"{iso.year}-W{iso.week:02d}"
        else:
            bucket_label = (
                bucket_value.isoformat()
                if isinstance(bucket_value, date)
                else str(bucket_value)
            )
        series.append({"bucket": bucket_label, "value": float(row.value or 0.0)})

    top_buckets = [
        item["bucket"]
        for item in sorted(series, key=lambda item: item["value"], reverse=True)[:5]
    ]

    product_rows = _driver_rows(
        db, table, table.c.product_name_norm, current_conditions, previous_conditions
    )
    group_rows = _driver_rows(
        db, table, _driver_name_from_group(table), current_conditions, previous_conditions
    )

    presence = get_field_presence(db, project_id)
    manager_available, manager_missing = evaluate_metric_availability(["manager"], presence)
    manager_rows: list[dict[str, Any]] = []
    if manager_available == "available":
        manager_rows = _driver_rows(
            db, table, table.c.manager_norm, current_conditions, previous_conditions
        )

    drivers = {
        "products": _split_driver_items(_build_driver_items(product_rows, current_value)),
        "groups": _split_driver_items(_build_driver_items(group_rows, current_value)),
        "managers": _split_driver_items(_build_driver_items(manager_rows, current_value))
        if manager_rows
        else {"up": [], "down": []},
    }

    product_current_rows = db.execute(
        select(
            func.coalesce(table.c.product_name_norm, "Без значения").label("name"),
            _gross_sales_sum(table).label("value"),
        )
        .where(*current_conditions)
        .group_by("name")
        .order_by(_gross_sales_sum(table).desc())
    ).all()
    top_products = [
        {"name": row.name, "value": float(row.value or 0.0)}
        for row in product_current_rows
    ]
    top1 = top_products[0] if top_products else None
    top3 = top_products[:3]
    top1_share = (top1["value"] / current_value) if top1 and current_value else 0.0
    top3_share = (
        sum(item["value"] for item in top3) / current_value if current_value else 0.0
    )
    top3_items = [
        {
            "name": item["name"],
            "value": item["value"],
            "share": (item["value"] / current_value) if current_value else 0.0,
        }
        for item in top3
    ]

    insights: list[dict[str, Any]] = []
    all_driver_items = (
        drivers["products"]["up"]
        + drivers["products"]["down"]
        + drivers["groups"]["up"]
        + drivers["groups"]["down"]
        + drivers["managers"]["up"]
        + drivers["managers"]["down"]
    )
    if all_driver_items:
        top_driver = max(all_driver_items, key=lambda item: abs(item["delta_abs"]))
        insights.append(
            {
                "title": "Драйвер изменения",
                "text": (
                    "Основной вклад в изменение дал "
                    f"{top_driver['name']}: {_format_currency(top_driver['delta_abs'])} ₽"
                ),
                "severity": "info",
            }
        )
    if top1_share > 0.6 and top1:
        insights.append(
            {
                "title": "Концентрация",
                "text": (
                    "Высокая концентрация: "
                    f"{top1['name']} = {round(top1_share * 100)}% выручки"
                ),
                "severity": "warn",
            }
        )

    availability_status, missing_fields = evaluate_metric_availability(
        ["paid_at", "amount", "operation_type"], presence
    )
    if availability_status == "available" and manager_available != "available":
        availability_status = "partial"
        missing_fields = sorted(set(missing_fields + manager_missing))

    return {
        "metric": "gross_sales",
        "current": {"value": current_value, "from": from_date, "to": to_date},
        "previous": {"value": previous_value, "from": prev_from, "to": prev_to},
        "change": {"delta_abs": delta_abs, "delta_pct": delta_pct},
        "series": series,
        "series_granularity": series_granularity,
        "top_buckets": top_buckets,
        "drivers": drivers,
        "concentration": {
            "top1_share": top1_share,
            "top3_share": top3_share,
            "top1_name": top1["name"] if top1 else None,
            "top1_value": top1["value"] if top1 else 0.0,
            "top3_names": [item["name"] for item in top3],
            "top3_items": top3_items,
        },
        "insights": insights,
        "availability": {
            "status": availability_status,
            "missing_fields": missing_fields,
        },
    }
