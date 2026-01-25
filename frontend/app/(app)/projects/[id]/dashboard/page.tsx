"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { API_BASE } from "../../../../lib/api";
import type { UploadRecord } from "../../../../lib/types";
import Button from "../../../../../components/ui/Button";
import Card from "../../../../../components/ui/Card";
import Dialog from "../../../../../components/ui/Dialog";
import Input from "../../../../../components/ui/Input";
import Select from "../../../../../components/ui/Select";
import Skeleton from "../../../../../components/ui/Skeleton";
import Tooltip from "../../../../../components/ui/Tooltip";

import { useToast } from "../../../../../components/ui/Toast";
import {
  formatCurrencyRUB,
  formatNumber,
  formatPercent,
} from "../../../../lib/format";

type MetricDelta = {
  wow: number | null;
  mom: number | null;
};

type DashboardMetric = {
  key: string;
  title: string;
  value: number | null;
  delta?: MetricDelta | null;
  availability: "available" | "partial" | "unavailable";
  missing_fields: string[];
  breakdowns?: Record<string, unknown> | null;
};

type DashboardPack = {
  title: string;
  metrics: DashboardMetric[];
  breakdowns: Record<string, unknown>;
  series: Array<Record<string, string | number>>;
};

type DashboardResponse = {
  from_date: string | null;
  to_date: string | null;
  filters: Record<string, string>;
  executive_cards: DashboardMetric[];
  packs: Record<string, DashboardPack>;
};

type Product = {
  id: number;
  canonical_name: string;
  category: string;
  product_type: string;
};

type Manager = {
  id: number;
  canonical_name: string;
};

type Insight = {
  id: number;
  project_id: number;
  metric_key: string;
  period_from: string;
  period_to: string;
  text: string;
  evidence_json: Record<string, unknown>;
  created_at: string;
};

const TAB_CONFIG = [
  { key: "executive", label: "Executive" },
  { key: "profit_pack", label: "Profit" },
  { key: "sales_pack", label: "Sales" },
  { key: "retention_pack", label: "Retention" },
  { key: "team_pack", label: "Team" },
  { key: "product_pack", label: "Product" },
  { key: "groups_pack", label: "Groups" },
  { key: "marketing_pack", label: "Marketing" },
] as const;

type TabKey = (typeof TAB_CONFIG)[number]["key"];

const METRIC_FORMULAS: Record<string, string> = {
  gross_sales: "Сумма оплат.",
  refunds: "Сумма возвратов.",
  net_revenue: "Gross Sales − Refunds.",
  orders: "Количество заказов.",
  fees_total: "Сумма комиссий.",
  fee_share: "Fees Total / Net Revenue.",
  net_profit_simple: "(Сумма оплат − комиссии) − (сумма возвратов − комиссии).",
  profit_margin: "Net Profit / Net Revenue.",
  refund_rate: "Refunds / Gross Sales.",
  avg_revenue_per_day: "Net Revenue / число дней с продажами.",
  best_day_revenue: "Максимальная дневная Net Revenue.",
  worst_day_revenue: "Минимальная дневная Net Revenue.",
  buyers: "Количество уникальных покупателей (по оплатам).",
  new_buyers: "Покупатели с первой оплатой в периоде.",
  repeat_rate: "Повторные покупатели / все покупатели.",
  returning_revenue: "Net Revenue от покупателей, которые покупали ранее.",
  revenue_by_manager: "Net Revenue по менеджерам.",
  orders_by_manager: "Количество заказов по менеджерам.",
  refund_rate_by_manager: "Refunds / Gross Sales по менеджерам.",
  revenue_by_product: "Net Revenue по продуктам.",
  orders_by_product: "Количество заказов по продуктам.",
  refund_rate_by_product: "Refunds / Gross Sales по продуктам.",
  revenue_share_by_product: "Доля Net Revenue топ-продуктов.",
  pareto_80_20: "Доля Net Revenue топ 20% продуктов.",
  product_transitions: "Количество связок покупок «до → после».",
  revenue_by_group: "Net Revenue по группам.",
  refund_rate_by_group: "Refunds / Gross Sales по группам.",
  top_groups_by_growth: "Количество групп с наибольшим ростом.",
  holes: "Количество групп с выручкой ранее и нулём сейчас.",
  spend_total: "Сумма маркетинговых расходов.",
  roas_total: "Net Revenue / маркетинговые расходы.",
  roas_by_campaign: "ROAS по кампаниям.",
  anomaly_spend_zero_revenue: "Кампании с расходом и нулевой выручкой.",
};

