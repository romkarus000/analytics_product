from __future__ import annotations

from datetime import date, datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class MetricDefinitionPublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    metric_key: str
    title: str
    description: str | None = None
    source_table: str | None = None
    aggregation: str | None = None
    formula_type: str | None = None
    dims_allowed: list[str] = Field(default_factory=list)
    requirements: list[str] = Field(default_factory=list)
    version: int
    created_at: datetime
    is_available: bool = True


class MetricValueResponse(BaseModel):
    metric_key: str
    title: str
    description: str | None = None
    value: float
    from_date: date | None = Field(default=None, alias="from")
    to_date: date | None = Field(default=None, alias="to")
    filters: dict[str, Any] = Field(default_factory=dict)
