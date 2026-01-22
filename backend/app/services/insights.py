from __future__ import annotations

import json
from datetime import date, timedelta
from typing import Any, Iterable

from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from app.models.fact_transaction import FactTransaction
from app.models.insight import Insight
from app.services.metrics import compute_metric, get_metric_definition

INSIGHT_METRICS = ["gross_sales", "refunds", "net_revenue", "orders"]

DIMENSION_LABELS = {
    "product_category": "Категория",
    "product_type": "Тип",
    "manager": "Менеджер",
    "product_name": "Продукт",
}

DIMENSION_COLUMNS = {
    "product_category": FactTransaction.product_category,
    "product_type": func.coalesce(FactTransaction.product_type, "Без типа"),
    "manager": FactTransaction.manager_norm,
    "product_name": FactTransaction.product_name_norm,
}


def _latest_period(db: Session, project_id: int, window_days: int = 7) -> tuple[date, date, date, date] | None:
    last_date = db.scalar(
        select(func.max(FactTransaction.date)).where(
            FactTransaction.project_id == project_id
        )
    )
    if not last_date:
        return None
    period_to = last_date
    period_from = period_to - timedelta(days=window_days - 1)
    previous_to = period_from - timedelta(days=1)
    previous_from = previous_to - timedelta(days=window_days - 1)
    return period_from, period_to, previous_from, previous_to


def _metric_expression(metric_key: str) -> Any:
    if metric_key == "gross_sales":
        return func.sum(
            case(
                (FactTransaction.operation_type == "sale", FactTransaction.amount),
                else_=0.0,
            )
        )
    if metric_key == "refunds":
        return func.sum(
            case(
                (FactTransaction.operation_type == "refund", FactTransaction.amount),
                else_=0.0,
            )
        )
    if metric_key == "net_revenue":
        return func.sum(
            case(
                (FactTransaction.operation_type == "sale", FactTransaction.amount),
                (FactTransaction.operation_type == "refund", -FactTransaction.amount),
                else_=0.0,
            )
        )
    if metric_key == "orders":
        return func.count(
            func.distinct(
                case(
                    (
                        FactTransaction.operation_type == "sale",
                        FactTransaction.order_id,
                    ),
                    else_=None,
                )
            )
        )
    raise ValueError("Unsupported metric for insight drivers")


def _value_map(
    rows: Iterable[tuple[str, float | int]],
) -> dict[str, float]:
    result: dict[str, float] = {}
    for key, value in rows:
        result[str(key)] = float(value or 0.0)
    return result


def _dimension_breakdowns(
    db: Session,
    project_id: int,
    metric_key: str,
    period_from: date,
    period_to: date,
) -> dict[str, dict[str, float]]:
    breakdowns: dict[str, dict[str, float]] = {}
    metric_expr = _metric_expression(metric_key)

    for dimension, column in DIMENSION_COLUMNS.items():
        rows = db.execute(
            select(column.label("name"), func.coalesce(metric_expr, 0.0))
            .where(
                FactTransaction.project_id == project_id,
                FactTransaction.date >= period_from,
                FactTransaction.date <= period_to,
            )
            .group_by(column)
        ).all()
        breakdowns[dimension] = _value_map(rows)
    return breakdowns


def _top_drivers(
    current: dict[str, dict[str, float]],
    previous: dict[str, dict[str, float]],
    limit: int = 3,
) -> list[dict[str, Any]]:
    drivers: list[dict[str, Any]] = []
    for dimension, current_map in current.items():
        prev_map = previous.get(dimension, {})
        for key in set(current_map) | set(prev_map):
            current_value = current_map.get(key, 0.0)
            previous_value = prev_map.get(key, 0.0)
            delta = current_value - previous_value
            if delta == 0:
                continue
            percent = None
            if previous_value:
                percent = delta / previous_value
            drivers.append(
                {
                    "dimension": dimension,
                    "dimension_label": DIMENSION_LABELS.get(dimension, dimension),
                    "key": key,
                    "current": current_value,
                    "previous": previous_value,
                    "delta": delta,
                    "percent": percent,
                }
            )
    drivers.sort(key=lambda item: abs(item["delta"]), reverse=True)
    return drivers[:limit]


