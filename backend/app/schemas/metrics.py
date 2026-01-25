from __future__ import annotations

from datetime import date, datetime
from typing import Any, Literal

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
    bucket: str
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


class GrossSalesDriverSplit(BaseModel):
    up: list[GrossSalesDriverItem] = Field(default_factory=list)
    down: list[GrossSalesDriverItem] = Field(default_factory=list)


class GrossSalesDrivers(BaseModel):
    products: GrossSalesDriverSplit
    groups: GrossSalesDriverSplit
    managers: GrossSalesDriverSplit


class GrossSalesConcentrationItem(BaseModel):
    name: str
    value: float
    share: float


class GrossSalesConcentration(BaseModel):
    top1_share: float
    top3_share: float
    top1_name: str | None = None
    top1_value: float = 0.0
    top3_names: list[str] = Field(default_factory=list)
    top3_items: list[GrossSalesConcentrationItem] = Field(default_factory=list)


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
    series_granularity: Literal["day", "week"]
    top_buckets: list[str] = Field(default_factory=list)
    drivers: GrossSalesDrivers
    concentration: GrossSalesConcentration
    insights: list[GrossSalesInsight] = Field(default_factory=list)
    availability: GrossSalesAvailability


class RefundsPeriod(BaseModel):
    from_date: date = Field(alias="from")
    to_date: date = Field(alias="to")


class RefundsTotals(BaseModel):
    refunds_current: float
    refunds_previous: float
    delta_abs: float
    delta_pct: float | None
    gross_sales_current: float
    refund_rate_current: float | None
    refund_rate_previous: float | None
    refund_rate_delta_pp: float | None


class RefundsSeriesItem(BaseModel):
    bucket: str
    value: float


class RefundsSeries(BaseModel):
    granularity: Literal["day", "week"]
    series_refunds: list[RefundsSeriesItem] = Field(default_factory=list)
    series_refund_rate: list[RefundsSeriesItem] = Field(default_factory=list)
    top_buckets_refunds: list[str] = Field(default_factory=list)


class RefundsProductItem(BaseModel):
    product_name: str
    gross_sales: float
    refunds: float
    refund_rate: float | None


class RefundsConcentrationItem(BaseModel):
    product_name: str | None = None
    refunds: float
    share: float


class RefundsConcentration(BaseModel):
    top1: RefundsConcentrationItem | None = None
    top3_share: float


class RefundsPaymentMethodItem(BaseModel):
    payment_method: str
    refunds: float
    share: float
    gross_sales: float | None = None
    refund_rate: float | None = None


class RefundsSignal(BaseModel):
    type: str
    title: str
    message: str
    severity: str | None = None


class RefundsDetailsResponse(BaseModel):
    periods: dict[str, RefundsPeriod]
    totals: RefundsTotals
    series: RefundsSeries
    sales_vs_refunds_by_product: list[RefundsProductItem] = Field(default_factory=list)
    concentration: RefundsConcentration
    refunds_by_payment_method: list[RefundsPaymentMethodItem] = Field(
        default_factory=list
    )
    signals: list[RefundsSignal] = Field(default_factory=list)


class NetRevenuePeriod(BaseModel):
    from_date: date = Field(alias="from")
    to_date: date = Field(alias="to")


class NetRevenueTotals(BaseModel):
    gross_sales_current: float
    gross_sales_previous: float
    refunds_current: float
    refunds_previous: float
    net_revenue_current: float
    net_revenue_previous: float
    delta_abs: float
    delta_pct: float | None
    refunds_share_of_gross_current: float | None
    refunds_share_of_gross_previous: float | None
    refunds_share_delta_pp: float | None


class NetRevenueSeriesPoint(BaseModel):
    bucket: str
    gross_sales: float
    refunds: float
    net_revenue: float


class NetRevenueSeries(BaseModel):
    granularity: Literal["day", "week"]
    points: list[NetRevenueSeriesPoint] = Field(default_factory=list)
    top_buckets_net_revenue: list[str] = Field(default_factory=list)


class NetRevenueDriverItem(BaseModel):
    name: str
    current_net_revenue: float
    delta: float
    share: float


class NetRevenueDrivers(BaseModel):
    products_top10: list[NetRevenueDriverItem] = Field(default_factory=list)
    groups_top10: list[NetRevenueDriverItem] = Field(default_factory=list)
    managers_top10: list[NetRevenueDriverItem] = Field(default_factory=list)


class NetRevenueNetVsGrossRefundsItem(BaseModel):
    product_name: str
    gross_sales: float
    refunds: float
    net_revenue: float
    refund_rate_percent: float | None


class NetRevenuePaymentMethodItem(BaseModel):
    payment_method: str
    gross_sales: float
    refunds: float
    net_revenue: float
    refund_rate_percent: float | None


class NetRevenueSignal(BaseModel):
    type: str
    title: str
    message: str
    severity: str | None = None


class NetRevenueDetailsResponse(BaseModel):
    periods: dict[str, NetRevenuePeriod]
    totals: NetRevenueTotals
    series: NetRevenueSeries
    drivers: NetRevenueDrivers
    net_vs_gross_refunds_top10: list[NetRevenueNetVsGrossRefundsItem] = Field(
        default_factory=list
    )
    payment_methods: list[NetRevenuePaymentMethodItem] = Field(default_factory=list)
    signals: list[NetRevenueSignal] = Field(default_factory=list)
