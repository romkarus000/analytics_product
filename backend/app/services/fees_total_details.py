from __future__ import annotations

from datetime import date, datetime, timedelta
from statistics import pstdev
from typing import Any

from sqlalchemy import case, func, literal, select, union_all
from sqlalchemy.orm import Session

from app.models.project_settings import ProjectSettings
from app.services.dashboard import (
    _apply_filters,
    _normalize_filters,
    _order_key,
    _transaction_source,
)
from app.services.metrics import get_field_presence


def _fee_total_column(table: Any) -> Any:
    return (
        func.coalesce(table.c.fee_1, 0.0)
        + func.coalesce(table.c.fee_2, 0.0)
        + func.coalesce(table.c.fee_3, 0.0)
    )


def _fees_sum(table: Any) -> Any:
    return func.sum(_fee_total_column(table))


def _gross_sales_sum(table: Any) -> Any:
    return func.sum(case((table.c.operation_type == "sale", table.c.amount), else_=0.0))


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
            func.coalesce(_fees_sum(table), 0.0).label("value"),
            literal("current").label("period"),
        )
        .where(*current_conditions)
        .group_by(name_expr)
    )
    previous_query = (
        select(
            name_expr.label("name"),
            func.coalesce(_fees_sum(table), 0.0).label("value"),
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
        share_current = current / total_current if total_current else 0.0
        items.append(
            {
                "name": row["name"],
                "current_fees": current,
                "delta_fees": delta_abs,
                "share_of_fees": share_current,
            }
        )
    return items


def _top_driver_items(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    items.sort(key=lambda item: item["current_fees"], reverse=True)
    return items[:10]


def _driver_name_from_group(table: Any) -> Any:
    return func.coalesce(
        table.c.group_5,
        table.c.group_4,
        table.c.group_3,
        table.c.group_2,
        table.c.group_1,
    )


def _format_bucket(bucket_value: Any, granularity: str) -> str:
    if granularity == "week":
        bucket_date = bucket_value.date() if isinstance(bucket_value, datetime) else bucket_value
        iso = bucket_date.isocalendar()
        return f"{iso.year}-W{iso.week:02d}"
    if isinstance(bucket_value, date):
        return bucket_value.isoformat()
    return str(bucket_value)


def _detect_anomalies(series: list[dict[str, Any]]) -> list[str]:
    values = [item["fees_total"] for item in series if item["fees_total"] != 0]
    if len(values) < 4:
        return []
    mean = sum(values) / len(values)
    deviation = pstdev(values)
    if deviation == 0:
        return []
    threshold = deviation * 2
    return [
        item["bucket"]
        for item in series
        if abs(item["fees_total"] - mean) > threshold
    ]


def _fee_component_breakdown(
    db: Session,
    table: Any,
    current_conditions: list[Any],
    previous_conditions: list[Any],
    fees_total_current: float,
    presence: dict[str, bool],
) -> list[dict[str, Any]]:
    current_totals = db.execute(
        select(
            func.coalesce(func.sum(table.c.fee_1), 0.0).label("fee_1"),
            func.coalesce(func.sum(table.c.fee_2), 0.0).label("fee_2"),
            func.coalesce(func.sum(table.c.fee_3), 0.0).label("fee_3"),
        ).where(*current_conditions)
    ).one()
    previous_totals = db.execute(
        select(
            func.coalesce(func.sum(table.c.fee_1), 0.0).label("fee_1"),
            func.coalesce(func.sum(table.c.fee_2), 0.0).label("fee_2"),
            func.coalesce(func.sum(table.c.fee_3), 0.0).label("fee_3"),
        ).where(*previous_conditions)
    ).one()
    components = [
        ("fee_1", "Commission 1"),
        ("fee_2", "Commission 2"),
        ("fee_3", "Commission 3"),
    ]
    breakdowns: list[dict[str, Any]] = []
    for key, title in components:
        if not presence.get(key):
            continue
        current = float(getattr(current_totals, key) or 0.0)
        previous = float(getattr(previous_totals, key) or 0.0)
        delta_abs = current - previous
        delta_pct = delta_abs / previous if previous else None
        share_current = current / fees_total_current if fees_total_current else 0.0
        breakdowns.append(
            {
                "key": key,
                "title": title,
                "current": current,
                "previous": previous,
                "delta_abs": delta_abs,
                "delta_pct": delta_pct,
                "share_current": share_current,
            }
        )
    return breakdowns


def get_fees_total_details(
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

    fees_total_current = float(
        db.scalar(select(func.coalesce(_fees_sum(table), 0.0)).where(*current_conditions))
        or 0.0
    )
    fees_total_previous = float(
        db.scalar(select(func.coalesce(_fees_sum(table), 0.0)).where(*previous_conditions))
        or 0.0
    )
    delta_abs = fees_total_current - fees_total_previous
    delta_pct = delta_abs / fees_total_previous if fees_total_previous else None

    gross_sales_current = float(
        db.scalar(
            select(func.coalesce(_gross_sales_sum(table), 0.0)).where(*current_conditions)
        )
        or 0.0
    )
    gross_sales_previous = float(
        db.scalar(
            select(func.coalesce(_gross_sales_sum(table), 0.0)).where(*previous_conditions)
        )
        or 0.0
    )
    fee_share_current = (
        fees_total_current / gross_sales_current if gross_sales_current else None
    )
    fee_share_previous = (
        fees_total_previous / gross_sales_previous if gross_sales_previous else None
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
            func.coalesce(_fees_sum(table), 0.0).label("fees_total"),
            func.coalesce(_gross_sales_sum(table), 0.0).label("gross_sales"),
        )
        .where(*current_conditions)
        .group_by(bucket_expr)
        .order_by(bucket_expr)
    ).all()
    series: list[dict[str, Any]] = []
    for row in series_rows:
        fees_value = float(row.fees_total or 0.0)
        gross_value = float(row.gross_sales or 0.0)
        series.append(
            {
                "bucket": _format_bucket(row.bucket, series_granularity),
                "fees_total": fees_value,
                "fee_share": fees_value / gross_value if gross_value else 0.0,
            }
        )
    top_buckets = [
        item["bucket"]
        for item in sorted(series, key=lambda item: item["fees_total"], reverse=True)[:5]
    ]
    anomalies = _detect_anomalies(series)

    presence = get_field_presence(db, project_id)
    breakdowns = _fee_component_breakdown(
        db, table, current_conditions, previous_conditions, fees_total_current, presence
    )

    product_rows = _driver_rows(
        db, table, table.c.product_name_norm, current_conditions, previous_conditions
    )
    group_rows = _driver_rows(
        db, table, _driver_name_from_group(table), current_conditions, previous_conditions
    )
    manager_rows: list[dict[str, Any]] = []
    if presence.get("manager"):
        manager_rows = _driver_rows(
            db, table, table.c.manager_norm, current_conditions, previous_conditions
        )
    payment_rows: list[dict[str, Any]] = []
    if presence.get("payment_method"):
        payment_rows = _driver_rows(
            db, table, table.c.payment_method, current_conditions, previous_conditions
        )

    drivers = {
        "products": _top_driver_items(_build_driver_items(product_rows, fees_total_current)),
        "groups": _top_driver_items(_build_driver_items(group_rows, fees_total_current)),
        "managers": _top_driver_items(_build_driver_items(manager_rows, fees_total_current))
        if manager_rows
        else [],
        "payment_method": _top_driver_items(
            _build_driver_items(payment_rows, fees_total_current)
        )
        if payment_rows
        else [],
    }

    orders = float(
        db.scalar(
            select(
                func.coalesce(
                    func.count(
                        func.distinct(
                            case(
                                (
                                    table.c.operation_type == "sale",
                                    _order_key(table),
                                ),
                                else_=None,
                            )
                        )
                    ),
                    0,
                )
            ).where(*current_conditions)
        )
        or 0.0
    )
    fees_refunds = float(
        db.scalar(
            select(
                func.coalesce(
                    func.sum(
                        case(
                            (table.c.operation_type == "refund", _fee_total_column(table)),
                            else_=0.0,
                        )
                    ),
                    0.0,
                )
            ).where(*current_conditions)
        )
        or 0.0
    )
    refunds_count = float(
        db.scalar(
            select(
                func.count(
                    case((table.c.operation_type == "refund", 1), else_=None)
                )
            ).where(*current_conditions)
        )
        or 0.0
    )
    fee_per_order = fees_total_current / orders if orders else None
    fee_per_revenue = (
        fees_total_current / gross_sales_current if gross_sales_current else None
    )
    fees_on_refunds = fees_refunds if refunds_count > 0 else None

    insights: list[str] = []
    if fee_share_current is not None and fee_share_previous is not None:
        if fee_share_current > fee_share_previous:
            insights.append(
                f"❗ Комиссии растут быстрее выручки: доля комиссии выросла до {fee_share_current:.2%}."
            )
    if payment_rows and fee_share_current is not None and fees_total_current > 0:
        payment_name_expr = func.coalesce(table.c.payment_method, "Без значения")
        payment_current = db.execute(
            select(
                payment_name_expr.label("name"),
                func.coalesce(_fees_sum(table), 0.0).label("fees_total"),
                func.coalesce(_gross_sales_sum(table), 0.0).label("gross_sales"),
            )
            .where(*current_conditions)
            .group_by(payment_name_expr)
        ).all()
        payment_previous = db.execute(
            select(
                payment_name_expr.label("name"),
                func.coalesce(_fees_sum(table), 0.0).label("fees_total"),
            )
            .where(*previous_conditions)
            .group_by(payment_name_expr)
        ).all()
        prev_map = {row.name: float(row.fees_total or 0.0) for row in payment_previous}
        best_shift = None
        for row in payment_current:
            current_fees = float(row.fees_total or 0.0)
            previous_fees = prev_map.get(row.name, 0.0)
            share_current = current_fees / fees_total_current if fees_total_current else 0.0
            share_previous = (
                previous_fees / fees_total_previous if fees_total_previous else 0.0
            )
            share_delta = share_current - share_previous
            fee_share_method = (
                current_fees / float(row.gross_sales or 0.0)
                if row.gross_sales
                else 0.0
            )
            if share_delta > 0.05 and fee_share_method > fee_share_current:
                if not best_shift or share_delta > best_shift["share_delta"]:
                    best_shift = {
                        "name": row.name,
                        "share_delta": share_delta,
                        "fee_share_method": fee_share_method,
                    }
        if best_shift:
            insights.append(
                f"🔥 Смещение в пользу {best_shift['name']} увеличивает комиссию: доля метода выросла на {best_shift['share_delta']:.1%}."
            )

    if fees_on_refunds is not None and fees_total_current > 0:
        refund_share = fees_on_refunds / fees_total_current
        if refund_share >= 0.05:
            insights.append(
                f"❗ Комиссии на возвратах заметны: {refund_share:.1%} от всех комиссий."
            )

    summary = {
        "fees_total_current": fees_total_current,
        "fees_total_previous": fees_total_previous,
        "delta_abs": delta_abs,
        "delta_pct": delta_pct,
        "fee_share_current": fee_share_current,
        "gross_sales_current": gross_sales_current,
        "method": "Метод расчета: сумма Commission 1..3",
    }

    return {
        "summary": summary,
        "trend": {
            "granularity": series_granularity,
            "series": series,
            "top_buckets": top_buckets,
            "anomalies": anomalies,
        },
        "drivers": drivers,
        "breakdowns": breakdowns,
        "efficiency": {
            "fee_per_order": fee_per_order,
            "fee_per_revenue": fee_per_revenue,
            "fees_on_refunds": fees_on_refunds,
        },
        "insights": insights[:6],
    }
