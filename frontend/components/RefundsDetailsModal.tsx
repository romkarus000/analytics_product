import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { API_BASE } from "../app/lib/api";
import { formatCurrencyRUB, formatPercent } from "../app/lib/format";
import Button from "./ui/Button";
import Skeleton from "./ui/Skeleton";
import RefundsSeriesChart from "./charts/RefundsSeriesChart";

type RefundsDetailsResponse = {
  periods: {
    current: { from: string; to: string };
    previous: { from: string; to: string };
  };
  totals: {
    refunds_current: number;
    refunds_previous: number;
    delta_abs: number;
    delta_pct: number | null;
    gross_sales_current: number;
    refund_rate_current: number | null;
    refund_rate_previous: number | null;
    refund_rate_delta_pp: number | null;
  };
  series: {
    granularity: "day" | "week";
    series_refunds: Array<{ bucket: string; value: number }>;
    series_refund_rate: Array<{ bucket: string; value: number }>;
    top_buckets_refunds: string[];
  };
  sales_vs_refunds_by_product: Array<{
    product_name: string;
    gross_sales: number;
    refunds: number;
    refund_rate: number | null;
  }>;
  concentration: {
    top1: { product_name: string | null; refunds: number; share: number } | null;
    top3_share: number;
  };
  refunds_by_payment_method: Array<{
    payment_method: string;
    refunds: number;
    share: number;
    gross_sales?: number | null;
    refund_rate?: number | null;
  }>;
  signals: Array<{ type: string; title: string; message: string; severity?: string | null }>;
};

type RefundsDetailsModalProps = {
  open: boolean;
  onClose: () => void;
  projectId: string;
  fromDate: string;
  toDate: string;
  filters: Record<string, string>;
};

