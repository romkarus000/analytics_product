import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { API_BASE } from "../app/lib/api";
import { formatCurrencyRUB, formatNumber, formatPercent } from "../app/lib/format";
import Button from "./ui/Button";
import Skeleton from "./ui/Skeleton";
import BestWorstRevenueChart from "./charts/BestWorstRevenueChart";

type BestWorstDriverItem = {
  name: string;
  revenue: number;
  share: number;
  delta_abs: number;
  delta_pct: number | null;
};

type BestWorstDrivers = {
  products: BestWorstDriverItem[];
  groups: BestWorstDriverItem[];
  managers: BestWorstDriverItem[];
};

type BestWorstDay = {
  date: string;
  revenue: number;
  orders: number;
  drivers: BestWorstDrivers;
};

type BestWorstResponse = {
  period: {
    from: string;
    to: string;
    total_revenue: number;
    days_count: number;
    avg_day_revenue: number;
  };
  series: Array<{ date: string; revenue: number; orders: number }>;
  best: BestWorstDay | null;
  worst: BestWorstDay | null;
  availability: { missing_fields: string[] };
};

type BestWorstDayDetailsModalProps = {
  open: boolean;
  onClose: () => void;
  projectId: string;
  fromDate: string;
  toDate: string;
  filters: Record<string, string>;
  mode: "best" | "worst";
};

const CONCENTRATION_WARN = 0.35;

