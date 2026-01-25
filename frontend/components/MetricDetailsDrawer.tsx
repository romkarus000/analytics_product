import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { API_BASE } from "../app/lib/api";
import { formatCurrencyRUB, formatPercent } from "../app/lib/format";
import Button from "./ui/Button";
import Skeleton from "./ui/Skeleton";

type GrossSalesDriverItem = {
  name: string;
  current: number;
  previous: number;
  delta_abs: number;
  delta_pct: number | null;
  share_current: number;
};

type GrossSalesDetailsResponse = {
  metric: string;
  current: { value: number; from: string; to: string };
  previous: { value: number; from: string; to: string };
  change: { delta_abs: number; delta_pct: number | null };
  series: Array<{ date: string; value: number }>;
  drivers: {
    products: GrossSalesDriverItem[];
    groups: GrossSalesDriverItem[];
    managers: GrossSalesDriverItem[];
  };
  concentration: {
    top1_share: number;
    top3_share: number;
    top1_name: string | null;
    top3_names: string[];
  };
  insights: Array<{ title: string; text: string; severity: "info" | "warn" }>;
  availability: { status: "available" | "partial" | "unavailable"; missing_fields: string[] };
};

type MetricDetailsDrawerProps = {
  open: boolean;
  onClose: () => void;
  projectId: string;
  fromDate: string;
  toDate: string;
  filters: Record<string, string>;
};

