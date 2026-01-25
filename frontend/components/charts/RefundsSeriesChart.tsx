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

import { formatCurrencyRUB, formatNumber, formatPercent } from "../../app/lib/format";

type RefundsSeriesItem = {
  bucket: string;
  value: number;
};

type ChartDatum = {
  bucket: string;
  value: number;
  refunds: number;
  refundRate: number | null;
  label: string;
  tooltipLabel: string;
  isTop: boolean;
};

type RefundsSeriesChartProps = {
  seriesRefunds: RefundsSeriesItem[];
  seriesRefundRate: RefundsSeriesItem[];
  granularity: "day" | "week";
  topBuckets: string[];
  mode: "amount" | "rate";
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
  bucket: string,
  refunds: number,
  refundRate: number | null,
  granularity: "day" | "week",
  topBuckets: Set<string>,
  mode: "amount" | "rate",
): ChartDatum => {
  if (granularity === "week") {
    const match = bucket.match(/^(\d{4})-W(\d{2})$/);
    if (match) {
      const year = Number(match[1]);
      const week = Number(match[2]);
      const start = isoWeekStart(year, week);
      return {
        bucket,
        refunds,
        refundRate,
        value: mode === "rate" ? refundRate ?? 0 : refunds,
        label: formatWeekRange(start, false),
        tooltipLabel: formatWeekRange(start, true),
        isTop: topBuckets.has(bucket),
      };
    }
  }
  const parsed = parseBucketToDate(bucket);
  const label = parsed ? formatDayShort(parsed) : bucket;
  const tooltipLabel = parsed ? formatDayFull(parsed) : bucket;
  return {
    bucket,
    refunds,
    refundRate,
    value: mode === "rate" ? refundRate ?? 0 : refunds,
    label,
    tooltipLabel,
    isTop: topBuckets.has(bucket),
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
      <span>{formatCurrencyRUB(datum.refunds)}</span>
      <span>
        Refund rate:{" "}
        {datum.refundRate === null ? "—" : formatPercent(datum.refundRate / 100)}
      </span>
      {datum.isTop ? <em>Пик возвратов ❗</em> : null}
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

const RefundsSeriesChart = ({
  seriesRefunds,
  seriesRefundRate,
  granularity,
  topBuckets,
  mode,
}: RefundsSeriesChartProps) => {
  const topBucketSet = useMemo(() => new Set(topBuckets), [topBuckets]);
  const refundRateMap = useMemo(() => {
    const map = new Map<string, number>();
    seriesRefundRate.forEach((item) => map.set(item.bucket, item.value));
    return map;
  }, [seriesRefundRate]);

  const chartData = useMemo(
    () =>
      seriesRefunds.map((item) =>
        toChartDatum(
          item.bucket,
          item.value,
          refundRateMap.get(item.bucket) ?? null,
          granularity,
          topBucketSet,
          mode,
        ),
      ),
    [granularity, mode, refundRateMap, seriesRefunds, topBucketSet],
  );

  const tickInterval =
    chartData.length > 16 ? Math.max(1, Math.ceil(chartData.length / 8) - 1) : 0;

  if (!seriesRefunds.length) {
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
              tickFormatter={(value) =>
                mode === "rate"
                  ? `${formatNumber(Number(value))}%`
                  : formatNumber(Number(value))
              }
              tick={{ fontSize: 12 }}
              width={64}
              label={{ value: mode === "rate" ? "%" : "₽", position: "insideLeft", offset: -6 }}
            />
            <Tooltip content={renderTooltip} />
            <Bar dataKey="value" fill="#2563eb" shape={ChartBarShape} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default RefundsSeriesChart;
