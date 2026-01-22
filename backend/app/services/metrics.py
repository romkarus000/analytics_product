from __future__ import annotations

import json
from datetime import date
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.fact_marketing_spend import FactMarketingSpend
from app.models.fact_transaction import FactTransaction
from app.models.metric_definition import MetricDefinition

TRANSACTION_DIMS = [
    "product_id",
    "product_category",
    "product_type",
    "manager_id",
    "payment_method",
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_term",
    "utm_content",
]

SPEND_DIMS = [
    "channel_norm",
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_term",
    "utm_content",
]


DEFAULT_METRICS: list[dict[str, Any]] = [
    {
        "metric_key": "gross_sales",
        "title": "Gross Sales",
        "description": "Сумма продаж без учета возвратов.",
        "source_table": "fact_transactions",
        "aggregation": "sum",
        "dims_allowed": TRANSACTION_DIMS,
        "requirements": ["fact_transactions"],
    },
    {
        "metric_key": "refunds",
        "title": "Refunds",
        "description": "Сумма возвратов.",
        "source_table": "fact_transactions",
        "aggregation": "sum",
        "dims_allowed": TRANSACTION_DIMS,
        "requirements": ["fact_transactions"],
    },
    {
        "metric_key": "net_revenue",
        "title": "Net Revenue",
        "description": "Выручка за вычетом возвратов.",
        "source_table": "derived",
        "aggregation": "formula",
        "dims_allowed": TRANSACTION_DIMS,
        "requirements": ["fact_transactions"],
    },
    {
        "metric_key": "refund_rate",
        "title": "Refund Rate",
        "description": "Доля возвратов от выручки.",
        "source_table": "derived",
        "aggregation": "ratio",
        "dims_allowed": TRANSACTION_DIMS,
        "requirements": ["fact_transactions"],
    },
    {
        "metric_key": "orders",
        "title": "Orders",
        "description": "Количество заказов.",
        "source_table": "fact_transactions",
        "aggregation": "count_distinct",
        "dims_allowed": TRANSACTION_DIMS,
        "requirements": ["fact_transactions"],
    },
    {
        "metric_key": "buyers",
        "title": "Buyers",
        "description": "Количество уникальных покупателей.",
        "source_table": "fact_transactions",
        "aggregation": "count_distinct",
        "dims_allowed": TRANSACTION_DIMS,
        "requirements": ["fact_transactions"],
    },
    {
        "metric_key": "aov",
        "title": "Average Order Value",
        "description": "Средний чек.",
        "source_table": "derived",
        "aggregation": "ratio",
        "dims_allowed": TRANSACTION_DIMS,
        "requirements": ["fact_transactions"],
    },
    {
        "metric_key": "commissions",
        "title": "Commissions",
        "description": "Комиссии по заказам.",
        "source_table": "fact_transactions",
        "aggregation": "sum",
        "dims_allowed": TRANSACTION_DIMS,
        "requirements": ["fact_transactions"],
    },
    {
        "metric_key": "commission_share",
        "title": "Commission Share",
        "description": "Доля комиссий в выручке.",
        "source_table": "derived",
        "aggregation": "ratio",
        "dims_allowed": TRANSACTION_DIMS,
        "requirements": ["fact_transactions"],
    },
    {
        "metric_key": "spend",
        "title": "Spend",
        "description": "Маркетинговые расходы.",
        "source_table": "fact_marketing_spend",
        "aggregation": "sum",
        "dims_allowed": SPEND_DIMS,
        "requirements": ["fact_marketing_spend"],
    },
    {
        "metric_key": "roas",
        "title": "ROAS",
        "description": "Возврат на рекламные расходы.",
        "source_table": "derived",
        "aggregation": "ratio",
        "dims_allowed": TRANSACTION_DIMS + SPEND_DIMS,
        "requirements": ["fact_transactions", "fact_marketing_spend"],
    },
]


_metric_cache: dict[tuple[Any, ...], float] = {}


def ensure_default_metrics(db: Session) -> None:
    existing = {
        metric.metric_key
        for metric in db.scalars(select(MetricDefinition.metric_key)).all()
    }
    to_add = []
    for metric in DEFAULT_METRICS:
        if metric["metric_key"] in existing:
            continue
        to_add.append(
            MetricDefinition(
                metric_key=metric["metric_key"],
                title=metric["title"],
                description=metric.get("description"),
                source_table=metric.get("source_table"),
                aggregation=metric.get("aggregation"),
                filters_json=json.dumps(metric.get("filters", {})),
                dims_allowed_json=json.dumps(metric.get("dims_allowed", [])),
                requirements_json=json.dumps(metric.get("requirements", [])),
                version=metric.get("version", 1),
            )
        )
    if to_add:
        db.add_all(to_add)
        db.commit()


def list_metric_definitions(db: Session) -> list[MetricDefinition]:
    ensure_default_metrics(db)
    return db.scalars(select(MetricDefinition).order_by(MetricDefinition.metric_key)).all()


def get_metric_definition(db: Session, metric_key: str) -> MetricDefinition | None:
    ensure_default_metrics(db)
    return db.scalar(
        select(MetricDefinition).where(MetricDefinition.metric_key == metric_key)
    )


