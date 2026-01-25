from __future__ import annotations

from datetime import date, timedelta
from typing import Any

from sqlalchemy import case, func, select, String
from sqlalchemy.orm import Session

from app.models.fact_marketing_spend import FactMarketingSpend
from app.models.fact_transaction import FactTransaction
from app.models.project_settings import ProjectSettings
from app.services.metrics import evaluate_metric_availability, get_field_presence


FILTER_COLUMNS = [
    "product_category",
    "product_name",
    "manager",
    "product_type",
    "payment_method",
    "group_1",
    "group_2",
    "group_3",
    "group_4",
    "group_5",
]


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


def _order_key(table: Any) -> Any:
    return func.coalesce(table.c.order_id, table.c.transaction_id, func.cast(table.c.id, String))


def _transaction_source(
    project_id: int, dedup_policy: str
) -> Any:
    table = FactTransaction
    if dedup_policy == "last_row_wins":
        key = _order_key(table)
        ranked = (
            select(
                *[table.__table__.c[col.name] for col in table.__table__.columns],
                func.row_number()
                .over(partition_by=key, order_by=table.created_at.desc())
                .label("rn"),
            )
            .where(table.project_id == project_id)
            .subquery()
        )
        return (
            select(*[ranked.c[col.name] for col in table.__table__.columns])
            .where(ranked.c.rn == 1)
            .subquery()
        )
    if dedup_policy == "aggregate_by_order_id":
        key = _order_key(table)
        return (
            select(
                key.label("dedup_key"),
                func.min(table.id).label("id"),
                func.max(table.project_id).label("project_id"),
                func.min(table.date).label("date"),
                table.operation_type.label("operation_type"),
                func.sum(table.amount).label("amount"),
                func.max(table.transaction_id).label("transaction_id"),
                func.max(table.order_id).label("order_id"),
                func.max(table.client_id).label("client_id"),
                func.max(table.product_name_norm).label("product_name_norm"),
                func.max(table.product_category).label("product_category"),
                func.max(table.product_type).label("product_type"),
                func.max(table.manager_norm).label("manager_norm"),
                func.max(table.payment_method).label("payment_method"),
                func.max(table.group_1).label("group_1"),
                func.max(table.group_2).label("group_2"),
                func.max(table.group_3).label("group_3"),
                func.max(table.group_4).label("group_4"),
                func.max(table.group_5).label("group_5"),
                func.sum(func.coalesce(table.fee_1, 0.0)).label("fee_1"),
                func.sum(func.coalesce(table.fee_2, 0.0)).label("fee_2"),
                func.sum(func.coalesce(table.fee_3, 0.0)).label("fee_3"),
                func.sum(func.coalesce(table.fee_total, 0.0)).label("fee_total"),
                func.max(table.utm_source).label("utm_source"),
                func.max(table.utm_medium).label("utm_medium"),
                func.max(table.utm_campaign).label("utm_campaign"),
                func.max(table.utm_term).label("utm_term"),
                func.max(table.utm_content).label("utm_content"),
                func.max(table.created_at).label("created_at"),
            )
            .where(table.project_id == project_id)
            .group_by(key, table.operation_type)
            .subquery()
        )
    return (
        select(*[table.__table__.c[col.name] for col in table.__table__.columns])
        .where(table.project_id == project_id)
        .subquery()
    )


def _apply_filters(conditions: list[Any], table: Any, filters: dict[str, Any]) -> list[Any]:
    column_map = {
        "product_category": table.c.product_category,
        "product_name": table.c.product_name_norm,
        "manager": table.c.manager_norm,
        "product_type": table.c.product_type,
        "payment_method": table.c.payment_method,
        "group_1": table.c.group_1,
        "group_2": table.c.group_2,
        "group_3": table.c.group_3,
        "group_4": table.c.group_4,
        "group_5": table.c.group_5,
    }
    for key, value in filters.items():
        if key not in FILTER_COLUMNS:
            continue
        column = column_map.get(key)
        if column is None:
            continue
        if isinstance(value, list):
            conditions.append(column.in_(value))
        else:
            conditions.append(column == value)
    return conditions


def _revenue_expression(table: Any) -> Any:
    return func.sum(
        case(
            (table.c.operation_type == "sale", table.c.amount),
            (table.c.operation_type == "refund", -table.c.amount),
            else_=0.0,
        )
    )


def _fee_total_column(table: Any) -> Any:
    return (
        func.coalesce(table.c.fee_1, 0.0)
        + func.coalesce(table.c.fee_2, 0.0)
        + func.coalesce(table.c.fee_3, 0.0)
    )


def _fees_expression(table: Any) -> Any:
    return func.sum(_fee_total_column(table))


def _fees_expression_by_operation(table: Any, operation_type: str) -> Any:
    return func.sum(
        case(
            (table.c.operation_type == operation_type, _fee_total_column(table)),
            else_=0.0,
        )
    )


