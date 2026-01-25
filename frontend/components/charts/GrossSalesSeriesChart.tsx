"use client";

import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { formatCurrencyRUB, formatNumber } from "../../app/lib/format";

type GrossSalesSeriesItem = {
  bucket: string;
  value: number;
};

type ChartDatum = {
  bucket: string;
  value: number;
  label: string;
  tooltipLabel: string;
  topLabel: string;
  isTop: boolean;
};

type GrossSalesSeriesChartProps = {
  series: GrossSalesSeriesItem[];
  granularity: "day" | "week";
  currency: "RUB";
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
  item: GrossSalesSeriesItem,
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
        value: item.value,
        label: formatWeekRange(start, false),
        tooltipLabel: formatWeekRange(start, true),
        topLabel: "Топ-5 неделя 🔥",
        isTop: topBuckets.has(item.bucket),
      };
    }
  }
  const parsed = parseBucketToDate(item.bucket);
  const label = parsed ? formatDayShort(parsed) : item.bucket;
  const tooltipLabel = parsed ? formatDayFull(parsed) : item.bucket;
  return {
    bucket: item.bucket,
    value: item.value,
    label,
    tooltipLabel,
    topLabel: "Топ-5 день 🔥",
    isTop: topBuckets.has(item.bucket),
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
      <span>{formatCurrencyRUB(datum.value)}</span>
      {datum.isTop ? <em>{datum.topLabel}</em> : null}
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
          🔥
        </text>
      ) : null}
    </g>
  );
};

const GrossSalesSeriesChart = ({
  series,
  granularity,
  currency,
}: GrossSalesSeriesChartProps) => {
  const currencyLabel = currency === "RUB" ? "₽" : currency;
  const topBuckets = useMemo(() => {
    if (!series.length) {
      return new Set<string>();
    }
    const sorted = [...series].sort((a, b) => b.value - a.value);
    return new Set(sorted.slice(0, Math.min(5, sorted.length)).map((item) => item.bucket));
  }, [series]);

  const chartData = useMemo(
    () => series.map((item) => toChartDatum(item, granularity, topBuckets)),
    [granularity, series, topBuckets],
  );

  const summary = useMemo(() => {
    if (!series.length) {
      return null;
    }
    const total = series.reduce((sum, item) => sum + item.value, 0);
    const best = series.reduce((acc, item) => (item.value > acc.value ? item : acc), series[0]);
    const bestDatum = toChartDatum(best, granularity, topBuckets);
    return {
      bestLabel: bestDatum.tooltipLabel,
      bestValue: best.value,
      average: total / series.length,
    };
  }, [granularity, series, topBuckets]);

  const tickInterval =
    chartData.length > 16 ? Math.max(1, Math.ceil(chartData.length / 8) - 1) : 0;

  if (!series.length) {
    return <p className="helper-text">Нет данных за выбранный период.</p>;
  }

  return (
    <div className="gross-sales-chart">
      <div className="gross-sales-chart-canvas">
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={chartData} margin={{ top: 18, right: 16, left: 8, bottom: 8 }}>
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
              label={{ value: currencyLabel, position: "insideLeft", offset: -6 }}
            />
            <Tooltip content={renderTooltip} />
            <Bar dataKey="value" fill="#2563eb" shape={ChartBarShape} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      {summary ? (
        <div className="gross-sales-chart-summary">
          <span>
            Лучший {granularity === "week" ? "период" : "день"}: {summary.bestLabel} —{" "}
            {formatCurrencyRUB(summary.bestValue)}
          </span>
          <span>
            Среднее за {granularity === "week" ? "неделю" : "день"}:{" "}
            {formatCurrencyRUB(summary.average)}
          </span>
        </div>
      ) : null}
    </div>
  );
};

export default GrossSalesSeriesChart;
