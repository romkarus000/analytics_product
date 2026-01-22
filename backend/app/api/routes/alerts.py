from __future__ import annotations

from datetime import date
import json
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import CurrentUser
from app.core.config import get_settings
from app.db.session import get_db
from app.models.alert_event import AlertEvent
from app.models.alert_rule import AlertRule
from app.models.project import Project
from app.models.telegram_binding import TelegramBinding
from app.schemas.alerts import (
    AlertEventPublic,
    AlertRuleCreate,
    AlertRulePublic,
    AlertRuleUpdate,
    AlertSendTestResponse,
    TelegramBindingCreate,
    TelegramBindingPublic,
)
from app.services.alerting import (
    ALLOWED_RULE_TYPES,
    build_alert_event,
    dump_params,
    parse_params,
    send_telegram_message,
)

router = APIRouter(prefix="/projects", tags=["alerts"])


def _get_project(project_id: int, current_user: CurrentUser, db: Session) -> Project:
    project = db.scalar(
        select(Project).where(
            Project.id == project_id, Project.owner_id == current_user.id
        )
    )
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Проект не найден.",
        )
    return project


def _get_rule(rule_id: int, project_id: int, db: Session) -> AlertRule:
    rule = db.scalar(
        select(AlertRule).where(
            AlertRule.id == rule_id, AlertRule.project_id == project_id
        )
    )
    if not rule:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Правило не найдено.",
        )
    return rule


@router.get("/{project_id}/telegram", response_model=TelegramBindingPublic)
def get_telegram_binding(
    project_id: int,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
) -> TelegramBindingPublic:
    _get_project(project_id, current_user, db)
    binding = db.scalar(
        select(TelegramBinding).where(TelegramBinding.project_id == project_id)
    )
    if not binding:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Telegram не подключен.",
        )
    return TelegramBindingPublic.model_validate(binding)


@router.put(
    "/{project_id}/telegram",
    response_model=TelegramBindingPublic,
)
def upsert_telegram_binding(
    project_id: int,
    payload: TelegramBindingCreate,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
) -> TelegramBindingPublic:
    _get_project(project_id, current_user, db)
    binding = db.scalar(
        select(TelegramBinding).where(TelegramBinding.project_id == project_id)
    )
    if binding:
        binding.chat_id = payload.chat_id
    else:
        binding = TelegramBinding(project_id=project_id, chat_id=payload.chat_id)
        db.add(binding)
    db.commit()
    db.refresh(binding)
    return TelegramBindingPublic.model_validate(binding)


@router.delete("/{project_id}/telegram", status_code=status.HTTP_204_NO_CONTENT)
def delete_telegram_binding(
    project_id: int,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
) -> None:
    _get_project(project_id, current_user, db)
    binding = db.scalar(
        select(TelegramBinding).where(TelegramBinding.project_id == project_id)
    )
    if not binding:
        return
    db.delete(binding)
    db.commit()


@router.post("/{project_id}/telegram/test")
def send_telegram_test(
    project_id: int,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    _get_project(project_id, current_user, db)
    binding = db.scalar(
        select(TelegramBinding).where(TelegramBinding.project_id == project_id)
    )
    if not binding:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Telegram не подключен.",
        )
    settings = get_settings()
    if not settings.telegram_bot_token:
        return {"message_sent": False}
    try:
        sent = send_telegram_message(binding.chat_id, "Тестовое сообщение Telegram")
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Не удалось отправить сообщение в Telegram.",
        ) from exc
    return {"message_sent": sent}


@router.get("/{project_id}/alerts", response_model=list[AlertRulePublic])
def list_alert_rules(
    project_id: int,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
) -> list[AlertRulePublic]:
    _get_project(project_id, current_user, db)
    rules = db.scalars(
        select(AlertRule)
        .where(AlertRule.project_id == project_id)
        .order_by(AlertRule.created_at.desc())
    ).all()
    response: list[AlertRulePublic] = []
    for rule in rules:
        response.append(
            AlertRulePublic(
                id=rule.id,
                project_id=rule.project_id,
                metric_key=rule.metric_key,
                rule_type=rule.rule_type,
                params=parse_params(rule.params_json),
                is_enabled=rule.is_enabled,
                created_at=rule.created_at,
            )
        )
    return response