export default function DashboardPage() {
  const router = useRouter();
  const params = useParams();
  const { pushToast } = useToast();
  const projectId = useMemo(
    () => (Array.isArray(params.id) ? params.id[0] : params.id),
    [params.id],
  );

  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [managers, setManagers] = useState<Manager[]>([]);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [productCategory, setProductCategory] = useState("");
  const [productName, setProductName] = useState("");
  const [manager, setManager] = useState("");
  const [productType, setProductType] = useState("");
  const [groupPath, setGroupPath] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<TabKey>("executive");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isClearing, setIsClearing] = useState(false);
  const [clearDialogOpen, setClearDialogOpen] = useState(false);
  const [latestUploadAt, setLatestUploadAt] = useState<string | null>(null);

  const insightByMetric = useMemo(() => {
    const map: Record<string, Insight> = {};
    insights.forEach((item) => {
      if (!map[item.metric_key]) {
        map[item.metric_key] = item;
      }
    });
    return map;
  }, [insights]);

  const categories = useMemo(() => {
    const items = Array.from(new Set(products.map((item) => item.category)));
    return items.sort((a, b) => a.localeCompare(b));
  }, [products]);

  const types = useMemo(() => {
    const items = Array.from(new Set(products.map((item) => item.product_type)));
    return items.filter(Boolean).sort((a, b) => a.localeCompare(b));
  }, [products]);

  const productNames = useMemo(() => {
    const items = Array.from(
      new Set(products.map((item) => item.canonical_name)),
    );
    return items.sort((a, b) => a.localeCompare(b));
  }, [products]);

  const managerNames = useMemo(() => {
    const items = Array.from(
      new Set(managers.map((item) => item.canonical_name)),
    );
    return items.sort((a, b) => a.localeCompare(b));
  }, [managers]);

  const buildFilters = useCallback(() => {
    const filters: Record<string, string> = {};
    if (productCategory) {
      filters.product_category = productCategory;
    }
    if (productName) {
      filters.product_name = productName;
    }
    if (manager) {
      filters.manager = manager;
    }
    if (productType) {
      filters.product_type = productType;
    }
    groupPath.forEach((value, index) => {
      if (value) {
        filters[`group_${index + 1}`] = value;
      }
    });
    return filters;
  }, [groupPath, manager, productCategory, productName, productType]);

  const loadDashboard = useCallback(async () => {
    const accessToken = localStorage.getItem("access_token");
    if (!accessToken) {
      router.push("/login");
      return;
    }
    if (!projectId) {
      setError("Проект не найден.");
      return;
    }
    setIsLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (fromDate) {
        params.set("from", fromDate);
      }
      if (toDate) {
        params.set("to", toDate);
      }
      const filters = buildFilters();
      if (Object.keys(filters).length > 0) {
        params.set("filters", JSON.stringify(filters));
      }
      const response = await fetch(
        `${API_BASE}/projects/${projectId}/dashboard?${params.toString()}`,
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
      const payload = (await response.json()) as DashboardResponse;
      if (!response.ok) {
        setError(
          (payload as { detail?: string }).detail ??
            "Не удалось загрузить дашборд.",
        );
        return;
      }
      setDashboard(payload);
    } catch (err) {
      setError("Ошибка сети. Попробуйте ещё раз.");
    } finally {
      setIsLoading(false);
    }
  }, [buildFilters, fromDate, projectId, router, toDate]);

  const loadDimensions = useCallback(async () => {
    const accessToken = localStorage.getItem("access_token");
    if (!accessToken || !projectId) {
      return;
    }
    try {
      const [productsResponse, managersResponse] = await Promise.all([
        fetch(`${API_BASE}/projects/${projectId}/products`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        }),
        fetch(`${API_BASE}/projects/${projectId}/managers`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        }),
      ]);
      if (productsResponse.ok) {
        const payload = (await productsResponse.json()) as Product[];
        setProducts(payload);
      }
      if (managersResponse.ok) {
        const payload = (await managersResponse.json()) as Manager[];
        setManagers(payload);
      }
    } catch {
      // Ignore dimension load errors to not block dashboard rendering.
    }
  }, [projectId]);

  const loadInsights = useCallback(async () => {
    const accessToken = localStorage.getItem("access_token");
    if (!accessToken || !projectId) {
      return;
    }
    try {
      const params = new URLSearchParams();
      if (fromDate) {
        params.set("from", fromDate);
      }
      if (toDate) {
        params.set("to", toDate);
      }
      const response = await fetch(
        `${API_BASE}/projects/${projectId}/insights?${params.toString()}`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        },
      );
      if (!response.ok) {
        return;
      }
      const payload = (await response.json()) as Insight[];
      setInsights(payload);
    } catch {
      // Ignore insights load errors.
    }
  }, [fromDate, projectId, toDate]);

  const loadLatestUpload = useCallback(async () => {
    const accessToken = localStorage.getItem("access_token");
    if (!accessToken || !projectId) {
      return;
    }
    try {
      const response = await fetch(`${API_BASE}/projects/${projectId}/uploads`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!response.ok) {
        return;
      }
      const payload = (await response.json()) as UploadRecord[];
      if (payload.length > 0) {
        setLatestUploadAt(payload[0].created_at);
      }
    } catch {
      // Ignore upload load errors.
    }
  }, [projectId]);

  useEffect(() => {
    loadDimensions();
    loadLatestUpload();
  }, [loadDimensions, loadLatestUpload]);

  useEffect(() => {
    loadDashboard();
    loadInsights();
  }, [loadDashboard, loadInsights]);

  const handleApply = () => {
    loadDashboard();
    loadInsights();
    pushToast("Фильтры применены.", "success");
  };

  const handleClearDashboard = async () => {
    if (!projectId) {
      setError("Проект не найден.");
      return;
    }
    const accessToken = localStorage.getItem("access_token");
    if (!accessToken) {
      router.push("/login");
      return;
    }
    setIsClearing(true);
    setError("");
    try {
      const response = await fetch(`${API_BASE}/projects/${projectId}/dashboard`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (response.status === 401) {
        localStorage.removeItem("access_token");
        localStorage.removeItem("refresh_token");
        router.push("/login");
        return;
      }
      if (!response.ok) {
        setError("Не удалось очистить дашборд.");
        return;
      }
      setProductCategory("");
      setProductName("");
      setManager("");
      setProductType("");
      setGroupPath([]);
      setDashboard(null);
      setInsights([]);
      setProducts([]);
      setManagers([]);
      await Promise.all([loadDashboard(), loadInsights(), loadDimensions()]);
      pushToast("Данные дашборда очищены.", "success");
    } catch {
      setError("Ошибка сети. Попробуйте ещё раз.");
      pushToast("Ошибка сети. Попробуйте ещё раз.", "error");
    } finally {
      setIsClearing(false);
      setClearDialogOpen(false);
    }
  };

  const handleResetFilters = () => {
    setFromDate("");
    setToDate("");
    setProductCategory("");
    setProductName("");
    setManager("");
    setProductType("");
    setGroupPath([]);
    loadDashboard();
  };

  const activePack = useMemo(() => {
    if (!dashboard) {
      return null;
    }
    if (activeTab === "executive") {
      return {
        title: "Executive",
        metrics: dashboard.executive_cards,
        breakdowns: {},
        series: dashboard.packs.sales_pack?.series ?? [],
      } satisfies DashboardPack;
    }
    return dashboard.packs[activeTab] ?? null;
  }, [activeTab, dashboard]);

  const isPercentKey = (key: string) =>
    /(rate|share|margin|conversion|pareto)/i.test(key);
  const isCurrencyKey = (key: string) =>
    /(revenue|sales|refund|fees|profit|spend|avg|aov|best|worst|net|gross|amount)/i.test(
      key,
    );

  const formatByKey = (
    key: string,
    value: number | null,
    contextKey?: string,
  ) => {
    const combinedKey = `${key} ${contextKey ?? ""}`.trim();
    if (isPercentKey(key)) {
      return formatPercent(value);
    }
    if (isCurrencyKey(combinedKey)) {
      return formatCurrencyRUB(value);
    }
    return formatNumber(value);
  };

  const renderDelta = (delta?: MetricDelta | null) => {
    if (!delta) {
      return null;
    }
    return (
      <div className="kpi-delta">
        {delta.wow !== null ? <span>WoW: {formatPercent(delta.wow)}</span> : null}
        {delta.mom !== null ? <span>MoM: {formatPercent(delta.mom)}</span> : null}
      </div>
    );
  };

  const renderAvailability = (metric: DashboardMetric) => {
    if (metric.availability === "available") {
      return null;
    }
    const label =
      metric.availability === "partial" ? "Частично" : "Недоступно";
    return (
      <div className="availability">
        <span>{label}</span>
        {metric.missing_fields.length ? (
          <span className="helper-text">
            Добавьте поля: {metric.missing_fields.join(", ")}
          </span>
        ) : null}
      </div>
    );
  };

  const renderBreakdownTable = (
    title: string,
    rows: Array<Record<string, string | number>>,
    onRowClick?: (row: Record<string, string | number>) => void,
  ) => {
    if (!rows.length) {
      return (
        <Card key={title} tone="soft">
          <h4>{title}</h4>
          <p className="helper-text">Нет данных.</p>
        </Card>
      );
    }
    const columns = Object.keys(rows[0]);
    return (
      <Card key={title} tone="soft">
        <h4>{title}</h4>
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                {columns.map((column) => (
                  <th key={column}>{column}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr
                  key={`${title}-${index}`}
                  onClick={
                    onRowClick ? () => onRowClick(row) : undefined
                  }
                  className={onRowClick ? "clickable" : undefined}
                >
                  {columns.map((column) => (
                    <td key={`${title}-${index}-${column}`}>
                      {typeof row[column] === "number"
                        ? formatByKey(column, row[column] as number, title)
                        : (row[column] as string)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    );
  };

  const hasNoData = dashboard && !dashboard.executive_cards.length;

  const handleGroupRowClick = (row: Record<string, string | number>) => {
    if (!dashboard) {
      return;
    }
    const level = dashboard.packs.groups_pack?.breakdowns?.level as number | undefined;
    if (!level || level >= 5) {
      return;
    }
    const name = row.name as string | undefined;
    if (!name || name === "Без значения") {
      return;
    }
    setGroupPath((prev) => [...prev, name]);
  };

  const handleGroupBreadcrumb = (index: number) => {
    setGroupPath((prev) => prev.slice(0, index));
  };

  return (
    <div className="page dashboard-page">
      <div className="dashboard-toolbar">
        {latestUploadAt ? (
          <p className="dashboard-meta">
            Последнее обновление данных:{" "}
            <span>{new Date(latestUploadAt).toLocaleString("ru-RU")}</span>
          </p>
        ) : (
          <span className="dashboard-meta muted">Данные обновляются…</span>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="ghost-danger"
          onClick={() => setClearDialogOpen(true)}
        >
          Очистить дашборд
        </Button>
      </div>

      <Card>
        <details className="filters-panel" open>
          <summary className="filters-summary">
            <span className="section-title">Фильтры</span>
          </summary>
          <div className="filters-body">
            <div className="grid-2">
              <label className="field">
                Период с
                <Input
                  type="date"
                  value={fromDate}
                  onChange={(event) => setFromDate(event.target.value)}
                />
              </label>
              <label className="field">
                Период по
                <Input
                  type="date"
                  value={toDate}
                  onChange={(event) => setToDate(event.target.value)}
                />
              </label>
              <label className="field">
                Категория продукта
                <Select
                  value={productCategory}
                  onChange={(event) => setProductCategory(event.target.value)}
                >
                  <option value="">Все категории</option>
                  {categories.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="field">
                Продукт
                <Select
                  value={productName}
                  onChange={(event) => setProductName(event.target.value)}
                >
                  <option value="">Все продукты</option>
                  {productNames.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="field">
                Менеджер
                <Select value={manager} onChange={(event) => setManager(event.target.value)}>
                  <option value="">Все менеджеры</option>
                  {managerNames.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="field">
                Тип продукта
                <Select value={productType} onChange={(event) => setProductType(event.target.value)}>
                  <option value="">Все типы</option>
                  {types.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </Select>
              </label>
            </div>
          </div>
          <div className="filters-actions">
            <Button variant="primary" size="sm" onClick={handleApply}>
              Применить
            </Button>
            <Button variant="secondary" size="sm" onClick={handleResetFilters}>
              Сбросить
            </Button>
          </div>
        </details>
      </Card>

      {error ? <Card tone="bordered">{error}</Card> : null}
      {isLoading ? (
        <Card>
          <Skeleton height={20} width={180} />
          <Skeleton height={90} />
        </Card>
      ) : null}

      {hasNoData ? (
        <Card>
          <div className="empty-state">
            <strong>Нет данных по выбранным фильтрам</strong>
            <span>Попробуйте изменить период или сбросить фильтры.</span>
            <Button variant="secondary" onClick={handleResetFilters}>
              Сбросить фильтры
            </Button>
          </div>
        </Card>
      ) : null}

      {dashboard && activePack ? (
        <div className="grid">
          <Card>
            <div className="tabs">
              {TAB_CONFIG.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  className={`tab-button ${activeTab === tab.key ? "active" : ""}`}
                  onClick={() => setActiveTab(tab.key)}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </Card>

          <Card>
            <h3 className="section-title">{activePack.title}</h3>
            <div className="kpi-grid">
              {activePack.metrics.map((metric) => {
                const formula = METRIC_FORMULAS[metric.key];
                return (
                  <div key={metric.key} className="kpi-card">
                    <div className="kpi-card-top">
                      <span className="kpi-header">
                        <span className="kpi-title">{metric.title}</span>
                        {formula ? (
                          <Tooltip content={formula}>
                            <span
                              className="kpi-formula"
                              aria-label={`Формула: ${formula}`}
                              role="img"
                            >
                              ?
                            </span>
                          </Tooltip>
                        ) : null}
                      </span>
                      <span className="kpi-value">
                        {formatByKey(metric.key, metric.value)}
                      </span>
                    </div>
                    <div className="kpi-card-footer">
                      {renderDelta(metric.delta)}
                      {renderAvailability(metric)}
                      {insightByMetric[metric.key] ? (
                        <p className="helper-text kpi-insight">
                          {insightByMetric[metric.key].text}
                        </p>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          {activeTab === "groups_pack" ? (
            <Card>
              <div className="breadcrumb">
                <span>Группы:</span>
                <button
                  type="button"
                  className="breadcrumb-link"
                  onClick={() => setGroupPath([])}
                >
                  Все
                </button>
                {groupPath.map((value, index) => (
                  <button
                    key={`${value}-${index}`}
                    type="button"
                    className="breadcrumb-link"
                    onClick={() => handleGroupBreadcrumb(index + 1)}
                  >
                    {value}
                  </button>
                ))}
              </div>
              <p className="helper-text">
                Нажмите на группу, чтобы перейти глубже по иерархии.
              </p>
            </Card>
          ) : null}

          <div className="grid-2">
            {Object.entries(activePack.breakdowns)
              .filter(([, value]) => Array.isArray(value))
              .map(([key, value]) =>
                renderBreakdownTable(
                  key,
                  value as Array<Record<string, string | number>>,
                  activeTab === "groups_pack" && key === "revenue_by_group"
                    ? handleGroupRowClick
                    : undefined,
                ),
              )}
          </div>

          {activePack.series.length ? (
            <Card>
              <h3 className="section-title">Динамика</h3>
              {renderBreakdownTable("series", activePack.series)}
            </Card>
          ) : null}

          <Card>
            <h3 className="section-title">Insights</h3>
            {insights.length ? (
              <div className="grid">
                {insights.map((insight) => (
                  <Card key={insight.id} tone="soft">
                    <div className="page-header">
                      <span>{insight.metric_key}</span>
                      <span className="helper-text">
                        {insight.period_from} → {insight.period_to}
                      </span>
                    </div>
                    <p>{insight.text}</p>
                  </Card>
                ))}
              </div>
            ) : (
              <p className="helper-text">Пока нет инсайтов за выбранный период.</p>
            )}
          </Card>
        </div>
      ) : null}

      <Dialog
        open={clearDialogOpen}
        title="Очистить дашборд?"
        description="Это действие удалит метрики и инсайты. Данные загрузок сохранятся."
        onClose={() => setClearDialogOpen(false)}
        footer={
          <>
            <Button variant="ghost" type="button" onClick={() => setClearDialogOpen(false)}>
              Отмена
            </Button>
            <Button
              variant="destructive"
              type="button"
              onClick={handleClearDashboard}
              disabled={isClearing}
            >
              {isClearing ? "Очищаем..." : "Очистить"}
            </Button>
          </>
        }
      >
        <p>Вы уверены, что хотите очистить все витрины дашборда?</p>
      </Dialog>
    </div>
  );
}
