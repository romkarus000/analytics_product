from __future__ import annotations

import json
from datetime import date
from typing import Any

from sqlalchemy import case, func, select
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
    "group_1",
    "group_2",
    "group_3",
    "group_4",
    "group_5",
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
        "formula_type": "sum",
        "dims_allowed": TRANSACTION_DIMS,
        "requirements": ["paid_at", "amount", "operation_type"],
    },
    {
        "metric_key": "refunds",
        "title": "Refunds",
        "description": "Сумма возвратов.",
        "source_table": "fact_transactions",
        "formula_type": "sum",
        "dims_allowed": TRANSACTION_DIMS,
        "requirements": ["paid_at", "amount", "operation_type"],
    },
    {
        "metric_key": "net_revenue",
        "title": "Net Revenue",
        "description": "Выручка за вычетом возвратов.",
        "source_table": "derived",
        "formula_type": "formula",
        "dims_allowed": TRANSACTION_DIMS,
        "requirements": ["paid_at", "amount", "operation_type"],
    },
    {
        "metric_key": "refund_rate",
        "title": "Refund Rate",
        "description": "Доля возвратов от выручки.",
        "source_table": "derived",
        "formula_type": "ratio",
        "dims_allowed": TRANSACTION_DIMS,
        "requirements": ["paid_at", "amount", "operation_type"],
    },
    {
        "metric_key": "avg_revenue_per_day",
        "title": "Avg Revenue per Day",
        "description": "Средняя выручка в день.",
        "source_table": "derived",
        "formula_type": "ratio",
        "dims_allowed": TRANSACTION_DIMS,
        "requirements": ["paid_at", "amount", "operation_type"],
    },
    {
        "metric_key": "best_day_revenue",
        "title": "Best Day Revenue",
        "description": "Максимальная дневная выручка.",
        "source_table": "derived",
        "formula_type": "max",
        "dims_allowed": TRANSACTION_DIMS,
        "requirements": ["paid_at", "amount", "operation_type"],
    },
    {
        "metric_key": "worst_day_revenue",
        "title": "Worst Day Revenue",
        "description": "Минимальная дневная выручка.",
        "source_table": "derived",
        "formula_type": "min",
        "dims_allowed": TRANSACTION_DIMS,
        "requirements": ["paid_at", "amount", "operation_type"],
    },
    {
        "metric_key": "orders",
        "title": "Orders",
        "description": "Количество заказов.",
        "source_table": "fact_transactions",
        "formula_type": "count_distinct",
        "dims_allowed": TRANSACTION_DIMS,
        "requirements": ["order_id"],
    },
    {
        "metric_key": "aov",
        "title": "Average Order Value",
        "description": "Средний чек.",
        "source_table": "derived",
        "formula_type": "ratio",
        "dims_allowed": TRANSACTION_DIMS,
        "requirements": ["order_id"],
    },
    {
        "metric_key": "median_order_amount",
        "title": "Median Order Amount",
        "description": "Медианный чек.",
        "source_table": "derived",
        "formula_type": "median",
        "dims_allowed": TRANSACTION_DIMS,
        "requirements": ["order_id"],
    },
    {
        "metric_key": "refunds_per_order",
        "title": "Refunds per Order",
        "description": "Возвраты на заказ.",
        "source_table": "derived",
        "formula_type": "ratio",
        "dims_allowed": TRANSACTION_DIMS,
        "requirements": ["order_id"],
    },
    {
        "metric_key": "fees_total",
        "title": "Fees Total",
        "description": "Сумма комиссий/сборов.",
        "source_table": "fact_transactions",
        "formula_type": "sum",
        "dims_allowed": TRANSACTION_DIMS,
        "requirements": ["fee_any"],
    },
    {
        "metric_key": "fee_share",
        "title": "Fee Share",
        "description": "Доля комиссий в выручке.",
        "source_table": "derived",
        "formula_type": "ratio",
        "dims_allowed": TRANSACTION_DIMS,
        "requirements": ["fee_any"],
    },
    {
        "metric_key": "net_profit_simple",
        "title": "Net Profit (Simple)",
        "description": "Прибыль: (сумма оплат − комиссии) − (сумма возвратов − комиссии).",
        "source_table": "derived",
        "formula_type": "formula",
        "dims_allowed": TRANSACTION_DIMS,
        "requirements": ["fee_any"],
    },
    {
        "metric_key": "profit_margin",
        "title": "Profit Margin",
        "description": "Доля прибыли в выручке.",
        "source_table": "derived",
        "formula_type": "ratio",
        "dims_allowed": TRANSACTION_DIMS,
        "requirements": ["fee_any"],
    },
    {
        "metric_key": "buyers",
        "title": "Buyers",
        "description": "Количество уникальных покупателей.",
        "source_table": "fact_transactions",
        "formula_type": "count_distinct",
        "dims_allowed": TRANSACTION_DIMS,
        "requirements": ["client_id"],
    },
    {
        "metric_key": "new_buyers",
        "title": "New Buyers",
        "description": "Новые покупатели за период.",
        "source_table": "derived",
        "formula_type": "count_distinct",
        "dims_allowed": TRANSACTION_DIMS,
        "requirements": ["client_id"],
    },
    {
        "metric_key": "repeat_rate",
        "title": "Repeat Rate",
        "description": "Доля повторных покупок.",
        "source_table": "derived",
        "formula_type": "ratio",
        "dims_allowed": TRANSACTION_DIMS,
        "requirements": ["client_id"],
    },
    {
        "metric_key": "returning_revenue",
        "title": "Returning Revenue",
        "description": "Выручка от возвратных клиентов.",
        "source_table": "derived",
        "formula_type": "sum",
        "dims_allowed": TRANSACTION_DIMS,
        "requirements": ["client_id"],
    },
    {
        "metric_key": "revenue_by_manager",
        "title": "Revenue by Manager",
        "description": "Выручка по менеджерам.",
        "source_table": "fact_transactions",
        "formula_type": "group_sum",
        "dims_allowed": TRANSACTION_DIMS,
        "requirements": ["manager"],
    },
    {
        "metric_key": "orders_by_manager",
        "title": "Orders by Manager",
        "description": "Заказы по менеджерам.",
        "source_table": "fact_transactions",
        "formula_type": "group_count_distinct",
        "dims_allowed": TRANSACTION_DIMS,
        "requirements": ["manager", "order_id"],
    },
    {
        "metric_key": "aov_by_manager",
        "title": "AOV by Manager",
        "description": "Средний чек по менеджерам.",
        "source_table": "derived",
        "formula_type": "group_ratio",
        "dims_allowed": TRANSACTION_DIMS,
        "requirements": ["manager", "order_id"],
    },
    {
        "metric_key": "refund_rate_by_manager",
        "title": "Refund Rate by Manager",
        "description": "Доля возвратов по менеджерам.",
        "source_table": "derived",
        "formula_type": "group_ratio",
        "dims_allowed": TRANSACTION_DIMS,
        "requirements": ["manager"],
    },
    {
        "metric_key": "net_profit_by_manager",
        "title": "Net Profit by Manager",
        "description": "Прибыль по менеджерам.",
        "source_table": "derived",
        "formula_type": "group_formula",
        "dims_allowed": TRANSACTION_DIMS,
        "requirements": ["manager", "fee_any"],
    },
    {
        "metric_key": "revenue_by_product",
        "title": "Revenue by Product",
        "description": "Выручка по продуктам.",
        "source_table": "fact_transactions",
        "formula_type": "group_sum",
        "dims_allowed": TRANSACTION_DIMS,
        "requirements": ["product_name"],
    },
    {
        "metric_key": "orders_by_product",
        "title": "Orders by Product",
        "description": "Заказы по продуктам.",
        "source_table": "fact_transactions",
        "formula_type": "group_count_distinct",
        "dims_allowed": TRANSACTION_DIMS,
        "requirements": ["product_name", "order_id"],
    },
    {
        "metric_key": "aov_by_product",
        "title": "AOV by Product",
        "description": "Средний чек по продуктам.",
        "source_table": "derived",
        "formula_type": "group_ratio",
        "dims_allowed": TRANSACTION_DIMS,
        "requirements": ["product_name", "order_id"],
    },
    {
        "metric_key": "refund_rate_by_product",
        "title": "Refund Rate by Product",
        "description": "Доля возвратов по продуктам.",
        "source_table": "derived",
        "formula_type": "group_ratio",
        "dims_allowed": TRANSACTION_DIMS,
        "requirements": ["product_name"],
    },
    {
        "metric_key": "revenue_share_by_product",
        "title": "Revenue Share by Product",
        "description": "Доля выручки топ продуктов.",
        "source_table": "derived",
        "formula_type": "group_share",
        "dims_allowed": TRANSACTION_DIMS,
        "requirements": ["product_name"],
    },
    {
        "metric_key": "pareto_80_20",
        "title": "Pareto 80/20",
        "description": "Доля выручки топ 20% продуктов.",
        "source_table": "derived",
        "formula_type": "pareto",
        "dims_allowed": TRANSACTION_DIMS,
        "requirements": ["product_name"],
    },
    {
        "metric_key": "product_transitions",
        "title": "Product Transitions",
        "description": "Что покупают после продукта.",
        "source_table": "derived",
        "formula_type": "sequence",
        "dims_allowed": TRANSACTION_DIMS,
        "requirements": ["client_id", "product_name"],
    },
    {
        "metric_key": "revenue_by_payment_method",
        "title": "Revenue by Payment Method",
        "description": "Выручка по способам оплаты.",
        "source_table": "fact_transactions",
        "formula_type": "group_sum",
        "dims_allowed": TRANSACTION_DIMS,
        "requirements": ["payment_method"],
    },
    {
        "metric_key": "refund_rate_by_payment_method",
        "title": "Refund Rate by Payment Method",
        "description": "Доля возвратов по способам оплаты.",
        "source_table": "derived",
        "formula_type": "group_ratio",
        "dims_allowed": TRANSACTION_DIMS,
        "requirements": ["payment_method"],
    },
    {
        "metric_key": "aov_by_payment_method",
        "title": "AOV by Payment Method",
        "description": "Средний чек по способам оплаты.",
        "source_table": "derived",
        "formula_type": "group_ratio",
        "dims_allowed": TRANSACTION_DIMS,
        "requirements": ["payment_method", "order_id"],
    },
    {
        "metric_key": "fees_by_payment_method",
        "title": "Fees by Payment Method",
        "description": "Комиссии по способам оплаты.",
        "source_table": "derived",
        "formula_type": "group_sum",
        "dims_allowed": TRANSACTION_DIMS,
        "requirements": ["payment_method", "fee_any"],
    },
    {
        "metric_key": "revenue_by_group",
        "title": "Revenue by Group",
        "description": "Выручка по группам.",
        "source_table": "fact_transactions",
        "formula_type": "group_sum",
        "dims_allowed": TRANSACTION_DIMS,
        "requirements": ["group_any"],
    },
    {
        "metric_key": "refund_rate_by_group",
        "title": "Refund Rate by Group",
        "description": "Доля возвратов по группам.",
        "source_table": "derived",
        "formula_type": "group_ratio",
        "dims_allowed": TRANSACTION_DIMS,
        "requirements": ["group_any"],
    },
    {
        "metric_key": "net_profit_by_group",
        "title": "Net Profit by Group",
        "description": "Прибыль по группам.",
        "source_table": "derived",
        "formula_type": "group_formula",
        "dims_allowed": TRANSACTION_DIMS,
        "requirements": ["group_any", "fee_any"],
    },
    {
        "metric_key": "top_groups_by_growth",
        "title": "Top Groups by Growth",
        "description": "Топ групп по росту.",
        "source_table": "derived",
        "formula_type": "growth",
        "dims_allowed": TRANSACTION_DIMS,
        "requirements": ["group_any"],
    },
    {
        "metric_key": "holes",
        "title": "Group Holes",
        "description": "Группы с выручкой раньше и нулём сейчас.",
        "source_table": "derived",
        "formula_type": "holes",
        "dims_allowed": TRANSACTION_DIMS,
        "requirements": ["group_any"],
    },
    {
        "metric_key": "spend_total",
        "title": "Spend Total",
        "description": "Маркетинговые расходы.",
        "source_table": "fact_marketing_spend",
        "formula_type": "sum",
        "dims_allowed": SPEND_DIMS,
        "requirements": ["marketing_spend"],
    },
    {
        "metric_key": "roas_total",
        "title": "ROAS Total",
        "description": "Возврат на рекламные расходы.",
        "source_table": "derived",
        "formula_type": "ratio",
        "dims_allowed": TRANSACTION_DIMS + SPEND_DIMS,
        "requirements": ["marketing_spend", "utm_any_transactions", "utm_any_spend"],
    },
    {
        "metric_key": "roas_by_campaign",
        "title": "ROAS by Campaign",
        "description": "ROAS по кампаниям.",
        "source_table": "derived",
        "formula_type": "group_ratio",
        "dims_allowed": TRANSACTION_DIMS + SPEND_DIMS,
        "requirements": ["marketing_spend", "utm_any_transactions", "utm_any_spend"],
    },
    {
        "metric_key": "anomaly_spend_zero_revenue",
        "title": "Spend with Zero Revenue",
        "description": "Расходы без выручки.",
        "source_table": "derived",
        "formula_type": "anomaly",
        "dims_allowed": TRANSACTION_DIMS + SPEND_DIMS,
        "requirements": ["marketing_spend", "utm_any_transactions", "utm_any_spend"],
    },
]


