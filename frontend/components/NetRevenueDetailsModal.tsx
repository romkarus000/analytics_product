import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { API_BASE } from "../app/lib/api";
import { formatCurrencyRUB, formatPercent } from "../app/lib/format";
import Button from "./ui/Button";
import Skeleton from "./ui/Skeleton";
import Tooltip from "./ui/Tooltip";
import NetRevenueSeriesChart from "./charts/NetRevenueSeriesChart";

type NetRevenueDetailsResponse = {
  periods: {
    current: { from: string; to: string };
    previous: { from: string; to: string };
  };
  totals: {
    gross_sales_current: number;
    gross_sales_previous: number;
    refunds_current: number;
    refunds_previous: number;
    net_revenue_current: number;
    net_revenue_previous: number;
    delta_abs: number;
    delta_pct: number | null;
    refunds_share_of_gross_current: number | null;
    refunds_share_of_gross_previous: number | null;
    refunds_share_delta_pp: number | null;
  };
  series: {
    granularity: "day" | "week";
    points: Array<{
      bucket: string;
      gross_sales: number;
      refunds: number;
      net_revenue: number;
    }>;
    top_buckets_net_revenue: string[];
  };
  drivers: {
    products_top10: Array<{ name: string; current_net_revenue: number; delta: number; share: number }>;
    groups_top10: Array<{ name: string; current_net_revenue: number; delta: number; share: number }>;
    managers_top10: Array<{ name: string; current_net_revenue: number; delta: number; share: number }>;
  };
  net_vs_gross_refunds_top10: Array<{
    product_name: string;
    gross_sales: number;
    refunds: number;
    net_revenue: number;
    refund_rate_percent: number | null;
  }>;
  payment_methods: Array<{
    payment_method: string;
    gross_sales: number;
    refunds: number;
    net_revenue: number;
    refund_rate_percent: number | null;
  }>;
  signals: Array<{ type: string; title: string; message: string; severity?: string | null }>;
};

type NetRevenueDetailsModalProps = {
  open: boolean;
  onClose: () => void;
  projectId: string;
  fromDate: string;
  toDate: string;
  filters: Record<string, string>;
};

