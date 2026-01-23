from __future__ import annotations

from datetime import date
from typing import Any

from pydantic import BaseModel, Field


class MetricDelta(BaseModel):
    wow: float | None = None
    mom: float | None = None


class DashboardMetric(BaseModel):
    key: str
    title: str
    value: float | None = None
    delta: MetricDelta | None = None
    availability: str
    missing_fields: list[str] = Field(default_factory=list)
    breakdowns: dict[str, Any] | None = None


class DashboardPack(BaseModel):
    title: str
    metrics: list[DashboardMetric]
    breakdowns: dict[str, Any] = Field(default_factory=dict)
    series: list[dict[str, Any]] = Field(default_factory=list)


class DashboardResponse(BaseModel):
    from_date: date | None
    to_date: date | None
    filters: dict[str, Any]
    executive_cards: list[DashboardMetric]
    packs: dict[str, DashboardPack]