const MetricDetailsDrawer = ({
  open,
  onClose,
  projectId,
  fromDate,
  toDate,
  filters,
}: MetricDetailsDrawerProps) => {
  const router = useRouter();
  const [data, setData] = useState<GrossSalesDetailsResponse | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [activeDriverTab, setActiveDriverTab] = useState<
    "products" | "groups" | "managers"
  >("products");

  const filterPayload = useMemo(() => JSON.stringify(filters), [filters]);

  useEffect(() => {
    if (!open) {
      return;
    }
    if (!fromDate || !toDate) {
      setData(null);
      setError("Выберите период для просмотра деталей.");
      return;
    }
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
        if (payload.drivers.managers.length === 0 && activeDriverTab === "managers") {
          setActiveDriverTab("products");
        }
      } catch {
        setError("Ошибка сети. Попробуйте ещё раз.");
      } finally {
        setIsLoading(false);
      }
    };
    loadDetails();
  }, [
    activeDriverTab,
    filterPayload,
    filters,
    fromDate,
    open,
    projectId,
    router,
    toDate,
  ]);

  if (!open) {
    return null;
  }

  const maxSeriesValue = data?.series.reduce((max, item) => Math.max(max, item.value), 0) ?? 0;
  const hasNoSales =
    !isLoading && data && data.current.value === 0 && data.series.length === 0;

  const driverTabs = [
    { key: "products" as const, label: "Продукты", items: data?.drivers.products ?? [] },
    { key: "groups" as const, label: "Группы", items: data?.drivers.groups ?? [] },
    { key: "managers" as const, label: "Менеджеры", items: data?.drivers.managers ?? [] },
  ];

  const activeDrivers =
    driverTabs.find((tab) => tab.key === activeDriverTab)?.items ?? [];

  const renderDriverTable = (items: GrossSalesDriverItem[]) => {
    if (!items.length) {
      return <p className="helper-text">Нет данных для выбранного разреза.</p>;
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
            const deltaSign = item.delta_abs > 0 ? "+" : item.delta_abs < 0 ? "−" : "";
            return (
              <tr key={item.name}>
                <td>{item.name}</td>
                <td>{formatCurrencyRUB(item.current)}</td>
                <td className={item.delta_abs >= 0 ? "positive" : "negative"}>
                  {deltaSign}
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
    <div className="metric-drawer-overlay" role="dialog" aria-modal="true">
      <div className="metric-drawer-backdrop" onClick={onClose} />
      <aside className="metric-drawer">
        <header className="metric-drawer-header">
          <div>
            <h3>Gross Sales</h3>
            <p className="helper-text">Текущий период vs предыдущий</p>
          </div>
          <button type="button" className="metric-drawer-close" onClick={onClose}>
            ×
          </button>
        </header>

        {isLoading ? (
          <div className="metric-drawer-body">
            <Skeleton height={24} width={160} />
            <Skeleton height={32} width={220} />
            <Skeleton height={120} />
            <Skeleton height={180} />
          </div>
        ) : error ? (
          <div className="metric-drawer-body">
            <p className="helper-text">{error}</p>
            <Button variant="secondary" size="sm" onClick={onClose}>
              Закрыть
            </Button>
          </div>
        ) : data ? (
          <div className="metric-drawer-body">
            <section className="metric-summary">
              <div>
                <span className="kpi-label">Gross Sales</span>
                <h2>{formatCurrencyRUB(data.current.value)}</h2>
                <p className="helper-text">
                  {data.current.from} → {data.current.to}
                </p>
              </div>
              <div className="metric-summary-change">
                <span className="kpi-label">Δ к прошлому периоду</span>
                <strong className={data.change.delta_abs >= 0 ? "positive" : "negative"}>
                  {data.change.delta_abs >= 0 ? "+" : "−"}
                  {formatCurrencyRUB(Math.abs(data.change.delta_abs))}
                </strong>
                <span className="helper-text">
                  {formatPercent(data.change.delta_pct)}
                </span>
              </div>
            </section>

            {data.availability.status !== "available" ? (
              <div className="metric-availability">
                <strong>Частично доступно</strong>
                {data.availability.missing_fields.length ? (
                  <span className="helper-text">
                    Добавьте поля: {data.availability.missing_fields.join(", ")}
                  </span>
                ) : null}
              </div>
            ) : null}

            {hasNoSales ? (
              <div className="empty-state compact">
                <strong>Нет продаж за выбранный период</strong>
                <span>Попробуйте изменить фильтры или период.</span>
              </div>
            ) : (
              <>
                <section className="metric-section">
                  <h4>Динамика</h4>
                  {data.series.length ? (
                    <div className="mini-chart">
                      {data.series.map((item) => (
                        <div key={item.date} className="mini-chart-row">
                          <span>{item.date}</span>
                          <div className="mini-chart-bar">
                            <span
                              style={{
                                width: `${maxSeriesValue ? (item.value / maxSeriesValue) * 100 : 0}%`,
                              }}
                            />
                          </div>
                          <strong>{formatCurrencyRUB(item.value)}</strong>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="helper-text">Нет данных по динамике.</p>
                  )}
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
                          onClick={() => setActiveDriverTab(tab.key)}
                          disabled={tab.key === "managers" && tab.items.length === 0}
                        >
                          {tab.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  {renderDriverTable(activeDrivers)}
                </section>

                <section className="metric-section">
                  <h4>Концентрация</h4>
                  <div className="metric-concentration">
                    <div>
                      <span className="kpi-label">Топ-1 продукт</span>
                      <strong>
                        {data.concentration.top1_name ?? "—"} ={" "}
                        {formatPercent(data.concentration.top1_share)}
                      </strong>
                    </div>
                    <div>
                      <span className="kpi-label">Топ-3</span>
                      <strong>
                        {data.concentration.top3_names.length
                          ? data.concentration.top3_names.join(", ")
                          : "—"}{" "}
                        = {formatPercent(data.concentration.top3_share)}
                      </strong>
                    </div>
                  </div>
                </section>

                <section className="metric-section">
                  <h4>Insights</h4>
                  {data.insights.length ? (
                    <div className="metric-insights">
                      {data.insights.map((insight, index) => (
                        <div
                          key={`${insight.title}-${index}`}
                          className={`metric-insight ${insight.severity}`}
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
              </>
            )}
          </div>
        ) : null}
      </aside>
    </div>
  );
};

export default MetricDetailsDrawer;
