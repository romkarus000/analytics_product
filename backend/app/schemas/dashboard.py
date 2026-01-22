from __future__ import annotations

from datetime import date
from typing import Any

from pydantic import BaseModel


class DashboardSeriesPoint(BaseModel):
    date: date
    gross_sales: float
    refunds: float
    net_revenue: float
    orders: int


class RevenueBreakdownItem(BaseModel):
    name: str
    revenue: float


class DashboardBreakdowns(BaseModel):
    top_products_by_revenue: list[RevenueBreakdownItem]
    top_managers_by_revenue: list[RevenueBreakdownItem]
    revenue_by_category: list[RevenueBreakdownItem]
    revenue_by_type: list[RevenueBreakdownItem]


class DashboardResponse(BaseModel):
    from_date: date | None
    to_date: date | None
    filters: dict[str, Any]
    series: list[DashboardSeriesPoint]
    breakdowns: DashboardBreakdowns
