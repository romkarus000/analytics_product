"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { API_BASE } from "../app/lib/api";
import { formatCurrencyRUB, formatPercent } from "../app/lib/format";
import Button from "./ui/Button";
import Skeleton from "./ui/Skeleton";
import Tooltip from "./ui/Tooltip";
import FeesTotalSeriesChart from "./charts/FeesTotalSeriesChart";

type FeesTotalDetailsResponse = {
  summary: {
    fees_total_current: number;
    fees_total_previous: number;
    delta_abs: number;
    delta_pct: number | null;
    fee_share_current: number | null;
    gross_sales_current: number;
    method: string;
  };
  trend: {
    granularity: "day" | "week";
    series: Array<{
      bucket: string;
      fees_total: number;
      fee_share: number;
    }>;
    top_buckets: string[];
    anomalies: string[];
  };
  drivers: {
    products: Array<{
      name: string;
      current_fees: number;
      delta_fees: number;
      share_of_fees: number;
    }>;
    groups: Array<{
      name: string;
      current_fees: number;
      delta_fees: number;
      share_of_fees: number;
    }>;
    managers: Array<{
      name: string;
      current_fees: number;
      delta_fees: number;
      share_of_fees: number;
    }>;
    payment_method: Array<{
      name: string;
      current_fees: number;
      delta_fees: number;
      share_of_fees: number;
    }>;
  };
  breakdowns: Array<{
    key: string;
    title: string;
    current: number;
    previous: number;
    delta_abs: number;
    delta_pct: number | null;
    share_current: number;
  }>;
  efficiency: {
    fee_per_order: number | null;
    fee_per_revenue: number | null;
    fees_on_refunds: number | null;
  };
  insights: string[];
};

type FeesTotalDetailsModalProps = {
  open: boolean;
  onClose: () => void;
  projectId: string;
  fromDate: string;
  toDate: string;
  filters: Record<string, string>;
};