def _period_shift(from_date: date | None, to_date: date | None, days: int) -> tuple[date | None, date | None]:
    if not from_date or not to_date:
        return None, None
    return from_date - timedelta(days=days), to_date - timedelta(days=days)


def _safe_ratio(numerator: float, denominator: float) -> float:
    return numerator / denominator if denominator else 0.0


def _delta(current: float, previous: float | None) -> float | None:
    if previous is None or previous == 0:
        return None
    return (current - previous) / previous


def _metric_card(
    key: str,
    title: str,
    value: float | None,
    delta_wow: float | None,
    delta_mom: float | None,
    availability: str,
    missing_fields: list[str],
    breakdowns: dict[str, Any] | None = None,
) -> dict[str, Any]:
    return {
        "key": key,
        "title": title,
        "value": value,
        "delta": {"wow": delta_wow, "mom": delta_mom},
        "availability": availability,
        "missing_fields": missing_fields,
        "breakdowns": breakdowns,
    }


def _basic_aggregates(db: Session, table: Any, conditions: list[Any]) -> dict[str, float]:
    gross_sales = db.scalar(
        select(
            func.coalesce(
                func.sum(
                    case((table.c.operation_type == "sale", table.c.amount), else_=0.0)
                ),
                0.0,
            )
        ).where(*conditions)
    )
    refunds = db.scalar(
        select(
            func.coalesce(
                func.sum(
                    case(
                        (table.c.operation_type == "refund", table.c.amount),
                        else_=0.0,
                    )
                ),
                0.0,
            )
        ).where(*conditions)
    )
    net_revenue = float(gross_sales or 0.0) - float(refunds or 0.0)
    orders = db.scalar(
        select(
            func.coalesce(
                func.count(
                    func.distinct(
                        case(
                            (table.c.operation_type == "sale", _order_key(table)),
                            else_=None,
                        )
                    )
                ),
                0,
            )
        ).where(*conditions)
    )
    fees_sales = db.scalar(
        select(func.coalesce(_fees_expression_by_operation(table, "sale"), 0.0)).where(
            *conditions
        )
    )
    fees_refunds = db.scalar(
        select(
            func.coalesce(_fees_expression_by_operation(table, "refund"), 0.0)
        ).where(*conditions)
    )
    fees_total = db.scalar(
        select(func.coalesce(_fees_expression(table), 0.0)).where(*conditions)
    )
    return {
        "gross_sales": float(gross_sales or 0.0),
        "refunds": float(refunds or 0.0),
        "net_revenue": float(net_revenue or 0.0),
        "orders": float(orders or 0),
        "fees_sales": float(fees_sales or 0.0),
        "fees_refunds": float(fees_refunds or 0.0),
        "fees_total": float(fees_total or 0.0),
    }


def _top_revenue_by(
    db: Session,
    table: Any,
    conditions: list[Any],
    dimension: Any,
    limit: int = 5,
) -> list[dict[str, Any]]:
    revenue_expr = _revenue_expression(table)
    name_expr = func.coalesce(dimension, "Без значения")
    rows = db.execute(
        select(
            name_expr.label("name"),
            func.coalesce(revenue_expr, 0.0).label("revenue"),
        )
        .where(*conditions)
        .group_by(name_expr)
        .order_by(func.coalesce(revenue_expr, 0.0).desc())
        .limit(limit)
    ).all()
    return [
        {"name": row.name, "revenue": float(row.revenue or 0.0)} for row in rows
    ]


def _group_refund_rate(
    db: Session,
    table: Any,
    conditions: list[Any],
    dimension: Any,
    limit: int = 5,
) -> list[dict[str, Any]]:
    gross_sales_expr = func.sum(
        case((table.c.operation_type == "sale", table.c.amount), else_=0.0)
    )
    refunds_expr = func.sum(
        case((table.c.operation_type == "refund", table.c.amount), else_=0.0)
    )
    name_expr = func.coalesce(dimension, "Без значения")
    rows = db.execute(
        select(
            name_expr.label("name"),
            func.coalesce(gross_sales_expr, 0.0).label("gross_sales"),
            func.coalesce(refunds_expr, 0.0).label("refunds"),
        )
        .where(*conditions)
        .group_by(name_expr)
        .order_by(func.coalesce(refunds_expr, 0.0).desc())
        .limit(limit)
    ).all()
    result = []
    for row in rows:
        gross = float(row.gross_sales or 0.0)
        refunds = float(row.refunds or 0.0)
        result.append(
            {
                "name": row.name,
                "refund_rate": _safe_ratio(refunds, gross),
                "gross_sales": gross,
            }
        )
    return result