const BestWorstDayDetailsModal = ({
  open,
  onClose,
  projectId,
  fromDate,
  toDate,
  filters,
  mode,
}: BestWorstDayDetailsModalProps) => {
  const router = useRouter();
  const [data, setData] = useState<BestWorstResponse | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showPeriodHint, setShowPeriodHint] = useState(false);
  const [activeDriverTab, setActiveDriverTab] = useState<"products" | "groups" | "managers">(
    "products",
  );
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
          `${API_BASE}/projects/${projectId}/metrics/best-worst-days?${params.toString()}`,
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
        const payload = (await response.json()) as BestWorstResponse;
        if (!response.ok) {
          setError("Не удалось загрузить детали дня.");
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
    if (activeDriverTab === "managers" && data.availability.missing_fields.includes("manager")) {
      setActiveDriverTab("products");
    }
  }, [activeDriverTab, data]);

  const handlePreserveScroll = (callback: () => void) => {
    const currentScroll = bodyRef.current?.scrollTop ?? 0;
    callback();
    requestAnimationFrame(() => {
      if (bodyRef.current) {
        bodyRef.current.scrollTop = currentScroll;
      }
    });
  };

  const dayDetails = data ? (mode === "best" ? data.best : data.worst) : null;
  const avgDayRevenue = data?.period.avg_day_revenue ?? 0;
  const deltaAbs = dayDetails ? dayDetails.revenue - avgDayRevenue : 0;
  const deltaPct = avgDayRevenue ? deltaAbs / avgDayRevenue : null;
  const shareOfPeriod =
    data && dayDetails && data.period.total_revenue
      ? dayDetails.revenue / data.period.total_revenue
      : null;
  const avgCheck =
    dayDetails && dayDetails.orders > 0 ? dayDetails.revenue / dayDetails.orders : null;

  const formatSignedCurrency = (value: number) => {
    const sign = value > 0 ? "+" : value < 0 ? "−" : "";
    return `${sign}${formatCurrencyRUB(Math.abs(value))}`;
  };

  const chartGranularity =
    data && data.period.days_count > 31 ? ("week" as const) : ("day" as const);

  const driverTabs = [
    { key: "products" as const, label: "Продукты" },
    { key: "groups" as const, label: "Группы" },
    { key: "managers" as const, label: "Менеджеры" },
  ];
  const managerUnavailable = data?.availability.missing_fields.includes("manager") ?? false;
  const activeDrivers = dayDetails?.drivers[activeDriverTab] ?? [];

  const productDrivers = dayDetails?.drivers.products ?? [];
  const topProducts = productDrivers.slice(0, 3);
  const top1Product = productDrivers[0];
  const top1Share = top1Product?.share ?? 0;
  const top3Share = topProducts.reduce((sum, item) => sum + item.share, 0);

  const insightLines = useMemo(() => {
    if (!dayDetails) {
      return [] as string[];
    }
    const lines: string[] = [];
    if (top1Product) {
      lines.push(
        `🔥 Основной вклад дал ${top1Product.name}: ${formatCurrencyRUB(
          top1Product.revenue,
        )} (${formatPercent(top1Product.share)})`,
      );
    }
    if (mode === "best") {
      lines.push(
        `День выше среднего на ${formatPercent(deltaPct)} (${formatSignedCurrency(
          deltaAbs,
        )})`,
      );
      if (top1Share > CONCENTRATION_WARN) {
        lines.push("❗ Высокая концентрация на одном продукте");
      }
    } else {
      lines.push(
        `❗ День ниже среднего на ${formatPercent(deltaPct)} (${formatSignedCurrency(
          deltaAbs,
        )})`,
      );
      if (dayDetails.revenue <= 0 || dayDetails.orders === 0) {
        lines.push("❗ Возможен сбой данных или отсутствие продаж");
      }
      if (top1Share > CONCENTRATION_WARN) {
        lines.push("❗ Высокая концентрация на одном продукте");
      }
    }
    return lines;
  }, [dayDetails, deltaAbs, deltaPct, formatSignedCurrency, mode, top1Product, top1Share]);

  if (!open) {
    return null;
  }

  const renderDriverTable = (items: BestWorstDriverItem[]) => {
    if (!items.length) {
      return <p className="helper-text">Нет данных по выбранному дню.</p>;
    }
    return (
      <table className="data-table compact">
        <thead>
          <tr>
            <th>Срез</th>
            <th>Revenue, ₽</th>
            <th>Доля</th>
            <th>Δ vs avg</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const deltaSign = item.delta_abs > 0 ? "+" : item.delta_abs < 0 ? "−" : "";
            return (
              <tr key={item.name}>
                <td className="metric-name-cell">
                  <span title={item.name}>{item.name}</span>
                </td>
                <td>{formatCurrencyRUB(item.revenue)}</td>
                <td>{formatPercent(item.share)}</td>
                <td className={item.delta_abs >= 0 ? "positive" : "negative"}>
                  {deltaSign}
                  {formatCurrencyRUB(Math.abs(item.delta_abs))} ({formatPercent(item.delta_pct)})
                </td>
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
            <h3>{mode === "best" ? "Best Day Revenue" : "Worst Day Revenue"}</h3>
            <p className="helper-text">
              {mode === "best"
                ? "Лучший день по выручке в периоде"
                : "Худший день по выручке в периоде"}
            </p>
          </div>
          <button type="button" className="metric-modal-close" onClick={onClose}>
            ×
          </button>
        </header>

        <div className="metric-modal-body" ref={bodyRef}>
          {showPeriodHint ? (
            <div className="empty-state compact">
              <strong>Выберите период, чтобы показать детали</strong>
            </div>
          ) : isLoading ? (
            <div className="metric-modal-body-content">
              <Skeleton height={24} width={220} />
              <Skeleton height={160} />
              <Skeleton height={200} />
            </div>
          ) : error ? (
            <div className="metric-modal-body-content">
              <p className="helper-text">{error}</p>
              <Button variant="secondary" size="sm" onClick={onClose}>
                Закрыть
              </Button>
            </div>
          ) : data && dayDetails ? (
            <div className="metric-modal-body-content">
              <section className="metric-section">
                <div className="kpi-grid">
                  <div className="metric-card">
                    <span className="kpi-label">Дата</span>
                    <strong>{dayDetails.date}</strong>
                  </div>
                  <div className="metric-card">
                    <span className="kpi-label">Revenue дня, ₽</span>
                    <strong>{formatCurrencyRUB(dayDetails.revenue)}</strong>
                  </div>
                  <div className="metric-card">
                    <span className="kpi-label">Δ к среднему дню</span>
                    <strong className={deltaAbs >= 0 ? "positive" : "negative"}>
                      {formatSignedCurrency(deltaAbs)} ({formatPercent(deltaPct)})
                    </strong>
                  </div>
                  <div className="metric-card">
                    <span className="kpi-label">Доля периода</span>
                    <strong>{formatPercent(shareOfPeriod)}</strong>
                  </div>
                  <div className="metric-card">
                    <span className="kpi-label">Orders дня, шт</span>
                    <strong>{formatNumber(dayDetails.orders)}</strong>
                  </div>
                  <div className="metric-card">
                    <span className="kpi-label">Avg чек дня, ₽</span>
                    <strong>{formatCurrencyRUB(avgCheck)}</strong>
                  </div>
                </div>
              </section>

              <section className="metric-section">
                <div className="metric-drivers-header">
                  <div>
                    <h4>Динамика</h4>
                    <p className="helper-text">
                      {chartGranularity === "week" ? "По неделям" : "По дням"}
                    </p>
                  </div>
                </div>
                <BestWorstRevenueChart
                  series={data.series}
                  bestDate={data.best?.date ?? null}
                  worstDate={data.worst?.date ?? null}
                  granularity={chartGranularity}
                />
              </section>

              <section className="metric-section">
                <div className="metric-drivers-header">
                  <h4>Драйверы дня</h4>
                  <div className="metric-drivers-tabs">
                    {driverTabs.map((tab) => {
                      const isDisabled = tab.key === "managers" && managerUnavailable;
                      return (
                        <button
                          key={tab.key}
                          type="button"
                          className={`tab-button ${activeDriverTab === tab.key ? "active" : ""}`}
                          onClick={() => handlePreserveScroll(() => setActiveDriverTab(tab.key))}
                          disabled={isDisabled}
                          title={isDisabled ? "Нет данных менеджера" : undefined}
                        >
                          {tab.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
                {renderDriverTable(activeDrivers)}
              </section>

              <section className="metric-section">
                <h4>Концентрация</h4>
                <div className="metric-concentration-cards">
                  <div className="metric-card">
                    <span className="kpi-label">Top-1 share</span>
                    <strong>{formatPercent(top1Share)}</strong>
                    <span className="helper-text">
                      {top1Product ? `${top1Product.name} · ${formatCurrencyRUB(top1Product.revenue)}` : "—"}
                    </span>
                  </div>
                  <div className="metric-card">
                    <span className="kpi-label">Top-3 share</span>
                    <strong>{formatPercent(top3Share)}</strong>
                    <span className="helper-text">
                      {topProducts.length ? topProducts.map((item) => item.name).join(", ") : "—"}
                    </span>
                  </div>
                </div>
              </section>

              <section className="metric-section">
                <h4>Insights</h4>
                {insightLines.length ? (
                  <div className="metric-insights">
                    {insightLines.map((line, index) => (
                      <div key={`${line}-${index}`} className="metric-insight">
                        <p>{line}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="helper-text">Пока нет инсайтов за выбранный период.</p>
                )}
              </section>
            </div>
          ) : (
            <div className="metric-modal-body-content">
              <p className="helper-text">Нет данных за выбранный период.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default BestWorstDayDetailsModal;