def _format_number(value: float) -> str:
    return f"{value:.2f}"


def _format_percent(value: float | None) -> str | None:
    if value is None:
        return None
    return f"{value * 100:+.1f}%"


def compose_insight_text(evidence: dict[str, Any]) -> str:
    metric_title = evidence["metric_title"]
    current_value = evidence["current"]["value"]
    previous_value = evidence["previous"]["value"]
    delta = evidence["delta"]["absolute"]
    percent = evidence["delta"]["percent"]
    period_from = evidence["period"]["from"]
    period_to = evidence["period"]["to"]

    change_word = "вырос" if delta >= 0 else "снизился"
    percent_text = _format_percent(percent)
    delta_text = _format_number(abs(delta))
    current_text = _format_number(current_value)
    previous_text = _format_number(previous_value)

    base = (
        f"{metric_title}: {change_word} на {delta_text}"
        f" ({percent_text})"
        if percent_text
        else f"{metric_title}: {change_word} на {delta_text}"
    )
    base += (
        f" vs {previous_text} → {current_text}"
        f" за период {period_from}–{period_to}."
    )

    drivers = evidence.get("drivers", [])
    if not drivers:
        return base

    top_driver = drivers[0]
    driver_delta = top_driver["delta"]
    driver_text = _format_number(abs(driver_delta))
    driver_change = "рост" if driver_delta >= 0 else "падение"
    return (
        f"{base} Драйвер: {top_driver['dimension_label']} "
        f"{top_driver['key']} ({driver_change} {driver_text})."
    )


def _build_evidence(
    metric_key: str,
    metric_title: str,
    period_from: date,
    period_to: date,
    previous_from: date,
    previous_to: date,
    current_value: float,
    previous_value: float,
    drivers: list[dict[str, Any]],
) -> dict[str, Any]:
    delta = current_value - previous_value
    percent = None
    if previous_value:
        percent = delta / previous_value
    return {
        "metric_key": metric_key,
        "metric_title": metric_title,
        "period": {
            "from": period_from.isoformat(),
            "to": period_to.isoformat(),
            "previous_from": previous_from.isoformat(),
            "previous_to": previous_to.isoformat(),
        },
        "current": {"value": current_value},
        "previous": {"value": previous_value},
        "delta": {"absolute": delta, "percent": percent},
        "drivers": drivers,
    }


def generate_insights_for_project(
    db: Session,
    project_id: int,
    period_from: date | None = None,
    period_to: date | None = None,
    window_days: int = 7,
) -> list[Insight]:
    if period_from is None or period_to is None:
        period_data = _latest_period(db, project_id, window_days=window_days)
        if not period_data:
            return []
        period_from, period_to, previous_from, previous_to = period_data
    else:
        previous_to = period_from - timedelta(days=1)
        previous_from = previous_to - timedelta(days=window_days - 1)

    insights: list[Insight] = []
    for metric_key in INSIGHT_METRICS:
        metric_def = get_metric_definition(db, metric_key)
        if not metric_def:
            continue
        current_value = compute_metric(db, project_id, metric_key, period_from, period_to)
        previous_value = compute_metric(
            db, project_id, metric_key, previous_from, previous_to
        )
        current_breakdowns = _dimension_breakdowns(
            db, project_id, metric_key, period_from, period_to
        )
        previous_breakdowns = _dimension_breakdowns(
            db, project_id, metric_key, previous_from, previous_to
        )
        drivers = _top_drivers(current_breakdowns, previous_breakdowns)

        evidence = _build_evidence(
            metric_key,
            metric_def.title,
            period_from,
            period_to,
            previous_from,
            previous_to,
            current_value,
            previous_value,
            drivers,
        )
        text = compose_insight_text(evidence)

        db.query(Insight).filter(
            Insight.project_id == project_id,
            Insight.metric_key == metric_key,
            Insight.period_from == period_from,
            Insight.period_to == period_to,
        ).delete()

        insight = Insight(
            project_id=project_id,
            metric_key=metric_key,
            period_from=period_from,
            period_to=period_to,
            text=text,
            evidence_json=json.dumps(evidence, ensure_ascii=False),
        )
        db.add(insight)
        insights.append(insight)

    return insights