def _fees_by_operation(
    db: Session,
    project_id: int,
    from_date: date | None,
    to_date: date | None,
    filters: dict[str, Any],
    dims_allowed: list[str],
    operation_type: str,
) -> float:
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
    conditions.append(FactTransaction.operation_type == operation_type)
    fee_expr = (
        func.coalesce(FactTransaction.fee_1, 0.0)
        + func.coalesce(FactTransaction.fee_2, 0.0)
        + func.coalesce(FactTransaction.fee_3, 0.0)
    )
    value = db.scalar(
        select(func.coalesce(func.sum(fee_expr), 0.0)).where(*conditions)
    )
    return float(value or 0.0)


_metric_cache: dict[tuple[Any, ...], float] = {}


def ensure_default_metrics(db: Session) -> None:
    existing = set(db.scalars(select(MetricDefinition.metric_key)).all())
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
                formula_type=metric.get("formula_type"),
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

    dims_allowed = json.loads(metric.dims_allowed_json or "[]")

    if metric_key in {
        "net_revenue",
        "refund_rate",
        "aov",
        "fee_share",
        "roas",
        "roas_total",
        "net_profit_simple",
    }:
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
        elif metric_key == "fee_share":
            fees_total = compute_metric(
                db, project_id, "fees_total", from_date, to_date, filters
            )
            value = fees_total / gross_sales if gross_sales else 0.0
        elif metric_key == "net_profit_simple":
            fees_sales = _fees_by_operation(
                db, project_id, from_date, to_date, filters, dims_allowed, "sale"
            )
            fees_refunds = _fees_by_operation(
                db, project_id, from_date, to_date, filters, dims_allowed, "refund"
            )
            value = (gross_sales - fees_sales) - (refunds - fees_refunds)
        else:
            spend = compute_metric(
                db, project_id, "spend_total", from_date, to_date, filters
            )
            net_revenue = gross_sales - refunds
            value = net_revenue / spend if spend else 0.0

        _metric_cache[cache_key] = float(value)
        return float(value)

    if metric_key in {"gross_sales", "refunds", "orders", "buyers", "fees_total"}:
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
                select(
                    func.count(
                        func.distinct(
                            func.coalesce(
                                FactTransaction.transaction_id, FactTransaction.order_id
                            )
                        )
                    )
                ).where(*conditions)
            )
        elif metric_key == "buyers":
            value = db.scalar(
                select(func.count(func.distinct(FactTransaction.client_id))).where(
                    *conditions
                )
            )
        else:
            value = db.scalar(
                select(
                    func.coalesce(
                        func.sum(
                            func.coalesce(FactTransaction.fee_1, 0.0)
                            + func.coalesce(FactTransaction.fee_2, 0.0)
                            + func.coalesce(FactTransaction.fee_3, 0.0)
                        ),
                        0.0,
                    )
                ).where(*conditions)
            )
    elif metric_key in {"spend", "spend_total"}:
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