def _group_orders_and_aov(
    db: Session,
    table: Any,
    conditions: list[Any],
    dimension: Any,
    limit: int = 5,
) -> list[dict[str, Any]]:
    revenue_expr = _revenue_expression(table)
    orders_expr = func.count(
        func.distinct(
            case((table.c.operation_type == "sale", _order_key(table)), else_=None)
        )
    )
    name_expr = func.coalesce(dimension, "Без значения")
    rows = db.execute(
        select(
            name_expr.label("name"),
            func.coalesce(revenue_expr, 0.0).label("revenue"),
            func.coalesce(orders_expr, 0).label("orders"),
        )
        .where(*conditions)
        .group_by(name_expr)
        .order_by(func.coalesce(revenue_expr, 0.0).desc())
        .limit(limit)
    ).all()
    return [
        {
            "name": row.name,
            "orders": int(row.orders or 0),
            "aov": _safe_ratio(float(row.revenue or 0.0), float(row.orders or 0.0)),
        }
        for row in rows
    ]


def _group_net_profit(
    db: Session,
    table: Any,
    conditions: list[Any],
    dimension: Any,
    limit: int = 5,
) -> list[dict[str, Any]]:
    sale_amount_expr = func.sum(
        case((table.c.operation_type == "sale", table.c.amount), else_=0.0)
    )
    refund_amount_expr = func.sum(
        case((table.c.operation_type == "refund", table.c.amount), else_=0.0)
    )
    sale_fees_expr = _fees_expression_by_operation(table, "sale")
    refund_fees_expr = _fees_expression_by_operation(table, "refund")
    name_expr = func.coalesce(dimension, "Без значения")
    rows = db.execute(
        select(
            name_expr.label("name"),
            func.coalesce(sale_amount_expr, 0.0).label("sales"),
            func.coalesce(refund_amount_expr, 0.0).label("refunds"),
            func.coalesce(sale_fees_expr, 0.0).label("sales_fees"),
            func.coalesce(refund_fees_expr, 0.0).label("refunds_fees"),
        )
        .where(*conditions)
        .group_by(name_expr)
        .order_by(func.coalesce(sale_amount_expr, 0.0).desc())
        .limit(limit)
    ).all()
    return [
        {
            "name": row.name,
            "net_profit": (float(row.sales or 0.0) - float(row.sales_fees or 0.0))
            - (float(row.refunds or 0.0) - float(row.refunds_fees or 0.0)),
        }
        for row in rows
    ]


def _median(values: list[float]) -> float:
    if not values:
        return 0.0
    sorted_values = sorted(values)
    mid = len(sorted_values) // 2
    if len(sorted_values) % 2 == 1:
        return sorted_values[mid]
    return (sorted_values[mid - 1] + sorted_values[mid]) / 2


