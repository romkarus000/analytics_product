import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { API_BASE } from "../app/lib/api";
import { formatCurrencyRUB, formatPercent } from "../app/lib/format";
import Button from "./ui/Button";
import Skeleton from "./ui/Skeleton";
import GrossSalesSeriesChart from "./charts/GrossSalesSeriesChart";

type GrossSalesDriverItem = {
  name: string;
  current: number;
  previous: number;
  delta_abs: number;
  delta_pct: number | null;
  share_current: number;
};

type GrossSalesDriverSplit = {
  up: GrossSalesDriverItem[];
  down: GrossSalesDriverItem[];
};

type GrossSalesDetailsResponse = {
  metric: string;
  current: { value: number; from: string; to: string };
  previous: { value: number; from: string; to: string };
  change: { delta_abs: number; delta_pct: number | null };
  series_granularity: "day" | "week";
  series: Array<{ bucket: string; value: number }>;
  top_buckets: string[];
  drivers: {
    products: GrossSalesDriverSplit;
    groups: GrossSalesDriverSplit;
    managers: GrossSalesDriverSplit;
  };
  concentration: {
    top1_share: number;
    top3_share: number;
    top1_name: string | null;
    top1_value: number;
    top3_names: string[];
    top3_items: Array<{ name: string; value: number; share: number }>;
  };
  availability: { status: "available" | "partial" | "unavailable"; missing_fields: string[] };
};

type MetricDetailsModalProps = {
  open: boolean;
  onClose: () => void;
  projectId: string;
  fromDate: string;
  toDate: string;
  filters: Record<string, string>;
};

