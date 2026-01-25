"use client";

import { useMemo } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { formatCurrencyRUB, formatNumber } from "../../app/lib/format";

type NetRevenueSeriesPoint = {
  bucket: string;
  gross_sales: number;
  refunds: number;
  net_revenue: number;
};

type ChartDatum = {
  bucket: string;
  grossSales: number;
  refunds: number;
  netRevenue: number;
  label: string;
  tooltipLabel: string;
  isTop: boolean;
};

type NetRevenueSeriesChartProps = {
  points: NetRevenueSeriesPoint[];
  granularity: "day" | "week";
  topBuckets: string[];
  showRefunds: boolean;
};

const pad = (value: number) => value.toString().padStart(2, "0");

const formatDayShort = (date: Date) =>
  `${pad(date.getUTCDate())}.${pad(date.getUTCMonth() + 1)}`;

const formatDayFull = (date: Date) =>
  `${pad(date.getUTCDate())}.${pad(date.getUTCMonth() + 1)}.${date.getUTCFullYear()}`;

const isoWeekStart = (year: number, week: number) => {
  const simple = new Date(Date.UTC(year, 0, 1 + (week - 1) * 7));
  const dayOfWeek = simple.getUTCDay() || 7;
  const start = new Date(simple);
  start.setUTCDate(simple.getUTCDate() + (1 - dayOfWeek));
  return start;
};

const formatWeekRange = (start: Date, withYear: boolean) => {
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 6);
  const startLabel = withYear ? formatDayFull(start) : formatDayShort(start);
  const endLabel = withYear ? formatDayFull(end) : formatDayShort(end);
  return `${startLabel}–${endLabel}`;
};

const parseBucketToDate = (bucket: string) => {
  const date = new Date(`${bucket}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
};

const toChartDatum = (
  item: NetRevenueSeriesPoint,
  granularity: "day" | "week",
  topBuckets: Set<string>,
): ChartDatum => {
  if (granularity === "week") {
    const match = item.bucket.match(/^(\d{4})-W(\d{2})$/);
    if (match) {
      const year = Number(match[1]);
      const week = Number(match[2]);
      const start = isoWeekStart(year, week);
      return {
        bucket: item.bucket,
        grossSales: item.gross_sales,
        refunds: item.refunds,
        netRevenue: item.net_revenue,
        label: formatWeekRange(start, false),
        tooltipLabel: formatWeekRange(start, true),
        isTop: topBuckets.has(item.bucket),
      };
    }
  }
  const parsed = parseBucketToDate(item.bucket);
  const label = parsed ? formatDayShort(parsed) : item.bucket;
  const tooltipLabel = parsed ? formatDayFull(parsed) : item.bucket;
  return {
    bucket: item.bucket,
    grossSales: item.gross_sales,
    refunds: item.refunds,
    netRevenue: item.net_revenue,
    label,
    tooltipLabel,
    isTop: topBuckets.has(item.bucket),
  };
};

const renderTooltip =
  (showRefunds: boolean) =>
  ({
    active,
    payload,
  }: {
    active?: boolean;
    payload?: Array<{ payload: ChartDatum }>;
  }) => {
    if (!active || !payload?.length) {
      return null;
    }
    const datum = payload[0].payload;
    return (
      <div className="gross-sales-chart-tooltip">
        <strong>{datum.tooltipLabel}</strong>
        <span>Net Revenue: {formatCurrencyRUB(datum.netRevenue)}</span>
        <span>Gross Sales: {formatCurrencyRUB(datum.grossSales)}</span>
        {showRefunds ? (
          <span>Refunds: {formatCurrencyRUB(datum.refunds)}</span>
        ) : null}
        {datum.isTop ? <em>Пик ❗</em> : null}
      </div>
    );
  };

const ChartBarShape = (props: {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  fill?: string;
  payload?: ChartDatum;
}) => {
  const { x = 0, y = 0, width = 0, height = 0, fill = "#2563eb", payload } = props;
  const centerX = x + width / 2;
  return (
    <g>
      <rect x={x} y={y} width={width} height={height} fill={fill} rx={6} />
      {payload?.isTop ? (
        <text x={centerX} y={y - 6} textAnchor="middle" fontSize={14}>
          ❗
        </text>
      ) : null}
    </g>
  );
};

const NetRevenueSeriesChart = ({
  points,
  granularity,
  topBuckets,
  showRefunds,
}: NetRevenueSeriesChartProps) => {
  const topBucketSet = useMemo(() => new Set(topBuckets), [topBuckets]);
  const chartData = useMemo(
    () => points.map((item) => toChartDatum(item, granularity, topBucketSet)),
    [granularity, points, topBucketSet],
  );

  const tickInterval =
    chartData.length > 16 ? Math.max(1, Math.ceil(chartData.length / 8) - 1) : 0;

  if (!points.length) {
    return <p className="helper-text">Нет данных за период.</p>;
  }

  return (
    <div className="gross-sales-chart">
      <div className="gross-sales-chart-canvas">
        <ResponsiveContainer width="100%" height={280}>
          <ComposedChart data={chartData} margin={{ top: 18, right: 16, left: 8, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="label"
              interval={tickInterval}
              tick={{ fontSize: 12 }}
              tickMargin={8}
            />
            <YAxis
              tickFormatter={(value) => formatNumber(Number(value))}
              tick={{ fontSize: 12 }}
              width={64}
              label={{ value: "₽", position: "insideLeft", offset: -6 }}
            />
            <Tooltip content={renderTooltip(showRefunds)} />
            <Bar dataKey="netRevenue" fill="#2563eb" shape={ChartBarShape} />
            <Line
              type="monotone"
              dataKey="grossSales"
              stroke="#16a34a"
              strokeWidth={2}
              dot={false}
            />
            {showRefunds ? (
              <Line
                type="monotone"
                dataKey="refunds"
                stroke="#dc2626"
                strokeWidth={2}
                dot={false}
              />
            ) : null}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default NetRevenueSeriesChart;