def get_dashboard_data(
    db: Session,
    project_id: int,
    from_date: date | None,
    to_date: date | None,
    filters: dict[str, Any] | None = None,
) -> dict[str, Any]:
    filters = _normalize_filters(filters)
    settings = db.get(ProjectSettings, project_id)
    dedup_policy = settings.dedup_policy if settings else "keep_all_rows"
    table = _transaction_source(project_id, dedup_policy)

    conditions: list[Any] = []
    if from_date:
        conditions.append(table.c.date >= from_date)
    if to_date:
        conditions.append(table.c.date <= to_date)
    _apply_filters(conditions, table, filters)

    presence = get_field_presence(db, project_id)

    aggregates = _basic_aggregates(db, table, conditions)
    gross_sales = aggregates["gross_sales"]
    refunds = aggregates["refunds"]
    net_revenue = aggregates["net_revenue"]
    orders = aggregates["orders"]
    fees_total = aggregates["fees_total"]
    fees_sales = aggregates["fees_sales"]
    fees_refunds = aggregates["fees_refunds"]

    wow_from, wow_to = _period_shift(from_date, to_date, 7)
    mom_from, mom_to = _period_shift(from_date, to_date, 30)

    wow_conditions: list[Any] = []
    if wow_from:
        wow_conditions.append(table.c.date >= wow_from)
    if wow_to:
        wow_conditions.append(table.c.date <= wow_to)
    _apply_filters(wow_conditions, table, filters)

    mom_conditions: list[Any] = []
    if mom_from:
        mom_conditions.append(table.c.date >= mom_from)
    if mom_to:
        mom_conditions.append(table.c.date <= mom_to)
    _apply_filters(mom_conditions, table, filters)

    wow_aggregates = (
        _basic_aggregates(db, table, wow_conditions) if wow_from and wow_to else None
    )
    mom_aggregates = (
        _basic_aggregates(db, table, mom_conditions) if mom_from and mom_to else None
    )

    net_revenue_delta_wow = (
        _delta(net_revenue, wow_aggregates["net_revenue"]) if wow_aggregates else None
    )
    net_revenue_delta_mom = (
        _delta(net_revenue, mom_aggregates["net_revenue"]) if mom_aggregates else None
    )
    orders_delta_wow = (
        _delta(orders, wow_aggregates["orders"]) if wow_aggregates else None
    )
    orders_delta_mom = (
        _delta(orders, mom_aggregates["orders"]) if mom_aggregates else None
    )

    refund_rate = _safe_ratio(refunds, gross_sales)
    avg_revenue_per_day = 0.0
    days_count = db.scalar(
        select(func.count(func.distinct(table.c.date))).where(*conditions)
    )
    if days_count:
        avg_revenue_per_day = net_revenue / float(days_count)

    daily_rows = db.execute(
        select(
            table.c.date.label("date"),
            func.coalesce(
                func.sum(
                    case((table.c.operation_type == "sale", table.c.amount), else_=0.0)
                ),
                0.0,
            ).label("gross_sales"),
            func.coalesce(
                func.sum(
                    case(
                        (table.c.operation_type == "refund", table.c.amount),
                        else_=0.0,
                    )
                ),
                0.0,
            ).label("refunds"),
            func.coalesce(_revenue_expression(table), 0.0).label("net_revenue"),
            func.coalesce(
                func.count(
                    func.distinct(
                        case(
                            (table.c.operation_type == "sale", _order_key(table)),
                            else_=None,
                        )
                    )
                ),
                0,
            ).label("orders"),
        )
        .where(*conditions)
        .group_by(table.c.date)
        .order_by(table.c.date)
    ).all()

    series = [
        {
            "date": row.date,
            "gross_sales": float(row.gross_sales or 0.0),
            "refunds": float(row.refunds or 0.0),
            "net_revenue": float(row.net_revenue or 0.0),
            "orders": int(row.orders or 0),
        }
        for row in daily_rows
    ]

    best_day_revenue = max((point["net_revenue"] for point in series), default=0.0)
    worst_day_revenue = min((point["net_revenue"] for point in series), default=0.0)

    order_amounts = db.execute(
        select(
            _order_key(table).label("order_key"),
            func.coalesce(
                func.sum(
                    case((table.c.operation_type == "sale", table.c.amount), else_=0.0)
                ),
                0.0,
            ).label("amount"),
        )
        .where(*conditions)
        .group_by(_order_key(table))
    ).all()
    median_order_amount = _median([float(row.amount or 0.0) for row in order_amounts])

    refunds_per_order = _safe_ratio(refunds, orders)

    net_profit_simple = (gross_sales - fees_sales) - (refunds - fees_refunds)
    profit_margin = _safe_ratio(net_profit_simple, net_revenue)
    profit_delta_wow = (
        _delta(
            net_profit_simple,
            (wow_aggregates["gross_sales"] - wow_aggregates["fees_sales"])
            - (wow_aggregates["refunds"] - wow_aggregates["fees_refunds"]),
        )
        if wow_aggregates
        else None
    )
    profit_delta_mom = (
        _delta(
            net_profit_simple,
            (mom_aggregates["gross_sales"] - mom_aggregates["fees_sales"])
            - (mom_aggregates["refunds"] - mom_aggregates["fees_refunds"]),
        )
        if mom_aggregates
        else None
    )
    fee_share = _safe_ratio(fees_total, net_revenue)

    buyers = db.scalar(
        select(
            func.coalesce(
                func.count(func.distinct(table.c.client_id)),
                0,
            )
        ).where(*conditions, table.c.operation_type == "sale")
    )
    buyers = float(buyers or 0.0)

    new_buyers = 0.0
    if from_date and to_date:
        first_purchase = (
            select(
                table.c.client_id.label("client_id"),
                func.min(table.c.date).label("first_date"),
            )
            .where(table.c.operation_type == "sale")
            .group_by(table.c.client_id)
            .subquery()
        )
        new_buyers = db.scalar(
            select(func.coalesce(func.count(), 0))
            .select_from(first_purchase)
            .where(
                first_purchase.c.first_date >= from_date,
                first_purchase.c.first_date <= to_date,
            )
        )

    repeat_rate = 0.0
    if buyers:
        client_orders = (
            select(
                table.c.client_id.label("client_id"),
                func.count(func.distinct(_order_key(table))).label("orders"),
            )
            .where(*conditions, table.c.operation_type == "sale")
            .group_by(table.c.client_id)
            .subquery()
        )
        repeaters = db.scalar(
            select(func.coalesce(func.count(), 0))
            .select_from(client_orders)
            .where(client_orders.c.orders >= 2)
        )
        repeat_rate = _safe_ratio(float(repeaters or 0.0), buyers)

    returning_revenue = 0.0
    if from_date:
        returning_clients = (
            select(table.c.client_id)
            .where(table.c.operation_type == "sale")
            .group_by(table.c.client_id)
            .having(func.min(table.c.date) < from_date)
            .subquery()
        )
        returning_revenue = db.scalar(
            select(func.coalesce(_revenue_expression(table), 0.0))
            .where(*conditions)
            .where(table.c.client_id.in_(select(returning_clients.c.client_id)))
        )

    manager_breakdowns = _top_revenue_by(db, table, conditions, table.c.manager_norm)
    manager_orders = _group_orders_and_aov(db, table, conditions, table.c.manager_norm)
    manager_refund_rate = _group_refund_rate(
        db, table, conditions, table.c.manager_norm
    )
    manager_profit = _group_net_profit(db, table, conditions, table.c.manager_norm)

    product_breakdowns = _top_revenue_by(
        db, table, conditions, table.c.product_name_norm
    )
    product_orders = _group_orders_and_aov(
        db, table, conditions, table.c.product_name_norm
    )
    product_refund_rate = _group_refund_rate(
        db, table, conditions, table.c.product_name_norm
    )

    total_revenue = sum(item["revenue"] for item in product_breakdowns)
    revenue_share_by_product = [
        {
            "name": item["name"],
            "revenue_share": _safe_ratio(item["revenue"], total_revenue),
        }
        for item in product_breakdowns
    ]

    pareto_share = 0.0
    if product_breakdowns:
        sorted_items = sorted(product_breakdowns, key=lambda item: item["revenue"], reverse=True)
        top_count = max(1, int(len(sorted_items) * 0.2))
        pareto_revenue = sum(item["revenue"] for item in sorted_items[:top_count])
        total_revenue_full = sum(item["revenue"] for item in sorted_items)
        pareto_share = _safe_ratio(pareto_revenue, total_revenue_full)

    transitions: list[dict[str, Any]] = []
    total_transition_pairs = 0
    transition_rows = db.execute(
        select(
            table.c.client_id,
            table.c.date,
            table.c.product_name_norm,
        )
        .where(
            *conditions,
            table.c.client_id.isnot(None),
            table.c.product_name_norm.isnot(None),
            table.c.operation_type == "sale",
        )
        .order_by(table.c.client_id, table.c.date)
    ).all()
    if transition_rows:
        transition_map: dict[tuple[str, str], int] = {}
        last_by_client: dict[str, str] = {}
        for row in transition_rows:
            client_id = str(row.client_id)
            product_name = str(row.product_name_norm)
            if client_id in last_by_client:
                previous_product = last_by_client[client_id]
                if previous_product != product_name:
                    pair = (previous_product, product_name)
                    transition_map[pair] = transition_map.get(pair, 0) + 1
            last_by_client[client_id] = product_name
        total_transition_pairs = len(transition_map)
        transitions = [
            {"from": pair[0], "to": pair[1], "count": count}
            for pair, count in sorted(transition_map.items(), key=lambda item: item[1], reverse=True)
        ][:5]

    payment_breakdowns = _top_revenue_by(
        db, table, conditions, table.c.payment_method
    )
    payment_refund_rate = _group_refund_rate(
        db, table, conditions, table.c.payment_method
    )
    payment_aov = _group_orders_and_aov(
        db, table, conditions, table.c.payment_method
    )
    payment_fees = _group_net_profit(db, table, conditions, table.c.payment_method)

    group_level = 1
    for level in range(1, 6):
        if filters.get(f"group_{level}"):
            group_level = level + 1
    if group_level > 5:
        group_level = 5
    group_column = getattr(table.c, f"group_{group_level}")

    group_breakdowns = _top_revenue_by(db, table, conditions, group_column)
    group_refund_rate = _group_refund_rate(db, table, conditions, group_column)
    group_profit = _group_net_profit(db, table, conditions, group_column)

    growth_breakdowns: list[dict[str, Any]] = []
    holes: list[dict[str, Any]] = []
    if wow_from and wow_to:
        group_name_expr = func.coalesce(group_column, "Без значения")
        current_groups = db.execute(
            select(
                group_name_expr.label("name"),
                func.coalesce(_revenue_expression(table), 0.0).label("revenue"),
            )
            .where(*conditions)
            .group_by(group_name_expr)
        ).all()
        previous_conditions: list[Any] = []
        if wow_from:
            previous_conditions.append(table.c.date >= wow_from)
        if wow_to:
            previous_conditions.append(table.c.date <= wow_to)
        _apply_filters(previous_conditions, table, filters)
        previous_groups = db.execute(
            select(
                group_name_expr.label("name"),
                func.coalesce(_revenue_expression(table), 0.0).label("revenue"),
            )
            .where(*previous_conditions)
            .group_by(group_name_expr)
        ).all()
        prev_map = {row.name: float(row.revenue or 0.0) for row in previous_groups}
        growth_breakdowns = [
            {
                "name": row.name,
                "growth": _delta(float(row.revenue or 0.0), prev_map.get(row.name)),
            }
            for row in current_groups
        ]
        growth_breakdowns = sorted(
            growth_breakdowns,
            key=lambda item: (item["growth"] or 0),
            reverse=True,
        )[:5]
        current_names = {row.name for row in current_groups}
        holes = [
            {"name": name, "previous_revenue": revenue}
            for name, revenue in prev_map.items()
            if name not in current_names and revenue > 0
        ]

    spend_conditions: list[Any] = []
    if from_date:
        spend_conditions.append(FactMarketingSpend.date >= from_date)
    if to_date:
        spend_conditions.append(FactMarketingSpend.date <= to_date)
    spend_total = db.scalar(
        select(func.coalesce(func.sum(FactMarketingSpend.spend_amount), 0.0)).where(
            FactMarketingSpend.project_id == project_id,
            *spend_conditions,
        )
    )
    spend_total = float(spend_total or 0.0)

    campaign_expr = func.coalesce(table.c.utm_campaign, "Без кампании")
    spend_campaign_expr = func.coalesce(FactMarketingSpend.utm_campaign, "Без кампании")
    revenue_by_campaign = db.execute(
        select(
            campaign_expr.label("campaign"),
            func.coalesce(_revenue_expression(table), 0.0).label("revenue"),
        )
        .where(*conditions)
        .group_by(campaign_expr)
    ).all()
    spend_by_campaign = db.execute(
        select(
            spend_campaign_expr.label("campaign"),
            func.coalesce(func.sum(FactMarketingSpend.spend_amount), 0.0).label("spend"),
        )
        .where(FactMarketingSpend.project_id == project_id, *spend_conditions)
        .group_by(spend_campaign_expr)
    ).all()
    spend_map = {row.campaign: float(row.spend or 0.0) for row in spend_by_campaign}
    revenue_map = {row.campaign: float(row.revenue or 0.0) for row in revenue_by_campaign}
    roas_by_campaign = [
        {
            "campaign": campaign,
            "roas": _safe_ratio(revenue, spend_map.get(campaign, 0.0)),
            "revenue": revenue,
            "spend": spend_map.get(campaign, 0.0),
        }
        for campaign, revenue in revenue_map.items()
    ]
    roas_by_campaign = sorted(roas_by_campaign, key=lambda item: item["roas"], reverse=True)[:5]

    anomaly_spend = [
        {
            "campaign": campaign,
            "spend": spend,
        }
        for campaign, spend in spend_map.items()
        if spend > 0 and revenue_map.get(campaign, 0.0) == 0.0
    ]

    roas_total = _safe_ratio(sum(revenue_map.values()), spend_total)

    availability_map = {
        "gross_sales": evaluate_metric_availability(
            ["paid_at", "amount", "operation_type"], presence
        ),
        "refunds": evaluate_metric_availability(
            ["paid_at", "amount", "operation_type"], presence
        ),
        "net_revenue": evaluate_metric_availability(
            ["paid_at", "amount", "operation_type"], presence
        ),
        "refund_rate": evaluate_metric_availability(
            ["paid_at", "amount", "operation_type"], presence
        ),
        "avg_revenue_per_day": evaluate_metric_availability(
            ["paid_at", "amount", "operation_type"], presence
        ),
        "best_day_revenue": evaluate_metric_availability(
            ["paid_at", "amount", "operation_type"], presence
        ),
        "worst_day_revenue": evaluate_metric_availability(
            ["paid_at", "amount", "operation_type"], presence
        ),
        "orders": evaluate_metric_availability(["order_id"], presence),
        "aov": evaluate_metric_availability(["order_id"], presence),
        "median_order_amount": evaluate_metric_availability(["order_id"], presence),
        "refunds_per_order": evaluate_metric_availability(["order_id"], presence),
        "fees_total": evaluate_metric_availability(["fee_any"], presence),
        "fee_share": evaluate_metric_availability(["fee_any"], presence),
        "net_profit_simple": evaluate_metric_availability(["fee_any"], presence),
        "profit_margin": evaluate_metric_availability(["fee_any"], presence),
        "buyers": evaluate_metric_availability(["client_id"], presence),
        "new_buyers": evaluate_metric_availability(["client_id"], presence),
        "repeat_rate": evaluate_metric_availability(["client_id"], presence),
        "returning_revenue": evaluate_metric_availability(["client_id"], presence),
        "revenue_by_manager": evaluate_metric_availability(["manager"], presence),
        "orders_by_manager": evaluate_metric_availability(["manager", "order_id"], presence),
        "aov_by_manager": evaluate_metric_availability(["manager", "order_id"], presence),
        "refund_rate_by_manager": evaluate_metric_availability(["manager"], presence),
        "net_profit_by_manager": evaluate_metric_availability(
            ["manager", "fee_any"], presence
        ),
        "revenue_by_product": evaluate_metric_availability(["product_name"], presence),
        "orders_by_product": evaluate_metric_availability(["product_name", "order_id"], presence),
        "aov_by_product": evaluate_metric_availability(["product_name", "order_id"], presence),
        "refund_rate_by_product": evaluate_metric_availability(["product_name"], presence),
        "revenue_share_by_product": evaluate_metric_availability(["product_name"], presence),
        "pareto_80_20": evaluate_metric_availability(["product_name"], presence),
        "product_transitions": evaluate_metric_availability(["client_id", "product_name"], presence),
        "revenue_by_payment_method": evaluate_metric_availability(["payment_method"], presence),
        "refund_rate_by_payment_method": evaluate_metric_availability(["payment_method"], presence),
        "aov_by_payment_method": evaluate_metric_availability(
            ["payment_method", "order_id"], presence
        ),
        "fees_by_payment_method": evaluate_metric_availability(
            ["payment_method", "fee_any"], presence
        ),
        "revenue_by_group": evaluate_metric_availability(["group_any"], presence),
        "refund_rate_by_group": evaluate_metric_availability(["group_any"], presence),
        "net_profit_by_group": evaluate_metric_availability(["group_any", "fee_any"], presence),
        "top_groups_by_growth": evaluate_metric_availability(["group_any"], presence),
        "holes": evaluate_metric_availability(["group_any"], presence),
        "spend_total": evaluate_metric_availability(["marketing_spend"], presence),
        "roas_total": evaluate_metric_availability(
            ["marketing_spend", "utm_any_transactions", "utm_any_spend"], presence
        ),
        "roas_by_campaign": evaluate_metric_availability(
            ["marketing_spend", "utm_any_transactions", "utm_any_spend"], presence
        ),
        "anomaly_spend_zero_revenue": evaluate_metric_availability(
            ["marketing_spend", "utm_any_transactions", "utm_any_spend"], presence
        ),
    }

    def availability(key: str) -> tuple[str, list[str]]:
        return availability_map.get(key, ("available", []))

    executive_cards = [
        _metric_card(
            "gross_sales",
            "Gross Sales",
            gross_sales,
            None,
            None,
            *availability("gross_sales"),
        ),
        _metric_card(
            "refunds",
            "Refunds",
            refunds,
            None,
            None,
            *availability("refunds"),
        ),
        _metric_card(
            "net_revenue",
            "Net Revenue",
            net_revenue,
            net_revenue_delta_wow,
            net_revenue_delta_mom,
            *availability("net_revenue"),
        ),
        _metric_card(
            "orders",
            "Orders",
            orders,
            orders_delta_wow,
            orders_delta_mom,
            *availability("orders"),
        ),
    ]

    packs = {
        "profit_pack": {
            "title": "Profit",
            "metrics": [
                _metric_card(
                    "fees_total",
                    "Fees Total",
                    fees_total,
                    None,
                    None,
                    *availability("fees_total"),
                ),
                _metric_card(
                    "fee_share",
                    "Fee Share",
                    fee_share,
                    None,
                    None,
                    *availability("fee_share"),
                ),
                _metric_card(
                    "net_profit_simple",
                    "Net Profit",
                    net_profit_simple,
                    profit_delta_wow,
                    profit_delta_mom,
                    *availability("net_profit_simple"),
                ),
                _metric_card(
                    "profit_margin",
                    "Profit Margin",
                    profit_margin,
                    None,
                    None,
                    *availability("profit_margin"),
                ),
            ],
            "breakdowns": {
                "net_profit_by_manager": manager_profit,
                "net_profit_by_group": group_profit,
            },
            "series": series,
        },
        "sales_pack": {
            "title": "Sales",
            "metrics": [
                _metric_card(
                    "gross_sales",
                    "Gross Sales",
                    gross_sales,
                    None,
                    None,
                    *availability("gross_sales"),
                ),
                _metric_card(
                    "refunds",
                    "Refunds",
                    refunds,
                    None,
                    None,
                    *availability("refunds"),
                ),
                _metric_card(
                    "net_revenue",
                    "Net Revenue",
                    net_revenue,
                    net_revenue_delta_wow,
                    net_revenue_delta_mom,
                    *availability("net_revenue"),
                ),
                _metric_card(
                    "refund_rate",
                    "Refund Rate",
                    refund_rate,
                    None,
                    None,
                    *availability("refund_rate"),
                ),
                _metric_card(
                    "avg_revenue_per_day",
                    "Avg Revenue / Day",
                    avg_revenue_per_day,
                    None,
                    None,
                    *availability("avg_revenue_per_day"),
                ),
                _metric_card(
                    "best_day_revenue",
                    "Best Day Revenue",
                    best_day_revenue,
                    None,
                    None,
                    *availability("best_day_revenue"),
                ),
                _metric_card(
                    "worst_day_revenue",
                    "Worst Day Revenue",
                    worst_day_revenue,
                    None,
                    None,
                    *availability("worst_day_revenue"),
                ),
            ],
            "breakdowns": {
                "top_products_by_revenue": product_breakdowns,
                "top_managers_by_revenue": manager_breakdowns,
            },
            "series": series,
        },
        "retention_pack": {
            "title": "Retention",
            "metrics": [
                _metric_card(
                    "buyers",
                    "Buyers",
                    buyers,
                    None,
                    None,
                    *availability("buyers"),
                ),
                _metric_card(
                    "new_buyers",
                    "New Buyers",
                    float(new_buyers or 0.0),
                    None,
                    None,
                    *availability("new_buyers"),
                ),
                _metric_card(
                    "repeat_rate",
                    "Repeat Rate",
                    repeat_rate,
                    None,
                    None,
                    *availability("repeat_rate"),
                ),
                _metric_card(
                    "returning_revenue",
                    "Returning Revenue",
                    float(returning_revenue or 0.0),
                    None,
                    None,
                    *availability("returning_revenue"),
                ),
            ],
            "breakdowns": {},
            "series": series,
        },
        "team_pack": {
            "title": "Team",
            "metrics": [
                _metric_card(
                    "revenue_by_manager",
                    "Revenue by Manager",
                    net_revenue,
                    None,
                    None,
                    *availability("revenue_by_manager"),
                    {"top": manager_breakdowns},
                ),
                _metric_card(
                    "orders_by_manager",
                    "Orders by Manager",
                    orders,
                    None,
                    None,
                    *availability("orders_by_manager"),
                    {"orders": manager_orders},
                ),
                _metric_card(
                    "refund_rate_by_manager",
                    "Refund Rate by Manager",
                    refund_rate,
                    None,
                    None,
                    *availability("refund_rate_by_manager"),
                    {"refund_rate": manager_refund_rate},
                ),
            ],
            "breakdowns": {
                "top_managers_by_revenue": manager_breakdowns,
                "orders_by_manager": manager_orders,
                "refund_rate_by_manager": manager_refund_rate,
            },
            "series": series,
        },
        "product_pack": {
            "title": "Product",
            "metrics": [
                _metric_card(
                    "revenue_by_product",
                    "Revenue by Product",
                    net_revenue,
                    None,
                    None,
                    *availability("revenue_by_product"),
                    {"top": product_breakdowns},
                ),
                _metric_card(
                    "orders_by_product",
                    "Orders by Product",
                    orders,
                    None,
                    None,
                    *availability("orders_by_product"),
                    {"orders": product_orders},
                ),
                _metric_card(
                    "refund_rate_by_product",
                    "Refund Rate by Product",
                    refund_rate,
                    None,
                    None,
                    *availability("refund_rate_by_product"),
                    {"refund_rate": product_refund_rate},
                ),
                _metric_card(
                    "revenue_share_by_product",
                    "Revenue Share",
                    pareto_share,
                    None,
                    None,
                    *availability("revenue_share_by_product"),
                    {"shares": revenue_share_by_product},
                ),
                _metric_card(
                    "pareto_80_20",
                    "Pareto 80/20",
                    pareto_share,
                    None,
                    None,
                    *availability("pareto_80_20"),
                ),
                _metric_card(
                    "product_transitions",
                    "Product Transitions",
                    float(total_transition_pairs),
                    None,
                    None,
                    *availability("product_transitions"),
                    {"transitions": transitions},
                ),
            ],
            "breakdowns": {
                "top_products_by_revenue": product_breakdowns,
                "orders_by_product": product_orders,
                "refund_rate_by_product": product_refund_rate,
                "product_transitions": transitions,
            },
            "series": series,
        },
        "groups_pack": {
            "title": "Groups",
            "metrics": [
                _metric_card(
                    "revenue_by_group",
                    "Revenue by Group",
                    net_revenue,
                    None,
                    None,
                    *availability("revenue_by_group"),
                    {"groups": group_breakdowns},
                ),
                _metric_card(
                    "refund_rate_by_group",
                    "Refund Rate by Group",
                    refund_rate,
                    None,
                    None,
                    *availability("refund_rate_by_group"),
                    {"groups": group_refund_rate},
                ),
                _metric_card(
                    "top_groups_by_growth",
                    "Top Groups by Growth",
                    float(len(growth_breakdowns)),
                    None,
                    None,
                    *availability("top_groups_by_growth"),
                    {"groups": growth_breakdowns},
                ),
                _metric_card(
                    "holes",
                    "Group Holes",
                    float(len(holes)),
                    None,
                    None,
                    *availability("holes"),
                    {"groups": holes},
                ),
            ],
            "breakdowns": {
                "revenue_by_group": group_breakdowns,
                "refund_rate_by_group": group_refund_rate,
                "net_profit_by_group": group_profit,
                "top_groups_by_growth": growth_breakdowns,
                "holes": holes,
                "level": group_level,
            },
            "series": series,
        },
        "marketing_pack": {
            "title": "Marketing",
            "metrics": [
                _metric_card(
                    "spend_total",
                    "Spend Total",
                    spend_total,
                    None,
                    None,
                    *availability("spend_total"),
                ),
                _metric_card(
                    "roas_total",
                    "ROAS Total",
                    roas_total,
                    None,
                    None,
                    *availability("roas_total"),
                ),
                _metric_card(
                    "roas_by_campaign",
                    "ROAS by Campaign",
                    float(len(roas_by_campaign)),
                    None,
                    None,
                    *availability("roas_by_campaign"),
                    {"campaigns": roas_by_campaign},
                ),
                _metric_card(
                    "anomaly_spend_zero_revenue",
                    "Spend without Revenue",
                    float(len(anomaly_spend)),
                    None,
                    None,
                    *availability("anomaly_spend_zero_revenue"),
                    {"campaigns": anomaly_spend},
                ),
            ],
            "breakdowns": {
                "roas_by_campaign": roas_by_campaign,
                "anomaly_spend_zero_revenue": anomaly_spend,
            },
            "series": series,
        },
    }

    return {
        "from_date": from_date,
        "to_date": to_date,
        "filters": filters,
        "executive_cards": executive_cards,
        "packs": packs,
    }