def _normalize_filters(filters: dict[str, Any] | None) -> dict[str, Any]:
    if not filters:
        return {}
    normalized = {}
    for key, value in filters.items():
        if isinstance(value, str):
            normalized[key] = value.strip()
        else:
            normalized[key] = value
    return normalized


def _ensure_cache_key(
    project_id: int,
    metric_key: str,
    from_date: date | None,
    to_date: date | None,
    filters: dict[str, Any],
) -> tuple[Any, ...]:
    filters_payload = json.dumps(filters, sort_keys=True, default=str)
    return (
        project_id,
        metric_key,
        from_date.isoformat() if from_date else None,
        to_date.isoformat() if to_date else None,
        filters_payload,
    )


def compute_metric(
    db: Session,
    project_id: int,
    metric_key: str,
    from_date: date | None,
    to_date: date | None,
    filters: dict[str, Any] | None = None,
) -> float:
    filters = _normalize_filters(filters)
    cache_key = _ensure_cache_key(project_id, metric_key, from_date, to_date, filters)
    if cache_key in _metric_cache:
        return _metric_cache[cache_key]

    metric = get_metric_definition(db, metric_key)
    if not metric:
        raise ValueError("Metric not found")

    if metric_key in {"net_revenue", "refund_rate", "aov", "commission_share", "roas"}:
        gross_sales = compute_metric(
            db, project_id, "gross_sales", from_date, to_date, filters
        )
        refunds = compute_metric(
            db, project_id, "refunds", from_date, to_date, filters
        )

        if metric_key == "net_revenue":
            value = gross_sales - refunds
        elif metric_key == "refund_rate":
            value = refunds / gross_sales if gross_sales else 0.0
        elif metric_key == "aov":
            orders = compute_metric(
                db, project_id, "orders", from_date, to_date, filters
            )
            value = gross_sales / orders if orders else 0.0
        elif metric_key == "commission_share":
            commissions = compute_metric(
                db, project_id, "commissions", from_date, to_date, filters
            )
            value = commissions / gross_sales if gross_sales else 0.0
        else:
            spend = compute_metric(
                db, project_id, "spend", from_date, to_date, filters
            )
            net_revenue = gross_sales - refunds
            value = net_revenue / spend if spend else 0.0

        _metric_cache[cache_key] = float(value)
        return float(value)

    dims_allowed = json.loads(metric.dims_allowed_json or "[]")
    if metric_key in {"gross_sales", "refunds", "orders", "buyers", "commissions"}:
        conditions = [FactTransaction.project_id == project_id]
        if from_date:
            conditions.append(FactTransaction.date >= from_date)
        if to_date:
            conditions.append(FactTransaction.date <= to_date)
        for key, value in filters.items():
            if key not in dims_allowed:
                continue
            column = getattr(FactTransaction, key, None)
            if column is None:
                continue
            if isinstance(value, list):
                conditions.append(column.in_(value))
            else:
                conditions.append(column == value)
        operation = "refund" if metric_key == "refunds" else "sale"
        conditions.append(FactTransaction.operation_type == operation)

        if metric_key in {"gross_sales", "refunds"}:
            value = db.scalar(
                select(func.coalesce(func.sum(FactTransaction.amount), 0.0)).where(
                    *conditions
                )
            )
        elif metric_key == "orders":
            value = db.scalar(
                select(func.count(func.distinct(FactTransaction.order_id))).where(
                    *conditions
                )
            )
        elif metric_key == "buyers":
            value = db.scalar(
                select(func.count(func.distinct(FactTransaction.client_id))).where(
                    *conditions
                )
            )
        else:
            value = db.scalar(
                select(func.coalesce(func.sum(FactTransaction.commission), 0.0)).where(
                    *conditions
                )
            )
    elif metric_key == "spend":
        conditions = [FactMarketingSpend.project_id == project_id]
        if from_date:
            conditions.append(FactMarketingSpend.date >= from_date)
        if to_date:
            conditions.append(FactMarketingSpend.date <= to_date)
        for key, value in filters.items():
            if key not in dims_allowed:
                continue
            column = getattr(FactMarketingSpend, key, None)
            if column is None:
                continue
            if isinstance(value, list):
                conditions.append(column.in_(value))
            else:
                conditions.append(column == value)
        value = db.scalar(
            select(func.coalesce(func.sum(FactMarketingSpend.spend_amount), 0.0)).where(
                *conditions
            )
        )
    else:
        raise ValueError("Unsupported metric")

    result = float(value or 0.0)
    _metric_cache[cache_key] = result
    return result


def is_metric_available(
    db: Session, project_id: int, requirements: list[str]
) -> bool:
    if not requirements:
        return True
    for requirement in requirements:
        if requirement == "fact_transactions":
            exists = db.scalar(
                select(func.count())
                .select_from(FactTransaction)
                .where(FactTransaction.project_id == project_id)
            )
            if not exists:
                return False
        if requirement == "fact_marketing_spend":
            exists = db.scalar(
                select(func.count())
                .select_from(FactMarketingSpend)
                .where(FactMarketingSpend.project_id == project_id)
            )
            if not exists:
                return False
    return True