const NetRevenueDetailsModal = ({
  open,
  onClose,
  projectId,
  fromDate,
  toDate,
  filters,
}: NetRevenueDetailsModalProps) => {
  const router = useRouter();
  const [data, setData] = useState<NetRevenueDetailsResponse | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showPeriodHint, setShowPeriodHint] = useState(false);
  const [activeDriverTab, setActiveDriverTab] = useState<
    "products_top10" | "groups_top10" | "managers_top10"
  >("products_top10");
  const [driverSort, setDriverSort] = useState<"delta" | "current">("delta");
  const [netVsSort, setNetVsSort] = useState<"net_revenue" | "refund_rate">(
    "net_revenue",
  );
  const [showRefunds, setShowRefunds] = useState(true);
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
          `${API_BASE}/projects/${projectId}/metrics/net_revenue/details?${params.toString()}`,
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
        const payload = (await response.json()) as NetRevenueDetailsResponse;
        if (!response.ok) {
          setError("Не удалось загрузить детали Net Revenue.");
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

  const handlePreserveScroll = (callback: () => void) => {
    const currentScroll = bodyRef.current?.scrollTop ?? 0;
    callback();
    requestAnimationFrame(() => {
      if (bodyRef.current) {
        bodyRef.current.scrollTop = currentScroll;
      }
    });
  };

  const periodLabel = data
    ? `Текущий период: ${data.periods.current.from} — ${data.periods.current.to} vs Предыдущий период: ${data.periods.previous.from} — ${data.periods.previous.to}`
    : "";

  const deltaSign = data ? (data.totals.delta_abs >= 0 ? "+" : "−") : "";
  const deltaFormatted = data
    ? `${deltaSign}${formatCurrencyRUB(Math.abs(data.totals.delta_abs))}`
    : "";

  const refundImpactLabel = data
    ? data.totals.refunds_share_of_gross_current === null
      ? "—"
      : formatPercent(data.totals.refunds_share_of_gross_current / 100)
    : "";

  const activeDrivers = data?.drivers[activeDriverTab] ?? [];

  const sortedDrivers = useMemo(() => {
    const items = [...activeDrivers];
    if (driverSort === "current") {
      return items.sort((a, b) => b.current_net_revenue - a.current_net_revenue).slice(0, 10);
    }
    return items.sort((a, b) => b.delta - a.delta).slice(0, 10);
  }, [activeDrivers, driverSort]);

  const sortedNetVs = useMemo(() => {
    if (!data) {
      return [];
    }
    const items = [...data.net_vs_gross_refunds_top10];
    if (netVsSort === "refund_rate") {
      return items
        .filter((item) => item.refund_rate_percent !== null)
        .sort(
          (a, b) => (b.refund_rate_percent ?? 0) - (a.refund_rate_percent ?? 0),
        )
        .slice(0, 10);
    }
    return items.sort((a, b) => b.net_revenue - a.net_revenue).slice(0, 10);
  }, [data, netVsSort]);

  const driverTabs = [
    { key: "products_top10" as const, label: "Продукты" },
    { key: "groups_top10" as const, label: "Группы" },
    { key: "managers_top10" as const, label: "Менеджеры" },
  ];

  if (!open) {
    return null;
  }

  return (
    <div className="metric-modal-overlay" role="dialog" aria-modal="true">
      <div className="metric-modal-backdrop" onClick={onClose} />
      <div className="metric-modal">
        <header className="metric-modal-header">
          <div>
            <h3>Net Revenue</h3>
          </div>
          <button type="button" className="metric-modal-close" onClick={onClose}>
            ×
          </button>
        </header>

        <div className="metric-modal-body" ref={bodyRef}>
          {showPeriodHint ? (
            <div className="empty-state compact">
              <strong>Net Revenue</strong>
              <p className="helper-text">
                Выберите период в фильтрах, чтобы посмотреть подробности.
              </p>
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
                    <h4>Net Revenue</h4>
                    <p className="helper-text">{periodLabel}</p>
                  </div>
                  <div className="metric-compare-values">
                    <div>
                      <span className="kpi-label">Net Revenue</span>
                      <strong>{formatCurrencyRUB(data.totals.net_revenue_current)}</strong>
                    </div>
                    <div>
                      <span className="kpi-label">Δ</span>
                      <strong
                        className={data.totals.delta_abs >= 0 ? "positive" : "negative"}
                      >
                        {deltaFormatted}
                      </strong>
                      <span className="helper-text">
                        ({formatPercent(data.totals.delta_pct)})
                      </span>
                    </div>
                  </div>
                  <div className="metric-components">
                    <span>
                      Gross Sales: {formatCurrencyRUB(data.totals.gross_sales_current)}
                    </span>
                    <span>Refunds: {formatCurrencyRUB(data.totals.refunds_current)}</span>
                    <span>Refund impact: {refundImpactLabel}</span>
                  </div>
                  <p className="helper-text">
                    Net Revenue = Gross Sales − Refunds (без комиссий). Комиссии
                    учитываются в Profit/Net Profit.
                  </p>
                </div>
              </section>

              <section className="metric-section">
                <div className="gross-sales-chart-header">
                  <div>
                    <h4>Динамика</h4>
                    <span className="gross-sales-chart-subtitle">
                      {data.series.granularity === "week" ? "По неделям" : "По дням"}
                    </span>
                  </div>
                  <div className="metric-chart-controls">
                    <label className="metric-toggle">
                      <input
                        type="checkbox"
                        checked={showRefunds}
                        onChange={() => handlePreserveScroll(() => setShowRefunds(!showRefunds))}
                      />
                      Показать refunds
                    </label>
                  </div>
                </div>
                <div className="metric-chart-legend">
                  <span className="metric-legend-item">
                    <i className="legend-dot bar" /> Net Revenue
                  </span>
                  <span className="metric-legend-item">
                    <i className="legend-dot gross" /> Gross Sales
                  </span>
                  {showRefunds ? (
                    <span className="metric-legend-item">
                      <i className="legend-dot refunds" /> Refunds
                    </span>
                  ) : null}
                </div>
                <NetRevenueSeriesChart
                  points={data.series.points}
                  granularity={data.series.granularity}
                  topBuckets={data.series.top_buckets_net_revenue}
                  showRefunds={showRefunds}
                />
              </section>

              <section className="metric-section">
                <div className="metric-drivers-header">
                  <h4>Драйверы изменения</h4>
                  <div className="metric-drivers-tabs">
                    {driverTabs.map((tab) => (
                      <button
                        key={tab.key}
                        type="button"
                        className={`tab-button ${activeDriverTab === tab.key ? "active" : ""}`}
                        onClick={() => handlePreserveScroll(() => setActiveDriverTab(tab.key))}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="metric-drivers-subheader">
                  <div className="metric-segmented">
                    <button
                      type="button"
                      className={driverSort === "delta" ? "active" : ""}
                      onClick={() => handlePreserveScroll(() => setDriverSort("delta"))}
                    >
                      По Δ
                    </button>
                    <button
                      type="button"
                      className={driverSort === "current" ? "active" : ""}
                      onClick={() => handlePreserveScroll(() => setDriverSort("current"))}
                    >
                      По текущей
                    </button>
                  </div>
                  <Tooltip content="Текущая — сумма Net Revenue за текущий период. Δ — разница с предыдущим периодом. Доля — доля от общего Net Revenue текущего периода.">
                    <span className="metric-info">Как читать</span>
                  </Tooltip>
                </div>
                {sortedDrivers.length ? (
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
                      {sortedDrivers.map((item) => {
                        const sign = item.delta > 0 ? "+" : item.delta < 0 ? "−" : "";
                        return (
                          <tr key={item.name}>
                            <td className="metric-name-cell">
                              <span title={item.name}>{item.name}</span>
                            </td>
                            <td>{formatCurrencyRUB(item.current_net_revenue)}</td>
                            <td className={item.delta >= 0 ? "positive" : "negative"}>
                              {sign}
                              {formatCurrencyRUB(Math.abs(item.delta))}
                            </td>
                            <td>{formatPercent(item.share)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                ) : (
                  <p className="helper-text">Нет данных для выбранного среза.</p>
                )}
              </section>

              <section className="metric-section">
                <div className="metric-drivers-header">
                  <div>
                    <h4>Net vs Gross vs Refunds</h4>
                    <p className="helper-text">
                      Сравнение по продуктам: где net revenue и где refunds съедают
                      выручку.
                    </p>
                  </div>
                  <div className="metric-segmented">
                    <button
                      type="button"
                      className={netVsSort === "net_revenue" ? "active" : ""}
                      onClick={() => handlePreserveScroll(() => setNetVsSort("net_revenue"))}
                    >
                      По net revenue
                    </button>
                    <button
                      type="button"
                      className={netVsSort === "refund_rate" ? "active" : ""}
                      onClick={() => handlePreserveScroll(() => setNetVsSort("refund_rate"))}
                    >
                      По refund rate
                    </button>
                  </div>
                </div>
                {sortedNetVs.length ? (
                  <table className="data-table compact">
                    <thead>
                      <tr>
                        <th>Продукт</th>
                        <th>Gross Sales</th>
                        <th>Refunds</th>
                        <th>Net Revenue</th>
                        <th>Refund rate</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedNetVs.map((item) => (
                        <tr key={item.product_name}>
                          <td className="metric-name-cell">
                            <span title={item.product_name}>{item.product_name}</span>
                          </td>
                          <td>{formatCurrencyRUB(item.gross_sales)}</td>
                          <td>{formatCurrencyRUB(item.refunds)}</td>
                          <td>{formatCurrencyRUB(item.net_revenue)}</td>
                          <td>
                            {item.refund_rate_percent === null
                              ? "—"
                              : formatPercent(item.refund_rate_percent / 100)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="helper-text">Нет данных для выбранного режима.</p>
                )}
              </section>

              {data.signals.length ? (
                <section className="metric-section">
                  <h4>Сигналы</h4>
                  <div className="metric-insights">
                    {data.signals.map((signal, index) => (
                      <div
                        key={`${signal.type}-${index}`}
                        className={`metric-insight ${
                          signal.severity === "warn" ? "warn" : ""
                        }`}
                      >
                        <strong>{signal.title}</strong>
                        <p>{signal.message}</p>
                      </div>
                    ))}
                  </div>
                </section>
              ) : (
                <section className="metric-section">
                  <h4>Сигналы</h4>
                  <p className="helper-text">Пока нет сигналов за выбранный период.</p>
                </section>
              )}

              {data.payment_methods.length ? (
                <section className="metric-section">
                  <h4>Способы оплаты</h4>
                  <table className="data-table compact">
                    <thead>
                      <tr>
                        <th>Метод</th>
                        <th>Gross Sales</th>
                        <th>Refunds</th>
                        <th>Net Revenue</th>
                        <th>Refund rate</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.payment_methods.map((item) => (
                        <tr key={item.payment_method}>
                          <td className="metric-name-cell">
                            <span title={item.payment_method}>{item.payment_method}</span>
                          </td>
                          <td>{formatCurrencyRUB(item.gross_sales)}</td>
                          <td>{formatCurrencyRUB(item.refunds)}</td>
                          <td>{formatCurrencyRUB(item.net_revenue)}</td>
                          <td>
                            {item.refund_rate_percent === null
                              ? "—"
                              : formatPercent(item.refund_rate_percent / 100)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default NetRevenueDetailsModal;
