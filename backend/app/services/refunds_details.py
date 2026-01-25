from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import Any

from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from app.models.project_settings import ProjectSettings
from app.services.dashboard import _apply_filters, _normalize_filters, _transaction_source
from app.services.metrics import get_field_presence


def _refunds_sum(table: Any) -> Any:
    return func.coalesce(
        func.sum(
            case((table.c.operation_type == "refund", table.c.amount), else_=0.0)
        ),
        0.0,
    )


def _gross_sales_sum(table: Any) -> Any:
    return func.coalesce(
        func.sum(case((table.c.operation_type == "sale", table.c.amount), else_=0.0)),
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


def get_refunds_details(
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

    refunds_current = float(
        db.scalar(select(_refunds_sum(table)).where(*current_conditions)) or 0.0
    )
    refunds_previous = float(
        db.scalar(select(_refunds_sum(table)).where(*previous_conditions)) or 0.0
    )
    gross_sales_current = float(
        db.scalar(select(_gross_sales_sum(table)).where(*current_conditions)) or 0.0
    )
    gross_sales_previous = float(
        db.scalar(select(_gross_sales_sum(table)).where(*previous_conditions)) or 0.0
    )
    delta_abs = refunds_current - refunds_previous
    delta_pct = delta_abs / refunds_previous if refunds_previous else None

    refund_rate_current = (
        (refunds_current / gross_sales_current) * 100 if gross_sales_current else None
    )
    refund_rate_previous = (
        (refunds_previous / gross_sales_previous) * 100 if gross_sales_previous else None
    )
    refund_rate_delta_pp = (
        refund_rate_current - refund_rate_previous
        if refund_rate_current is not None and refund_rate_previous is not None
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
            _refunds_sum(table).label("refunds"),
            _gross_sales_sum(table).label("gross_sales"),
        )
        .where(*current_conditions)
        .group_by(bucket_expr)
        .order_by(bucket_expr)
    ).all()
    series_refunds: list[dict[str, Any]] = []
    series_refund_rate: list[dict[str, Any]] = []
    for row in series_rows:
        bucket_label = _bucket_label(row.bucket, series_granularity)
        refunds_value = float(row.refunds or 0.0)
        gross_value = float(row.gross_sales or 0.0)
        series_refunds.append({"bucket": bucket_label, "value": refunds_value})
        series_refund_rate.append(
            {
                "bucket": bucket_label,
                "value": (refunds_value / gross_value * 100) if gross_value else 0.0,
            }
        )

    top_buckets_refunds = [
        item["bucket"]
        for item in sorted(
            series_refunds, key=lambda item: item["value"], reverse=True
        )[:5]
    ]

    product_rows = db.execute(
        select(
            func.coalesce(table.c.product_name_norm, "Без значения").label("name"),
            _gross_sales_sum(table).label("gross_sales"),
            _refunds_sum(table).label("refunds"),
        )
        .where(*current_conditions)
        .group_by("name")
        .order_by(_refunds_sum(table).desc())
        .limit(50)
    ).all()
    sales_vs_refunds_by_product = []
    for row in product_rows:
        gross_value = float(row.gross_sales or 0.0)
        refunds_value = float(row.refunds or 0.0)
        sales_vs_refunds_by_product.append(
            {
                "product_name": row.name,
                "gross_sales": gross_value,
                "refunds": refunds_value,
                "refund_rate": (refunds_value / gross_value * 100) if gross_value else None,
            }
        )

    top_products = sales_vs_refunds_by_product[:3]
    top1 = top_products[0] if top_products else None
    top1_share = (
        (top1["refunds"] / refunds_current) if top1 and refunds_current else 0.0
    )
    top3_share = (
        sum(item["refunds"] for item in top_products) / refunds_current
        if refunds_current
        else 0.0
    )

    payment_methods: list[dict[str, Any]] = []
    presence = get_field_presence(db, project_id)
    if presence.get("payment_method"):
        payment_rows = db.execute(
            select(
                func.coalesce(table.c.payment_method, "Без значения").label("name"),
                _refunds_sum(table).label("refunds"),
                _gross_sales_sum(table).label("gross_sales"),
            )
            .where(*current_conditions)
            .group_by("name")
            .order_by(_refunds_sum(table).desc())
        ).all()
        for row in payment_rows:
            refunds_value = float(row.refunds or 0.0)
            gross_value = float(row.gross_sales or 0.0)
            payment_methods.append(
                {
                    "payment_method": row.name,
                    "refunds": refunds_value,
                    "share": (refunds_value / refunds_current)
                    if refunds_current
                    else 0.0,
                    "gross_sales": gross_value,
                    "refund_rate": (refunds_value / gross_value * 100)
                    if gross_value
                    else None,
                }
            )

    return {
        "periods": {
            "current": {"from": from_date, "to": to_date},
            "previous": {"from": prev_from, "to": prev_to},
        },
        "totals": {
            "refunds_current": refunds_current,
            "refunds_previous": refunds_previous,
            "delta_abs": delta_abs,
            "delta_pct": delta_pct,
            "gross_sales_current": gross_sales_current,
            "refund_rate_current": refund_rate_current,
            "refund_rate_previous": refund_rate_previous,
            "refund_rate_delta_pp": refund_rate_delta_pp,
        },
        "series": {
            "granularity": series_granularity,
            "series_refunds": series_refunds,
            "series_refund_rate": series_refund_rate,
            "top_buckets_refunds": top_buckets_refunds,
        },
        "sales_vs_refunds_by_product": sales_vs_refunds_by_product,
        "concentration": {
            "top1": {
                "product_name": top1["product_name"] if top1 else None,
                "refunds": top1["refunds"] if top1 else 0.0,
                "share": top1_share,
            }
            if top1
            else None,
            "top3_share": top3_share,
        },
        "refunds_by_payment_method": payment_methods,
        "signals": [],
    }
