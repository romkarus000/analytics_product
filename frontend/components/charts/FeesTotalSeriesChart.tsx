"use client";

import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { formatCurrencyRUB, formatPercent } from "../../app/lib/format";

type FeesTotalSeriesPoint = {
  bucket: string;
  fees_total: number;
  fee_share: number;
};

type ChartDatum = {
  bucket: string;
  label: string;
  tooltipLabel: string;
  feesTotal: number;
  feeShare: number;
  marker: string | null;
};

type FeesTotalSeriesChartProps = {
  series: FeesTotalSeriesPoint[];
  granularity: "day" | "week";
  topBuckets: string[];
  anomalies: string[];
  mode: "fees" | "share";
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
  item: FeesTotalSeriesPoint,
  granularity: "day" | "week",
  topBuckets: Set<string>,
  anomalies: Set<string>,
): ChartDatum => {
  let label = item.bucket;
  let tooltipLabel = item.bucket;
  if (granularity === "week") {
    const match = item.bucket.match(/^(\d{4})-W(\d{2})$/);
    if (match) {
      const year = Number(match[1]);
      const week = Number(match[2]);
      const start = isoWeekStart(year, week);
      label = formatWeekRange(start, false);
      tooltipLabel = formatWeekRange(start, true);
    }
  } else {
    const parsed = parseBucketToDate(item.bucket);
    if (parsed) {
      label = formatDayShort(parsed);
      tooltipLabel = formatDayFull(parsed);
    }
  }
  const marker = `${topBuckets.has(item.bucket) ? "🔥" : ""}${
    anomalies.has(item.bucket) ? "❗" : ""
  }`;
  return {
    bucket: item.bucket,
    label,
    tooltipLabel,
    feesTotal: item.fees_total,
    feeShare: item.fee_share,
    marker: marker.length ? marker : null,
  };
};

const renderTooltip = ({
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
      <span>{formatCurrencyRUB(datum.feesTotal)}</span>
      <span>Fee Share: {formatPercent(datum.feeShare)}</span>
      {datum.marker ? <em>Маркер {datum.marker}</em> : null}
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
  const { x = 0, y = 0, width = 0, height = 0, fill = "#0ea5e9", payload } = props;
  const centerX = x + width / 2;
  return (
    <g>
      <rect x={x} y={y} width={width} height={height} fill={fill} rx={6} />
      {payload?.marker ? (
        <text x={centerX} y={y - 6} textAnchor="middle" fontSize={14}>
          {payload.marker}
        </text>
      ) : null}
    </g>
  );
};

const ChartDot = (props: {
  cx?: number;
  cy?: number;
  payload?: ChartDatum;
}) => {
  const { cx = 0, cy = 0, payload } = props;
  if (!payload) {
    return null;
  }
  return (
    <g>
      <circle cx={cx} cy={cy} r={4} fill="#0ea5e9" />
      {payload.marker ? (
        <text x={cx} y={cy - 10} textAnchor="middle" fontSize={14}>
          {payload.marker}
        </text>
      ) : null}
    </g>
  );
};

const FeesTotalSeriesChart = ({
  series,
  granularity,
  topBuckets,
  anomalies,
  mode,
}: FeesTotalSeriesChartProps) => {
  const topSet = useMemo(() => new Set(topBuckets), [topBuckets]);
  const anomalySet = useMemo(() => new Set(anomalies), [anomalies]);

  const chartData = useMemo(
    () => series.map((item) => toChartDatum(item, granularity, topSet, anomalySet)),
    [anomalySet, granularity, series, topSet],
  );

  const tickInterval =
    chartData.length > 16 ? Math.max(1, Math.ceil(chartData.length / 8) - 1) : 0;

  if (!series.length) {
    return <p className="helper-text">Нет данных за выбранный период.</p>;
  }

  return (
    <div className="gross-sales-chart">
      <div className="gross-sales-chart-canvas">
        <ResponsiveContainer width="100%" height={280}>
          {mode === "fees" ? (
            <BarChart data={chartData} margin={{ top: 18, right: 16, left: 8, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="label"
                interval={tickInterval}
                tick={{ fontSize: 12 }}
                tickMargin={8}
              />
              <YAxis
                tickFormatter={(value) => formatCurrencyRUB(Number(value))}
                tick={{ fontSize: 12 }}
                width={72}
                label={{ value: "₽", position: "insideLeft", offset: -6 }}
              />
              <Tooltip content={renderTooltip} />
              <Bar dataKey="feesTotal" fill="#0ea5e9" shape={ChartBarShape} />
            </BarChart>
          ) : (
            <LineChart data={chartData} margin={{ top: 18, right: 16, left: 8, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="label"
                interval={tickInterval}
                tick={{ fontSize: 12 }}
                tickMargin={8}
              />
              <YAxis
                tickFormatter={(value) => formatPercent(Number(value))}
                tick={{ fontSize: 12 }}
                width={72}
                label={{ value: "%", position: "insideLeft", offset: -6 }}
              />
              <Tooltip content={renderTooltip} />
              <Line
                type="monotone"
                dataKey="feeShare"
                stroke="#0ea5e9"
                strokeWidth={2}
                dot={<ChartDot />}
              />
            </LineChart>
          )}
        </ResponsiveContainer>
      </div>
      <div className="metric-chart-legend">
        <span className="metric-legend-item">🔥 топ-5 периодов</span>
        <span className="metric-legend-item">❗ аномалии</span>
      </div>
    </div>
  );
};

export default FeesTotalSeriesChart;