const MetricDetailsModal = ({
  open,
  onClose,
  projectId,
  fromDate,
  toDate,
  filters,
}: MetricDetailsModalProps) => {
  const router = useRouter();
  const [data, setData] = useState<GrossSalesDetailsResponse | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showPeriodHint, setShowPeriodHint] = useState(false);
  const [activeDriverTab, setActiveDriverTab] = useState<
    "products" | "groups" | "managers"
  >("products");
  const [driverMode, setDriverMode] = useState<"up" | "down">("up");
  const bodyRef = useRef<HTMLDivElement>(null);

  const filterPayload = useMemo(() => JSON.stringify(filters), [filters]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    if (!fromDate || !toDate) {
      setData(null);
      setError("");
      setShowPeriodHint(true);
      return;
    }
    setShowPeriodHint(false);
    const accessToken = localStorage.getItem("access_token");
    if (!accessToken) {
      router.push("/login");
      return;
    }
    const loadDetails = async () => {
      setIsLoading(true);
      setError("");
      try {
        const params = new URLSearchParams({ from: fromDate, to: toDate });
        if (Object.keys(filters).length > 0) {
          params.set("filters", filterPayload);
        }
        const response = await fetch(
          `${API_BASE}/projects/${projectId}/metrics/gross-sales/details?${params.toString()}`,
          {
            headers: { Authorization: `Bearer ${accessToken}` },
          },
        );
        if (response.status === 401) {
          localStorage.removeItem("access_token");
          localStorage.removeItem("refresh_token");
          router.push("/login");
          return;
        }
        const payload = (await response.json()) as GrossSalesDetailsResponse;
        if (!response.ok) {
          setError("Не удалось загрузить детали Gross Sales.");
          return;
        }
        setData(payload);
      } catch {
        setError("Ошибка сети. Попробуйте ещё раз.");
      } finally {
        setIsLoading(false);
      }
    };
    loadDetails();
  }, [filterPayload, filters, fromDate, open, projectId, router, toDate]);

  useEffect(() => {
    if (!data) {
      return;
    }
    if (
      activeDriverTab === "managers" &&
      data.availability.missing_fields.includes("manager")
    ) {
      setActiveDriverTab("products");
    }
  }, [activeDriverTab, data]);

  const insights = useMemo(() => {
    if (!data) {
      return [];
    }
    const items: Array<{ title: string; text: string; tone?: "warn" }> = [];
    const driversSource =
      data.change.delta_abs >= 0
        ? [
            ...data.drivers.products.up,
            ...data.drivers.groups.up,
            ...data.drivers.managers.up,
          ]
        : [
            ...data.drivers.products.down,
            ...data.drivers.groups.down,
            ...data.drivers.managers.down,
          ];
    const sortedDrivers = [...driversSource].sort((a, b) =>
      data.change.delta_abs >= 0 ? b.delta_abs - a.delta_abs : a.delta_abs - b.delta_abs,
    );
    const primaryDriver = sortedDrivers[0];
    if (primaryDriver) {
      items.push({
        title: "Драйвер изменения",
        text: `Основной вклад в изменение дал ${primaryDriver.name}: ${formatCurrencyRUB(
          primaryDriver.delta_abs,
        )}`,
      });
    }
    if (data.concentration.top1_share > 0.6 && data.concentration.top1_name) {
      items.push({
        title: "Риск концентрации",
        text: `Высокая концентрация: ${data.concentration.top1_name} = ${formatPercent(
          data.concentration.top1_share,
        )}`,
        tone: "warn",
      });
    }
    if (data.series.length >= 5 && data.current.value > 0) {
      const topSum = data.top_buckets.reduce((sum, bucket) => {
        const match = data.series.find((item) => item.bucket === bucket);
        return sum + (match?.value ?? 0);
      }, 0);
      const share = topSum / data.current.value;
      if (share > 0) {
        items.push({
          title: "Пиковые периоды",
          text: `Топ-5 ${
            data.series_granularity === "week" ? "недель" : "дней"
          } дали ${formatPercent(share)} выручки периода`,
        });
      }
    }
    return items;
  }, [data]);

  if (!open) {
    return null;
  }

  const handlePreserveScroll = (callback: () => void) => {
    const currentScroll = bodyRef.current?.scrollTop ?? 0;
    callback();
    requestAnimationFrame(() => {
      if (bodyRef.current) {
        bodyRef.current.scrollTop = currentScroll;
      }
    });
  };

  const driverTabs = [
    { key: "products" as const, label: "Продукты" },
    { key: "groups" as const, label: "Группы" },
    { key: "managers" as const, label: "Менеджеры" },
  ];
  const managerUnavailable = data?.availability.missing_fields.includes("manager") ?? false;
  const activeDrivers =
    data?.drivers[activeDriverTab]?.[driverMode] ?? [];

  const periodLabel = data
    ? `Текущий период: ${data.current.from} — ${data.current.to} vs Предыдущий период: ${data.previous.from} — ${data.previous.to}`
    : "";
  const deltaSign = data ? (data.change.delta_abs >= 0 ? "+" : "−") : "";
  const deltaFormatted = data
    ? `${deltaSign}${formatCurrencyRUB(Math.abs(data.change.delta_abs))}`
    : "";

  const renderDriverTable = (items: GrossSalesDriverItem[]) => {
    if (!items.length) {
      return (
        <p className="helper-text">
          {driverMode === "down"
            ? "Нет срезов, которые снижали Gross Sales в выбранном периоде."
            : "Нет срезов, которые повышали Gross Sales в выбранном периоде."}
        </p>
      );
    }
    return (
      <table className="data-table compact">
        <thead>
          <tr>
            <th>Срез</th>
            <th>Текущая</th>
            <th>Δ</th>
            <th>Доля</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const deltaSignItem = item.delta_abs > 0 ? "+" : item.delta_abs < 0 ? "−" : "";
            return (
              <tr key={item.name}>
                <td className="metric-name-cell">
                  <span title={item.name}>{item.name}</span>
                </td>
                <td>{formatCurrencyRUB(item.current)}</td>
                <td className={item.delta_abs >= 0 ? "positive" : "negative"}>
                  {deltaSignItem}
                  {formatCurrencyRUB(Math.abs(item.delta_abs))}
                </td>
                <td>{formatPercent(item.share_current)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    );
  };

  return (
    <div className="metric-modal-overlay" role="dialog" aria-modal="true">
      <div className="metric-modal-backdrop" onClick={onClose} />
      <div className="metric-modal">
        <header className="metric-modal-header">
          <div>
            <h3>Gross Sales</h3>
          </div>
          <button type="button" className="metric-modal-close" onClick={onClose}>
            ×
          </button>
        </header>

        <div className="metric-modal-body" ref={bodyRef}>
          {showPeriodHint ? (
            <div className="empty-state compact">
              <strong>Gross Sales</strong>
              <p className="helper-text">Выберите период в фильтрах…</p>
            </div>
          ) : isLoading ? (
            <div className="metric-modal-body-content">
              <Skeleton height={24} width={200} />
              <Skeleton height={32} width={260} />
              <Skeleton height={140} />
              <Skeleton height={200} />
            </div>
          ) : error ? (
            <div className="metric-modal-body-content">
              <p className="helper-text">{error}</p>
              <Button variant="secondary" size="sm" onClick={onClose}>
                Закрыть
              </Button>
            </div>
          ) : data ? (
            <div className="metric-modal-body-content">
              <section className="metric-section">
                <div className="metric-compare">
                  <div className="metric-compare-header">
                    <h4>Сравнение периодов</h4>
                    <p className="helper-text">{periodLabel}</p>
                  </div>
                  <div className="metric-compare-values">
                    <div>
                      <span className="kpi-label">Gross Sales</span>
                      <strong>{formatCurrencyRUB(data.current.value)}</strong>
                    </div>
                    <div>
                      <span className="kpi-label">Δ</span>
                      <strong className={data.change.delta_abs >= 0 ? "positive" : "negative"}>
                        {deltaFormatted}
                      </strong>
                      <span className="helper-text">({formatPercent(data.change.delta_pct)})</span>
                    </div>
                  </div>
                  <span className="helper-text">Δ = текущий − предыдущий</span>
                </div>
              </section>

              <section className="metric-section">
                <div className="metric-highlight-card">
                  <span className="kpi-label">Итог к прошлому периоду</span>
                  <strong className={data.change.delta_abs >= 0 ? "positive" : "negative"}>
                    {deltaFormatted} ({formatPercent(data.change.delta_pct)})
                  </strong>
                </div>
              </section>

              <section className="metric-section">
                <div className="gross-sales-chart-header">
                  <div>
                    <h4>Динамика</h4>
                    <span className="gross-sales-chart-subtitle">
                      {data.series_granularity === "week" ? "По неделям" : "По дням"}
                    </span>
                  </div>
                </div>
                <GrossSalesSeriesChart
                  series={data.series}
                  granularity={data.series_granularity}
                  currency="RUB"
                />
              </section>

              <section className="metric-section">
                <div className="metric-drivers-header">
                  <h4>Драйверы изменения</h4>
                  <div className="metric-drivers-tabs">
                    {driverTabs.map((tab) => {
                      const isDisabled = tab.key === "managers" && managerUnavailable;
                      return (
                        <button
                          key={tab.key}
                          type="button"
                          className={`tab-button ${activeDriverTab === tab.key ? "active" : ""}`}
                          onClick={() =>
                            handlePreserveScroll(() => setActiveDriverTab(tab.key))
                          }
                          disabled={isDisabled}
                          title={isDisabled ? "Нет данных менеджера" : undefined}
                        >
                          {tab.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="metric-segmented">
                  <button
                    type="button"
                    className={driverMode === "up" ? "active" : ""}
                    onClick={() =>
                      handlePreserveScroll(() => setDriverMode("up"))
                    }
                  >
                    Вклад в рост
                  </button>
                  <button
                    type="button"
                    className={driverMode === "down" ? "active" : ""}
                    onClick={() =>
                      handlePreserveScroll(() => setDriverMode("down"))
                    }
                  >
                    Вклад в падение
                  </button>
                </div>
                <div className="metric-drivers-help">
                  <span>Текущая — сумма Gross Sales в текущем периоде</span>
                  <span>Δ — разница (текущая − предыдущая) по этому срезу</span>
                  <span>Доля — текущая / общий Gross Sales текущего периода</span>
                </div>
                {renderDriverTable(activeDrivers)}
              </section>

              <section className="metric-section">
                <h4>Концентрация</h4>
                <p className="helper-text">
                  Концентрация показывает зависимость от 1–3 продуктов.
                </p>
                <div className="metric-concentration-cards">
                  <div className="metric-card">
                    <span className="kpi-label">Топ-1 продукт</span>
                    <strong>{data.concentration.top1_name ?? "—"}</strong>
                    <span className="helper-text">
                      {formatPercent(data.concentration.top1_share)} ·{" "}
                      {formatCurrencyRUB(data.concentration.top1_value)}
                    </span>
                  </div>
                  <div className="metric-card">
                    <span className="kpi-label">Топ-3 продукта</span>
                    <div className="metric-top3-list">
                      {data.concentration.top3_items.length ? (
                        data.concentration.top3_items.map((item) => (
                          <div key={item.name} className="metric-top3-item">
                            <span title={item.name}>{item.name}</span>
                            <span>{formatPercent(item.share)}</span>
                          </div>
                        ))
                      ) : (
                        <span>—</span>
                      )}
                    </div>
                  </div>
                </div>
              </section>

              <section className="metric-section">
                <h4>Insights</h4>
                {insights.length ? (
                  <div className="metric-insights">
                    {insights.map((insight, index) => (
                      <div
                        key={`${insight.title}-${index}`}
                        className={`metric-insight ${insight.tone === "warn" ? "warn" : ""}`}
                      >
                        <strong>{insight.title}</strong>
                        <p>{insight.text}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="helper-text">Пока нет инсайтов за выбранный период.</p>
                )}
              </section>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default MetricDetailsModal;