def get_field_presence(db: Session, project_id: int) -> dict[str, bool]:
    transaction_row = db.execute(
        select(
            func.count().label("tx_count"),
            func.max(case((FactTransaction.order_id.isnot(None), 1), else_=0)).label(
                "order_id"
            ),
            func.max(
                case((FactTransaction.transaction_id.isnot(None), 1), else_=0)
            ).label("transaction_id"),
            func.max(case((FactTransaction.client_id.isnot(None), 1), else_=0)).label(
                "client_id"
            ),
            func.max(
                case((FactTransaction.product_name_norm.isnot(None), 1), else_=0)
            ).label("product_name"),
            func.max(case((FactTransaction.manager_norm.isnot(None), 1), else_=0)).label(
                "manager"
            ),
            func.max(
                case((FactTransaction.payment_method.isnot(None), 1), else_=0)
            ).label("payment_method"),
            func.max(case((FactTransaction.group_1.isnot(None), 1), else_=0)).label(
                "group_1"
            ),
            func.max(case((FactTransaction.group_2.isnot(None), 1), else_=0)).label(
                "group_2"
            ),
            func.max(case((FactTransaction.group_3.isnot(None), 1), else_=0)).label(
                "group_3"
            ),
            func.max(case((FactTransaction.group_4.isnot(None), 1), else_=0)).label(
                "group_4"
            ),
            func.max(case((FactTransaction.group_5.isnot(None), 1), else_=0)).label(
                "group_5"
            ),
            func.max(case((FactTransaction.fee_1.isnot(None), 1), else_=0)).label(
                "fee_1"
            ),
            func.max(case((FactTransaction.fee_2.isnot(None), 1), else_=0)).label(
                "fee_2"
            ),
            func.max(case((FactTransaction.fee_3.isnot(None), 1), else_=0)).label(
                "fee_3"
            ),
            func.max(
                case((FactTransaction.utm_source.isnot(None), 1), else_=0)
            ).label("utm_source"),
            func.max(
                case((FactTransaction.utm_medium.isnot(None), 1), else_=0)
            ).label("utm_medium"),
            func.max(
                case((FactTransaction.utm_campaign.isnot(None), 1), else_=0)
            ).label("utm_campaign"),
            func.max(case((FactTransaction.utm_term.isnot(None), 1), else_=0)).label(
                "utm_term"
            ),
            func.max(
                case((FactTransaction.utm_content.isnot(None), 1), else_=0)
            ).label("utm_content"),
        ).where(FactTransaction.project_id == project_id)
    ).one()

    spend_row = db.execute(
        select(
            func.count().label("spend_count"),
            func.max(
                case((FactMarketingSpend.utm_source.isnot(None), 1), else_=0)
            ).label("utm_source"),
            func.max(
                case((FactMarketingSpend.utm_medium.isnot(None), 1), else_=0)
            ).label("utm_medium"),
            func.max(
                case((FactMarketingSpend.utm_campaign.isnot(None), 1), else_=0)
            ).label("utm_campaign"),
            func.max(case((FactMarketingSpend.utm_term.isnot(None), 1), else_=0)).label(
                "utm_term"
            ),
            func.max(
                case((FactMarketingSpend.utm_content.isnot(None), 1), else_=0)
            ).label("utm_content"),
        ).where(FactMarketingSpend.project_id == project_id)
    ).one()

    tx_count = int(transaction_row.tx_count or 0)
    spend_count = int(spend_row.spend_count or 0)
    fee_any = any(
        getattr(transaction_row, key) for key in ("fee_1", "fee_2", "fee_3")
    )
    group_any = any(
        getattr(transaction_row, key)
        for key in ("group_1", "group_2", "group_3", "group_4", "group_5")
    )
    utm_tx_any = any(
        getattr(transaction_row, key)
        for key in (
            "utm_source",
            "utm_medium",
            "utm_campaign",
            "utm_term",
            "utm_content",
        )
    )
    utm_spend_any = any(
        getattr(spend_row, key)
        for key in ("utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content")
    )

    return {
        "paid_at": tx_count > 0,
        "amount": tx_count > 0,
        "operation_type": tx_count > 0,
        "order_id": bool(transaction_row.order_id),
        "transaction_id": bool(transaction_row.transaction_id),
        "client_id": bool(transaction_row.client_id),
        "product_name": bool(transaction_row.product_name),
        "manager": bool(transaction_row.manager),
        "payment_method": bool(transaction_row.payment_method),
        "fee_1": bool(transaction_row.fee_1),
        "fee_2": bool(transaction_row.fee_2),
        "fee_3": bool(transaction_row.fee_3),
        "fee_any": fee_any,
        "group_any": group_any,
        "utm_any_transactions": utm_tx_any,
        "marketing_spend": spend_count > 0,
        "utm_any_spend": utm_spend_any,
    }