const RefundsDetailsModal = ({
  open,
  onClose,
  projectId,
  fromDate,
  toDate,
  filters,
}: RefundsDetailsModalProps) => {
  const router = useRouter();
  const [data, setData] = useState<RefundsDetailsResponse | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showPeriodHint, setShowPeriodHint] = useState(false);
  const [sortMode, setSortMode] = useState<"refunds" | "refund_rate">("refunds");
  const [chartMode, setChartMode] = useState<"amount" | "rate">("amount");
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
          `${API_BASE}/projects/${projectId}/metrics/refunds/details?${params.toString()}`,
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
        const payload = (await response.json()) as RefundsDetailsResponse;
        if (!response.ok) {
          setError("Не удалось загрузить детали Refunds.");
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

  const refundRateLabel = data
    ? data.totals.refund_rate_current === null
      ? "—"
      : formatPercent(data.totals.refund_rate_current / 100)
    : "";
  const refundRateDeltaLabel = data
    ? data.totals.refund_rate_delta_pp === null
      ? "—"
      : `${formatPercent(data.totals.refund_rate_delta_pp / 100).replace("%", "")} п.п.`
    : "";

  const deltaSign = data ? (data.totals.delta_abs >= 0 ? "+" : "−") : "";
  const deltaFormatted = data
    ? `${deltaSign}${formatCurrencyRUB(Math.abs(data.totals.delta_abs))}`
    : "";

  const sortedProducts = useMemo(() => {
    if (!data) {
      return [];
    }
    const items = [...data.sales_vs_refunds_by_product];
    if (sortMode === "refund_rate") {
      return items
        .filter((item) => item.refund_rate !== null && item.gross_sales > 0)
        .sort((a, b) => (b.refund_rate ?? 0) - (a.refund_rate ?? 0))
        .slice(0, 10);
    }
    return items.sort((a, b) => b.refunds - a.refunds).slice(0, 10);
  }, [data, sortMode]);

  const paymentMethods = data?.refunds_by_payment_method ?? [];
  const showPaymentRate = paymentMethods.some(
    (item) => item.gross_sales !== null && item.gross_sales !== undefined,
  );

  const signals = useMemo(() => {
    if (!data) {
      return [];
    }
    const items: Array<{ title: string; text: string; tone?: "warn" }> = [];
    const peakBucket = data.series.top_buckets_refunds[0];
    if (peakBucket) {
      const peakItem = data.series.series_refunds.find(
        (item) => item.bucket === peakBucket,
      );
      if (peakItem) {
        items.push({
          title: "Пик возвратов",
          text: `Пик возвратов: ${peakBucket} — ${formatCurrencyRUB(peakItem.value)}`,
        });
      }
    }
    if (
      data.totals.refund_rate_delta_pp !== null &&
      data.totals.refund_rate_delta_pp >= 2
    ) {
      items.push({
        title: "Рост refund rate",
        text: `Refund rate вырос на ${formatPercent(
          data.totals.refund_rate_delta_pp / 100,
        ).replace("%", "")} п.п.`,
      });
    }
    if (data.concentration.top1 && data.concentration.top1.share > 0.4) {
      items.push({
        title: "Концентрация",
        text: `Высокая концентрация: ${data.concentration.top1.product_name} = ${formatPercent(
          data.concentration.top1.share,
        )}`,
        tone: "warn",
      });
    }
    if (data.series.series_refunds.length >= 3) {
      const values = data.series.series_refunds.map((item) => item.value);
      const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
      const variance =
        values.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
        values.length;
      const std = Math.sqrt(variance);
      const maxValue = Math.max(...values);
      const maxItem = data.series.series_refunds.find((item) => item.value === maxValue);
      if (
        mean > 0 &&
        maxItem &&
        (maxValue > mean + 2 * std || maxValue > mean * 3)
      ) {
        items.push({
          title: "Аномалия",
          text: `Аномальный всплеск возвратов: ${maxItem.bucket}`,
          tone: "warn",
        });
      }
    }
    if (items.length < 2 && data.concentration.top3_share > 0) {
      items.push({
        title: "Концентрация топ-3",
        text: `Топ-3 продукта дают ${formatPercent(
          data.concentration.top3_share,
        )} возвратов`,
      });
    }
    return items.slice(0, 4);
  }, [data]);

  if (!open) {
    return null;
  }

  return (
    <div className="metric-modal-overlay" role="dialog" aria-modal="true">
      <div className="metric-modal-backdrop" onClick={onClose} />
      <div className="metric-modal">
        <header className="metric-modal-header">
          <div>
            <h3>Refunds</h3>
          </div>
          <button type="button" className="metric-modal-close" onClick={onClose}>
            ×
          </button>
        </header>

        <div className="metric-modal-body" ref={bodyRef}>
          {showPeriodHint ? (
            <div className="empty-state compact">
              <strong>Refunds</strong>
              <p className="helper-text">
                Выберите период в фильтрах, чтобы посмотреть возвраты.
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
                    <h4>Refunds</h4>
                    <p className="helper-text">{periodLabel}</p>
                  </div>
                  <div className="metric-compare-values">
                    <div>
                      <span className="kpi-label">Refunds</span>
                      <strong>{formatCurrencyRUB(data.totals.refunds_current)}</strong>
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
                    <div>
                      <span className="kpi-label">Refund rate</span>
                      <strong>{refundRateLabel}</strong>
                      <span className="helper-text">Δ {refundRateDeltaLabel}</span>
                    </div>
                  </div>
                  <div className="metric-drivers-help">
                    <span>Refunds — сумма возвратов в периоде</span>
                    <span>Refund rate = Refunds / Gross Sales</span>
                  </div>
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
                  <div className="metric-segmented">
                    <button
                      type="button"
                      className={chartMode === "amount" ? "active" : ""}
                      onClick={() => handlePreserveScroll(() => setChartMode("amount"))}
                    >
                      ₽
                    </button>
                    <button
                      type="button"
                      className={chartMode === "rate" ? "active" : ""}
                      onClick={() => handlePreserveScroll(() => setChartMode("rate"))}
                    >
                      %
                    </button>
                  </div>
                </div>
                <RefundsSeriesChart
                  seriesRefunds={data.series.series_refunds}
                  seriesRefundRate={data.series.series_refund_rate}
                  granularity={data.series.granularity}
                  topBuckets={data.series.top_buckets_refunds}
                  mode={chartMode}
                />
              </section>

              <section className="metric-section">
                <div className="metric-drivers-header">
                  <div>
                    <h4>Продажи vs Возвраты</h4>
                    <p className="helper-text">
                      Здесь видно, какие продукты дают выручку и какие чаще возвращают.
                    </p>
                  </div>
                  <div className="metric-segmented">
                    <button
                      type="button"
                      className={sortMode === "refunds" ? "active" : ""}
                      onClick={() => handlePreserveScroll(() => setSortMode("refunds"))}
                    >
                      По сумме возвратов
                    </button>
                    <button
                      type="button"
                      className={sortMode === "refund_rate" ? "active" : ""}
                      onClick={() => handlePreserveScroll(() => setSortMode("refund_rate"))}
                    >
                      По доле возвратов
                    </button>
                  </div>
                </div>
                {sortedProducts.length ? (
                  <table className="data-table compact">
                    <thead>
                      <tr>
                        <th>Продукт</th>
                        <th>Gross Sales</th>
                        <th>Refunds</th>
                        <th>Refund rate</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedProducts.map((item) => (
                        <tr key={item.product_name}>
                          <td className="metric-name-cell">
                            <span title={item.product_name}>{item.product_name}</span>
                          </td>
                          <td>{formatCurrencyRUB(item.gross_sales)}</td>
                          <td>{formatCurrencyRUB(item.refunds)}</td>
                          <td>
                            {item.refund_rate === null
                              ? "—"
                              : formatPercent(item.refund_rate / 100)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="helper-text">Нет данных для выбранного режима.</p>
                )}
              </section>

              <section className="metric-section">
                <h4>Концентрация</h4>
                <div className="metric-concentration-cards">
                  <div className="metric-card">
                    <span className="kpi-label">Топ-1 продукт по возвратам</span>
                    <strong>{data.concentration.top1?.product_name ?? "—"}</strong>
                    <span className="helper-text">
                      {data.concentration.top1
                        ? `${formatCurrencyRUB(
                            data.concentration.top1.refunds,
                          )} · ${formatPercent(data.concentration.top1.share)}`
                        : "—"}
                    </span>
                  </div>
                  <div className="metric-card">
                    <span className="kpi-label">Топ-3 продукта по возвратам</span>
                    <strong>{formatPercent(data.concentration.top3_share)}</strong>
                    <span className="helper-text">от всех возвратов</span>
                  </div>
                </div>
                <div className="metric-drivers-help">
                  {data.concentration.top1?.share !== undefined &&
                  data.concentration.top1.share > 0.4 ? (
                    <span>Высокая концентрация возвратов</span>
                  ) : null}
                  {data.concentration.top3_share > 0.7 ? (
                    <span>Возвраты зависят от 3 продуктов</span>
                  ) : null}
                </div>
              </section>

              {paymentMethods.length ? (
                <section className="metric-section">
                  <h4>Способы оплаты</h4>
                  <table className="data-table compact">
                    <thead>
                      <tr>
                        <th>Метод</th>
                        <th>Refunds</th>
                        <th>Доля</th>
                        {showPaymentRate ? <th>Gross Sales</th> : null}
                        {showPaymentRate ? <th>Refund rate</th> : null}
                      </tr>
                    </thead>
                    <tbody>
                      {paymentMethods.map((item) => (
                        <tr key={item.payment_method}>
                          <td className="metric-name-cell">
                            <span title={item.payment_method}>{item.payment_method}</span>
                          </td>
                          <td>{formatCurrencyRUB(item.refunds)}</td>
                          <td>{formatPercent(item.share)}</td>
                          {showPaymentRate ? (
                            <td>{formatCurrencyRUB(item.gross_sales ?? 0)}</td>
                          ) : null}
                          {showPaymentRate ? (
                            <td>
                              {item.refund_rate === null || item.refund_rate === undefined
                                ? "—"
                                : formatPercent(item.refund_rate / 100)}
                            </td>
                          ) : null}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>
              ) : null}

              <section className="metric-section">
                <h4>Сигналы</h4>
                {signals.length ? (
                  <div className="metric-insights">
                    {signals.map((signal, index) => (
                      <div
                        key={`${signal.title}-${index}`}
                        className={`metric-insight ${signal.tone === "warn" ? "warn" : ""}`}
                      >
                        <strong>{signal.title}</strong>
                        <p>{signal.text}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="helper-text">Пока нет сигналов за выбранный период.</p>
                )}
              </section>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default RefundsDetailsModal;
