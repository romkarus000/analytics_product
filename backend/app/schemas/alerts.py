from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class TelegramBindingCreate(BaseModel):
    chat_id: str = Field(min_length=1, max_length=64)


class TelegramBindingPublic(BaseModel):
    id: int
    project_id: int
    chat_id: str
    created_at: datetime

    model_config = {"from_attributes": True}


class AlertRuleCreate(BaseModel):
    metric_key: str = Field(min_length=1, max_length=128)
    rule_type: str = Field(min_length=1, max_length=32)
    params: dict[str, Any]
    is_enabled: bool = True


class AlertRuleUpdate(BaseModel):
    metric_key: str | None = Field(default=None, min_length=1, max_length=128)
    rule_type: str | None = Field(default=None, min_length=1, max_length=32)
    params: dict[str, Any] | None = None
    is_enabled: bool | None = None


class AlertRulePublic(BaseModel):
    id: int
    project_id: int
    metric_key: str
    rule_type: str
    params: dict[str, Any]
    is_enabled: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class AlertEventPublic(BaseModel):
    id: int
    rule_id: int
    fired_at: datetime
    payload: dict[str, Any]

    model_config = {"from_attributes": True}


class AlertSendTestResponse(BaseModel):
    event: AlertEventPublic
    message_sent: bool
