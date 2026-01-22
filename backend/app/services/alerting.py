from __future__ import annotations

import json
from datetime import date, timedelta
from typing import Any

import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models.alert_event import AlertEvent
from app.models.alert_rule import AlertRule
from app.models.telegram_binding import TelegramBinding
from app.services.metrics import compute_metric

ALLOWED_RULE_TYPES = {"threshold", "anomaly"}


def parse_params(params_json: str) -> dict[str, Any]:
    payload = json.loads(params_json or "{}")
    if not isinstance(payload, dict):
        raise ValueError("params_json must be a JSON object")
    return payload


def dump_params(params: dict[str, Any]) -> str:
    return json.dumps(params, ensure_ascii=False)


def serialize_payload(payload: dict[str, Any]) -> str:
    return json.dumps(payload, ensure_ascii=False)


def build_alert_event(db: Session, rule: AlertRule, payload: dict[str, Any]) -> AlertEvent:
    event = AlertEvent(rule_id=rule.id, payload_json=serialize_payload(payload))
    db.add(event)
    db.commit()
    db.refresh(event)
    return event


def get_project_binding(db: Session, project_id: int) -> TelegramBinding | None:
    return db.scalar(
        select(TelegramBinding).where(TelegramBinding.project_id == project_id)
    )


def send_telegram_message(chat_id: str, text: str) -> bool:
    settings = get_settings()
    if not settings.telegram_bot_token:
        return False
    url = f"{settings.telegram_api_base}/bot{settings.telegram_bot_token}/sendMessage"
    payload = {"chat_id": chat_id, "text": text}
    with httpx.Client(timeout=10) as client:
        response = client.post(url, json=payload)
        response.raise_for_status()
    return True


def evaluate_threshold_rule(
    db: Session, rule: AlertRule, params: dict[str, Any], today: date
) -> tuple[bool, dict[str, Any]]:
    threshold = params.get("threshold")
    if threshold is None:
        raise ValueError("threshold is required")
    comparison = params.get("comparison", "gt")
    lookback_days = int(params.get("lookback_days", 1))
    from_date = today - timedelta(days=lookback_days)
    to_date = today
    value = compute_metric(db, rule.project_id, rule.metric_key, from_date, to_date, {})
    comparisons = {
        "gt": value > threshold,
        "gte": value >= threshold,
        "lt": value < threshold,
        "lte": value <= threshold,
    }
    fired = comparisons.get(comparison)
    if fired is None:
        raise ValueError("comparison must be one of gt, gte, lt, lte")
    payload = {
        "type": "threshold",
        "metric_key": rule.metric_key,
        "value": value,
        "threshold": threshold,
        "comparison": comparison,
        "from_date": from_date.isoformat(),
        "to_date": to_date.isoformat(),
    }
    return fired, payload


def evaluate_anomaly_rule(
    db: Session, rule: AlertRule, params: dict[str, Any], today: date
) -> tuple[bool, dict[str, Any]]:
    lookback_days = int(params.get("lookback_days", 7))
    delta_percent = float(params.get("delta_percent", 20))
    direction = params.get("direction", "up")
    current_from = today - timedelta(days=1)
    current_to = today
    baseline_from = today - timedelta(days=lookback_days + 1)
    baseline_to = today - timedelta(days=1)
    current_value = compute_metric(
        db, rule.project_id, rule.metric_key, current_from, current_to, {}
    )
    baseline_total = compute_metric(
        db, rule.project_id, rule.metric_key, baseline_from, baseline_to, {}
    )
    baseline_avg = baseline_total / lookback_days if lookback_days else 0
    if baseline_avg == 0:
        return False, {
            "type": "anomaly",
            "metric_key": rule.metric_key,
            "reason": "baseline_avg_zero",
            "current_value": current_value,
        }
    delta = ((current_value - baseline_avg) / baseline_avg) * 100
    if direction == "up":
        fired = delta >= delta_percent
    elif direction == "down":
        fired = delta <= -delta_percent
    else:
        raise ValueError("direction must be up or down")
    payload = {
        "type": "anomaly",
        "metric_key": rule.metric_key,
        "current_value": current_value,
        "baseline_avg": baseline_avg,
        "delta_percent": delta,
        "direction": direction,
        "threshold_percent": delta_percent,
        "baseline_from": baseline_from.isoformat(),
        "baseline_to": baseline_to.isoformat(),
        "current_from": current_from.isoformat(),
        "current_to": current_to.isoformat(),
    }
    return fired, payload


def evaluate_rule(
    db: Session, rule: AlertRule, today: date | None = None
) -> tuple[bool, dict[str, Any]]:
    if rule.rule_type not in ALLOWED_RULE_TYPES:
        raise ValueError("unsupported rule type")
    params = parse_params(rule.params_json)
    today = today or date.today()
    if rule.rule_type == "threshold":
        return evaluate_threshold_rule(db, rule, params, today)
    return evaluate_anomaly_rule(db, rule, params, today)


def run_daily_alerts(db: Session, today: date | None = None) -> list[AlertEvent]:
    today = today or date.today()
    rules = db.scalars(
        select(AlertRule).where(AlertRule.is_enabled.is_(True))
    ).all()
    events: list[AlertEvent] = []
    for rule in rules:
        fired, payload = evaluate_rule(db, rule, today)
        if not fired:
            continue
        event = build_alert_event(db, rule, payload)
        binding = get_project_binding(db, rule.project_id)
        if binding:
            send_telegram_message(binding.chat_id, _format_message(rule, payload))
        events.append(event)
    return events


def _format_message(rule: AlertRule, payload: dict[str, Any]) -> str:
    title = f"Alert: {rule.metric_key}"
    details = json.dumps(payload, ensure_ascii=False, indent=2)
    return f"{title}\n{details}"