const FeesTotalDetailsModal = ({
  open,
  onClose,
  projectId,
  fromDate,
  toDate,
  filters,
}: FeesTotalDetailsModalProps) => {
  const router = useRouter();
  const [data, setData] = useState<FeesTotalDetailsResponse | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showPeriodHint, setShowPeriodHint] = useState(false);
  const [activeDriverTab, setActiveDriverTab] = useState<
    "products" | "groups" | "managers" | "payment_method"
  >("products");
  const [trendMode, setTrendMode] = useState<"fees" | "share">("fees");
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
          `${API_BASE}/projects/${projectId}/metrics/fees_total/details?${params.toString()}`,
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
        const payload = (await response.json()) as FeesTotalDetailsResponse;
        if (!response.ok) {
          setError("Не удалось загрузить детали Fees Total.");
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

  if (!open) {
    return null;
  }

  const periodLabel = data
    ? `Текущий период: ${fromDate} — ${toDate}`
    : "";
  const deltaSign = data ? (data.summary.delta_abs >= 0 ? "+" : "−") : "";
  const deltaFormatted = data
    ? `${deltaSign}${formatCurrencyRUB(Math.abs(data.summary.delta_abs))}`
    : "";

  const activeDrivers = data?.drivers[activeDriverTab] ?? [];
  const driverTabs = [
    { key: "products" as const, label: "Продукты" },
    { key: "groups" as const, label: "Группы" },
    { key: "managers" as const, label: "Менеджеры" },
    { key: "payment_method" as const, label: "Способ оплаты" },
  ];

  return (
    <div className="metric-modal-overlay" role="dialog" aria-modal="true">
      <div className="metric-modal-backdrop" onClick={onClose} />
      <div className="metric-modal">
        <header className="metric-modal-header">
          <div>
            <h3>Fees Total</h3>
          </div>
          <button type="button" className="metric-modal-close" onClick={onClose}>
            ×
          </button>
        </header>

        <div className="metric-modal-body" ref={bodyRef}>
          {showPeriodHint ? (
            <div className="empty-state compact">
              <strong>Fees Total</strong>
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
                    <h4>Fees Total</h4>
                    <p className="helper-text">{periodLabel}</p>
                  </div>
                  <div className="metric-compare-values">
                    <div>
                      <span className="kpi-label">Fees Total</span>
                      <strong>{formatCurrencyRUB(data.summary.fees_total_current)}</strong>
                    </div>
                    <div>
                      <span className="kpi-label">Δ</span>
                      <strong
                        className={data.summary.delta_abs >= 0 ? "positive" : "negative"}
                      >
                        {deltaFormatted}
                      </strong>
                      <span className="helper-text">
                        ({formatPercent(data.summary.delta_pct)})
                      </span>
                    </div>
                    <div>
                      <span className="kpi-label">Fee Share</span>
                      <strong>{formatPercent(data.summary.fee_share_current)}</strong>
                      <span className="helper-text">от Gross Sales</span>
                    </div>
                  </div>
                  <span className="helper-text">{data.summary.method}</span>
                </div>
              </section>

              <section className="metric-section">
                <div className="gross-sales-chart-header">
                  <div>
                    <h4>Динамика</h4>
                    <span className="gross-sales-chart-subtitle">
                      {data.trend.granularity === "week" ? "По неделям" : "По дням"}
                    </span>
                  </div>
                  <div className="metric-chart-controls">
                    <div className="metric-segmented">
                      <button
                        type="button"
                        className={trendMode === "fees" ? "active" : ""}
                        onClick={() => handlePreserveScroll(() => setTrendMode("fees"))}
                      >
                        Fees ₽
                      </button>
                      <button
                        type="button"
                        className={trendMode === "share" ? "active" : ""}
                        onClick={() => handlePreserveScroll(() => setTrendMode("share"))}
                      >
                        Fee Share %
                      </button>
                    </div>
                  </div>
                </div>
                <FeesTotalSeriesChart
                  series={data.trend.series}
                  granularity={data.trend.granularity}
                  topBuckets={data.trend.top_buckets}
                  anomalies={data.trend.anomalies}
                  mode={trendMode}
                />
              </section>

              <section className="metric-section">
                <h4>Состав комиссии</h4>
                {data.breakdowns.length ? (
                  <table className="data-table compact">
                    <thead>
                      <tr>
                        <th>Компонент</th>
                        <th>Текущая</th>
                        <th>Δ</th>
                        <th>Доля</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.breakdowns.map((item) => {
                        const sign = item.delta_abs > 0 ? "+" : item.delta_abs < 0 ? "−" : "";
                        return (
                          <tr key={item.key}>
                            <td className="metric-name-cell">
                              <span>{item.title}</span>
                            </td>
                            <td>{formatCurrencyRUB(item.current)}</td>
                            <td className={item.delta_abs >= 0 ? "positive" : "negative"}>
                              {sign}
                              {formatCurrencyRUB(Math.abs(item.delta_abs))}
                            </td>
                            <td>{formatPercent(item.share_current)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                ) : (
                  <p className="helper-text">Нет данных по комиссиям.</p>
                )}
              </section>

              <section className="metric-section">
                <div className="metric-drivers-header">
                  <h4>Drivers Top-10</h4>
                  <div className="metric-drivers-tabs">
                    {driverTabs.map((tab) => (
                      <button
                        key={tab.key}
                        type="button"
                        className={`tab-button ${
                          activeDriverTab === tab.key ? "active" : ""
                        }`}
                        onClick={() => handlePreserveScroll(() => setActiveDriverTab(tab.key))}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="metric-drivers-subheader">
                  <Tooltip content="Текущая — сумма комиссий за период. Δ — разница с предыдущим периодом. Доля — доля от всех комиссий текущего периода.">
                    <span className="metric-info">Как читать</span>
                  </Tooltip>
                </div>
                {activeDrivers.length ? (
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
                      {activeDrivers.map((item) => {
                        const sign = item.delta_fees > 0 ? "+" : item.delta_fees < 0 ? "−" : "";
                        return (
                          <tr key={item.name}>
                            <td className="metric-name-cell">
                              <span title={item.name}>{item.name}</span>
                            </td>
                            <td>{formatCurrencyRUB(item.current_fees)}</td>
                            <td className={item.delta_fees >= 0 ? "positive" : "negative"}>
                              {sign}
                              {formatCurrencyRUB(Math.abs(item.delta_fees))}
                            </td>
                            <td>{formatPercent(item.share_of_fees)}</td>
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
                <h4>Efficiency KPIs</h4>
                <div className="metric-concentration-cards">
                  <div className="metric-card">
                    <span className="kpi-label">Fee per Order</span>
                    <strong>{formatCurrencyRUB(data.efficiency.fee_per_order)}</strong>
                    <span className="helper-text">Комиссия / заказ</span>
                  </div>
                  <div className="metric-card">
                    <span className="kpi-label">Fee per Revenue</span>
                    <strong>{formatPercent(data.efficiency.fee_per_revenue)}</strong>
                    <span className="helper-text">Комиссия / Gross Sales</span>
                  </div>
                  <div className="metric-card">
                    <span className="kpi-label">Fees on Refunds</span>
                    <strong>{formatCurrencyRUB(data.efficiency.fees_on_refunds)}</strong>
                    <span className="helper-text">Комиссии на возвратах</span>
                  </div>
                </div>
              </section>

              <section className="metric-section">
                <h4>Insights</h4>
                {data.insights.length ? (
                  <div className="metric-insights">
                    {data.insights.map((item, index) => (
                      <div key={`${item}-${index}`} className="metric-insight">
                        <p>{item}</p>
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

export default FeesTotalDetailsModal;
