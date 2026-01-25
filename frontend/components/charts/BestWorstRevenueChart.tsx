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

type BestWorstSeriesItem = {
  date: string;
  revenue: number;
};

type ChartDatum = {
  bucket: string;
  value: number;
  label: string;
  tooltipLabel: string;
  isBest: boolean;
  isWorst: boolean;
};

type BestWorstRevenueChartProps = {
  series: BestWorstSeriesItem[];
  bestDate: string | null;
  worstDate: string | null;
  granularity: "day" | "week";
};

const pad = (value: number) => value.toString().padStart(2, "0");

const formatDayLabel = (date: Date) =>
  `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;

const isoWeekStart = (year: number, week: number) => {
  const simple = new Date(Date.UTC(year, 0, 1 + (week - 1) * 7));
  const dayOfWeek = simple.getUTCDay() || 7;
  const start = new Date(simple);
  start.setUTCDate(simple.getUTCDate() + (1 - dayOfWeek));
  return start;
};

const getIsoWeek = (date: Date) => {
  const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((target.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return { year: target.getUTCFullYear(), week };
};

const formatWeekRange = (start: Date) => {
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 6);
  return `${formatDayLabel(start)}–${formatDayLabel(end)}`;
};

const toWeekBucket = (date: Date) => {
  const { year, week } = getIsoWeek(date);
  return `${year}-W${pad(week)}`;
};

const parseDate = (date: string) => new Date(`${date}T00:00:00Z`);

const buildChartData = (
  series: BestWorstSeriesItem[],
  bestDate: string | null,
  worstDate: string | null,
  granularity: "day" | "week",
) => {
  if (granularity === "day") {
    return series.map((item) => ({
      bucket: item.date,
      value: item.revenue,
      label: item.date,
      tooltipLabel: item.date,
      isBest: bestDate === item.date,
      isWorst: worstDate === item.date,
    }));
  }

  const bucketMap = new Map<string, { value: number; start: Date }>();
  series.forEach((item) => {
    const date = parseDate(item.date);
    const bucket = toWeekBucket(date);
    const existing = bucketMap.get(bucket);
    if (existing) {
      existing.value += item.revenue;
    } else {
      const { year, week } = getIsoWeek(date);
      bucketMap.set(bucket, { value: item.revenue, start: isoWeekStart(year, week) });
    }
  });

  const bestBucket = bestDate ? toWeekBucket(parseDate(bestDate)) : null;
  const worstBucket = worstDate ? toWeekBucket(parseDate(worstDate)) : null;

  return Array.from(bucketMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([bucket, payload]) => ({
      bucket,
      value: payload.value,
      label: formatWeekRange(payload.start),
      tooltipLabel: formatWeekRange(payload.start),
      isBest: bestBucket === bucket,
      isWorst: worstBucket === bucket,
    }));
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
    <div className="best-worst-chart-tooltip">
      <strong>{datum.tooltipLabel}</strong>
      <span>{formatCurrencyRUB(datum.value)}</span>
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
  const marker =
    payload?.isBest && payload?.isWorst
      ? "🔥❗"
      : payload?.isBest
        ? "🔥"
        : payload?.isWorst
          ? "❗"
          : "";
  return (
    <g>
      <rect x={x} y={y} width={width} height={height} fill={fill} rx={6} />
      {marker ? (
        <text x={centerX} y={y - 6} textAnchor="middle" fontSize={14}>
          {marker}
        </text>
      ) : null}
    </g>
  );
};

const BestWorstRevenueChart = ({
  series,
  bestDate,
  worstDate,
  granularity,
}: BestWorstRevenueChartProps) => {
  const chartData = useMemo(
    () => buildChartData(series, bestDate, worstDate, granularity),
    [series, bestDate, worstDate, granularity],
  );

  const tickInterval =
    chartData.length > 16 ? Math.max(1, Math.ceil(chartData.length / 8) - 1) : 0;

  if (!series.length) {
    return <p className="helper-text">Нет данных за выбранный период.</p>;
  }

  return (
    <div className="best-worst-chart">
      <div className="best-worst-chart-canvas">
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
              width={72}
              label={{ value: "₽", position: "insideLeft", offset: -6 }}
            />
            <Tooltip content={renderTooltip} />
            <Bar dataKey="value" fill="#2563eb" shape={ChartBarShape} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default BestWorstRevenueChart;
