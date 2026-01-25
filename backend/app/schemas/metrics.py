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


class GrossSalesSeriesItem(BaseModel):
    date: date
    value: float


class GrossSalesPeriod(BaseModel):
    value: float
    from_date: date = Field(alias="from")
    to_date: date = Field(alias="to")


class GrossSalesChange(BaseModel):
    delta_abs: float
    delta_pct: float | None


class GrossSalesDriverItem(BaseModel):
    name: str
    current: float
    previous: float
    delta_abs: float
    delta_pct: float | None
    share_current: float


class GrossSalesDrivers(BaseModel):
    products: list[GrossSalesDriverItem] = Field(default_factory=list)
    groups: list[GrossSalesDriverItem] = Field(default_factory=list)
    managers: list[GrossSalesDriverItem] = Field(default_factory=list)


class GrossSalesConcentration(BaseModel):
    top1_share: float
    top3_share: float
    top1_name: str | None = None
    top3_names: list[str] = Field(default_factory=list)


class GrossSalesInsight(BaseModel):
    title: str
    text: str
    severity: str


class GrossSalesAvailability(BaseModel):
    status: str
    missing_fields: list[str] = Field(default_factory=list)


class GrossSalesDetailsResponse(BaseModel):
    metric: str
    current: GrossSalesPeriod
    previous: GrossSalesPeriod
    change: GrossSalesChange
    series: list[GrossSalesSeriesItem] = Field(default_factory=list)
    drivers: GrossSalesDrivers
    concentration: GrossSalesConcentration
    insights: list[GrossSalesInsight] = Field(default_factory=list)
    availability: GrossSalesAvailability
