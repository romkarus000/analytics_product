from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import Any

from sqlalchemy import case, func, literal, select, union_all
from sqlalchemy.orm import Session

from app.models.project_settings import ProjectSettings
from app.services.dashboard import _apply_filters, _normalize_filters, _transaction_source
from app.services.metrics import get_field_presence


def _gross_sales_sum(table: Any) -> Any:
    return func.coalesce(
        func.sum(case((table.c.operation_type == "sale", table.c.amount), else_=0.0)),
        0.0,
    )


def _refunds_sum(table: Any) -> Any:
    return func.coalesce(
        func.sum(
            case((table.c.operation_type == "refund", table.c.amount), else_=0.0)
        ),
        0.0,
    )


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


def _bucket_label(bucket_value: Any, granularity: str) -> str:
    if granularity == "week":
        bucket_date = (
            bucket_value.date() if isinstance(bucket_value, datetime) else bucket_value
        )
        iso = bucket_date.isocalendar()
        return f"{iso.year}-W{iso.week:02d}"
    return (
        bucket_value.isoformat()
        if isinstance(bucket_value, date)
        else str(bucket_value)
    )


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
            _net_revenue_sum(table).label("value"),
            literal("current").label("period"),
        )
        .where(*current_conditions)
        .group_by(name_expr)
    )
    previous_query = (
        select(
            name_expr.label("name"),
            _net_revenue_sum(table).label("value"),
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
    rows: list[dict[str, Any]], total_current: float, limit: int = 50
) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    for row in rows:
        current = row["current"]
        previous = row["previous"]
        delta_abs = current - previous
        share_current = current / total_current if total_current else 0.0
        items.append(
            {
                "name": row["name"],
                "current_net_revenue": current,
                "delta": delta_abs,
                "share": share_current,
            }
        )
    items.sort(key=lambda item: item["delta"], reverse=True)
    return items[:limit]


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


def get_net_revenue_details(
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

    gross_sales_current = float(
        db.scalar(select(_gross_sales_sum(table)).where(*current_conditions)) or 0.0
    )
    gross_sales_previous = float(
        db.scalar(select(_gross_sales_sum(table)).where(*previous_conditions)) or 0.0
    )
    refunds_current = float(
        db.scalar(select(_refunds_sum(table)).where(*current_conditions)) or 0.0
    )
    refunds_previous = float(
        db.scalar(select(_refunds_sum(table)).where(*previous_conditions)) or 0.0
    )
    net_revenue_current = float(
        db.scalar(select(_net_revenue_sum(table)).where(*current_conditions)) or 0.0
    )
    net_revenue_previous = float(
        db.scalar(select(_net_revenue_sum(table)).where(*previous_conditions)) or 0.0
    )

    delta_abs = net_revenue_current - net_revenue_previous
    delta_pct = delta_abs / net_revenue_previous if net_revenue_previous else None

    refunds_share_current = (
        (refunds_current / gross_sales_current) * 100 if gross_sales_current else None
    )
    refunds_share_previous = (
        (refunds_previous / gross_sales_previous) * 100 if gross_sales_previous else None
    )
    refunds_share_delta_pp = (
        refunds_share_current - refunds_share_previous
        if refunds_share_current is not None and refunds_share_previous is not None
        else None
    )

    series_granularity = "day" if (to_date - from_date).days + 1 <= 31 else "week"
    bucket_expr = (
        table.c.date.label("bucket")
        if series_granularity == "day"
        else func.date_trunc("week", table.c.date).label("bucket")
    )
    series_rows = db.execute(
        select(
            bucket_expr,
            _gross_sales_sum(table).label("gross_sales"),
            _refunds_sum(table).label("refunds"),
            _net_revenue_sum(table).label("net_revenue"),
        )
        .where(*current_conditions)
        .group_by(bucket_expr)
        .order_by(bucket_expr)
    ).all()
    points: list[dict[str, Any]] = []
    for row in series_rows:
        bucket_label = _bucket_label(row.bucket, series_granularity)
        points.append(
            {
                "bucket": bucket_label,
                "gross_sales": float(row.gross_sales or 0.0),
                "refunds": float(row.refunds or 0.0),
                "net_revenue": float(row.net_revenue or 0.0),
            }
        )

    top_buckets_net_revenue = [
        item["bucket"]
        for item in sorted(points, key=lambda item: item["net_revenue"], reverse=True)[:5]
    ]

    product_rows = _driver_rows(
        db, table, table.c.product_name_norm, current_conditions, previous_conditions
    )
    group_rows = _driver_rows(
        db, table, _driver_name_from_group(table), current_conditions, previous_conditions
    )
    presence = get_field_presence(db, project_id)
    manager_rows: list[dict[str, Any]] = []
    if presence.get("manager"):
        manager_rows = _driver_rows(
            db, table, table.c.manager_norm, current_conditions, previous_conditions
        )

    drivers = {
        "products_top10": _build_driver_items(product_rows, net_revenue_current),
        "groups_top10": _build_driver_items(group_rows, net_revenue_current),
        "managers_top10": _build_driver_items(manager_rows, net_revenue_current)
        if manager_rows
        else [],
    }

    product_rows_net = db.execute(
        select(
            func.coalesce(table.c.product_name_norm, "Без значения").label("name"),
            _gross_sales_sum(table).label("gross_sales"),
            _refunds_sum(table).label("refunds"),
        )
        .where(*current_conditions)
        .group_by("name")
        .order_by((_gross_sales_sum(table) - _refunds_sum(table)).desc())
        .limit(10)
    ).all()
    net_vs_gross_refunds_top10 = []
    for row in product_rows_net:
        gross_value = float(row.gross_sales or 0.0)
        refunds_value = float(row.refunds or 0.0)
        net_value = gross_value - refunds_value
        net_vs_gross_refunds_top10.append(
            {
                "product_name": row.name,
                "gross_sales": gross_value,
                "refunds": refunds_value,
                "net_revenue": net_value,
                "refund_rate_percent": (refunds_value / gross_value * 100)
                if gross_value
                else None,
            }
        )

    payment_methods: list[dict[str, Any]] = []
    if presence.get("payment_method"):
        payment_rows = db.execute(
            select(
                func.coalesce(table.c.payment_method, "Без значения").label("name"),
                _gross_sales_sum(table).label("gross_sales"),
                _refunds_sum(table).label("refunds"),
            )
            .where(*current_conditions)
            .group_by("name")
            .order_by((_gross_sales_sum(table) - _refunds_sum(table)).desc())
        ).all()
        for row in payment_rows:
            gross_value = float(row.gross_sales or 0.0)
            refunds_value = float(row.refunds or 0.0)
            net_value = gross_value - refunds_value
            payment_methods.append(
                {
                    "payment_method": row.name,
                    "gross_sales": gross_value,
                    "refunds": refunds_value,
                    "net_revenue": net_value,
                    "refund_rate_percent": (refunds_value / gross_value * 100)
                    if gross_value
                    else None,
                }
            )

    signals: list[dict[str, Any]] = []
    if top_buckets_net_revenue:
        peak_bucket = top_buckets_net_revenue[0]
        peak_point = next(
            (item for item in points if item["bucket"] == peak_bucket), None
        )
        if peak_point:
            signals.append(
                {
                    "type": "peak_net_revenue",
                    "title": "Peak Net Revenue",
                    "message": (
                        f"Пик Net Revenue: {peak_bucket} — "
                        f"{_format_currency(peak_point['net_revenue'])} ₽"
                    ),
                    "severity": "info",
                }
            )

    gross_sales_delta_abs = gross_sales_current - gross_sales_previous
    if gross_sales_delta_abs > 0 and delta_abs <= 0:
        signals.append(
            {
                "type": "refunds_ate_growth",
                "title": "Refunds ate growth",
                "message": "Рост продаж не дал роста net revenue — возвраты съели результат.",
                "severity": "warn",
            }
        )

    if refunds_share_delta_pp is not None and refunds_share_delta_pp >= 2:
        signals.append(
            {
                "type": "refund_pressure",
                "title": "Refund pressure",
                "message": (
                    "Доля возвратов выросла на "
                    f"{round(refunds_share_delta_pp, 1)} п.п."
                ),
                "severity": "warn",
            }
        )

    if len(points) >= 3:
        values = [item["net_revenue"] for item in points]
        mean = sum(values) / len(values) if values else 0.0
        max_value = max(values) if values else 0.0
        max_item = next((item for item in points if item["net_revenue"] == max_value), None)
        if mean > 0 and max_item and max_value > mean * 3:
            signals.append(
                {
                    "type": "anomaly_spike",
                    "title": "Anomaly spike",
                    "message": (
                        f"Аномальный всплеск net revenue: {max_item['bucket']}"
                    ),
                    "severity": "warn",
                }
            )

    if len(signals) < 2 and refunds_share_current is not None:
        signals.append(
            {
                "type": "refund_impact",
                "title": "Refund impact",
                "message": (
                    f"Доля возвратов: {round(refunds_share_current)}% от Gross Sales."
                ),
                "severity": "info",
            }
        )
    if len(signals) < 2:
        signals.append(
            {
                "type": "net_revenue_change",
                "title": "Net Revenue change",
                "message": f"Net Revenue изменился на {_format_currency(delta_abs)} ₽.",
                "severity": "info",
            }
        )

    return {
        "periods": {
            "current": {"from": from_date, "to": to_date},
            "previous": {"from": prev_from, "to": prev_to},
        },
        "totals": {
            "gross_sales_current": gross_sales_current,
            "gross_sales_previous": gross_sales_previous,
            "refunds_current": refunds_current,
            "refunds_previous": refunds_previous,
            "net_revenue_current": net_revenue_current,
            "net_revenue_previous": net_revenue_previous,
            "delta_abs": delta_abs,
            "delta_pct": delta_pct,
            "refunds_share_of_gross_current": refunds_share_current,
            "refunds_share_of_gross_previous": refunds_share_previous,
            "refunds_share_delta_pp": refunds_share_delta_pp,
        },
        "series": {
            "granularity": series_granularity,
            "points": points,
            "top_buckets_net_revenue": top_buckets_net_revenue,
        },
        "drivers": drivers,
        "net_vs_gross_refunds_top10": net_vs_gross_refunds_top10,
        "payment_methods": payment_methods,
        "signals": signals[:4],
    }