def evaluate_metric_availability(
    requirements: list[str], presence: dict[str, bool]
) -> tuple[str, list[str]]:
    if not requirements:
        return "available", []
    missing_fields: list[str] = []
    satisfied = 0
    partial_override = False

    expanded_requirements = {
        "fee_any": ["fee_1", "fee_2", "fee_3"],
        "group_any": ["group_1", "group_2", "group_3", "group_4", "group_5"],
        "utm_any_transactions": [
            "utm_source",
            "utm_medium",
            "utm_campaign",
            "utm_term",
            "utm_content",
        ],
        "utm_any_spend": [
            "utm_source",
            "utm_medium",
            "utm_campaign",
            "utm_term",
            "utm_content",
        ],
        "marketing_spend": ["fact_marketing_spend"],
    }

    for requirement in requirements:
        if requirement == "order_id" and not presence.get("order_id"):
            if presence.get("transaction_id"):
                partial_override = True
            missing_fields.append("order_id")
            continue
        is_present = presence.get(requirement, False)
        if is_present:
            satisfied += 1
            continue
        if requirement in expanded_requirements:
            missing_fields.extend(expanded_requirements[requirement])
        else:
            missing_fields.append(requirement)

    if satisfied == len(requirements):
        return "available", []
    if satisfied == 0 and not partial_override:
        return "unavailable", sorted(set(missing_fields))
    return "partial", sorted(set(missing_fields))


def is_metric_available(
    db: Session, project_id: int, requirements: list[str]
) -> bool:
    if not requirements:
        return True
    presence = get_field_presence(db, project_id)
    availability, _ = evaluate_metric_availability(requirements, presence)
    return availability != "unavailable"