@router.post(
    "/{project_id}/alerts",
    response_model=AlertRulePublic,
    status_code=status.HTTP_201_CREATED,
)
def create_alert_rule(
    project_id: int,
    payload: AlertRuleCreate,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
) -> AlertRulePublic:
    _get_project(project_id, current_user, db)
    if payload.rule_type not in ALLOWED_RULE_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Неподдерживаемый тип правила.",
        )
    rule = AlertRule(
        project_id=project_id,
        metric_key=payload.metric_key,
        rule_type=payload.rule_type,
        params_json=dump_params(payload.params),
        is_enabled=payload.is_enabled,
    )
    db.add(rule)
    db.commit()
    db.refresh(rule)
    return AlertRulePublic(
        id=rule.id,
        project_id=rule.project_id,
        metric_key=rule.metric_key,
        rule_type=rule.rule_type,
        params=payload.params,
        is_enabled=rule.is_enabled,
        created_at=rule.created_at,
    )


@router.patch("/{project_id}/alerts/{rule_id}", response_model=AlertRulePublic)
def update_alert_rule(
    project_id: int,
    rule_id: int,
    payload: AlertRuleUpdate,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
) -> AlertRulePublic:
    _get_project(project_id, current_user, db)
    rule = _get_rule(rule_id, project_id, db)
    if payload.metric_key is not None:
        rule.metric_key = payload.metric_key
    if payload.rule_type is not None:
        if payload.rule_type not in ALLOWED_RULE_TYPES:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Неподдерживаемый тип правила.",
            )
        rule.rule_type = payload.rule_type
    if payload.params is not None:
        rule.params_json = dump_params(payload.params)
    if payload.is_enabled is not None:
        rule.is_enabled = payload.is_enabled
    db.commit()
    db.refresh(rule)
    return AlertRulePublic(
        id=rule.id,
        project_id=rule.project_id,
        metric_key=rule.metric_key,
        rule_type=rule.rule_type,
        params=parse_params(rule.params_json),
        is_enabled=rule.is_enabled,
        created_at=rule.created_at,
    )


@router.delete("/{project_id}/alerts/{rule_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_alert_rule(
    project_id: int,
    rule_id: int,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
) -> None:
    _get_project(project_id, current_user, db)
    rule = _get_rule(rule_id, project_id, db)
    db.delete(rule)
    db.commit()


@router.post(
    "/{project_id}/alerts/{rule_id}/send-test",
    response_model=AlertSendTestResponse,
)
def send_alert_test(
    project_id: int,
    rule_id: int,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
) -> AlertSendTestResponse:
    _get_project(project_id, current_user, db)
    rule = _get_rule(rule_id, project_id, db)
    payload = {
        "type": "test",
        "metric_key": rule.metric_key,
        "sent_at": date.today().isoformat(),
    }
    event = build_alert_event(db, rule, payload)
    binding = db.scalar(
        select(TelegramBinding).where(TelegramBinding.project_id == project_id)
    )
    if not binding:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Telegram не подключен.",
        )
    settings = get_settings()
    message_sent = False
    if settings.telegram_bot_token:
        try:
            message_sent = send_telegram_message(
                binding.chat_id, f"Test alert: {rule.metric_key}"
            )
        except Exception as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Не удалось отправить сообщение в Telegram.",
            ) from exc
    return AlertSendTestResponse(
        event=AlertEventPublic(
            id=event.id,
            rule_id=event.rule_id,
            fired_at=event.fired_at,
            payload=payload,
        ),
        message_sent=message_sent,
    )


@router.get(
    "/{project_id}/alerts/{rule_id}/events",
    response_model=list[AlertEventPublic],
)
def list_alert_events(
    project_id: int,
    rule_id: int,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
) -> list[AlertEventPublic]:
    _get_project(project_id, current_user, db)
    _get_rule(rule_id, project_id, db)
    events = db.scalars(
        select(AlertEvent)
        .where(AlertEvent.rule_id == rule_id)
        .order_by(AlertEvent.fired_at.desc())
    ).all()
    response: list[AlertEventPublic] = []
    for event in events:
        response.append(
            AlertEventPublic(
                id=event.id,
                rule_id=event.rule_id,
                fired_at=event.fired_at,
                payload=json.loads(event.payload_json),
            )
        )
    return response
