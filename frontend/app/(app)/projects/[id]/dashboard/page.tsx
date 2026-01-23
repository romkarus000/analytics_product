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

import { useToast } from "../../../../../components/ui/Toast";

type DashboardSeriesPoint = {
  date: string;
  gross_sales: number;
  refunds: number;
  net_revenue: number;
  orders: number;
};

type RevenueBreakdownItem = {
  name: string;
  revenue: number;
};

type DashboardBreakdowns = {
  top_products_by_revenue: RevenueBreakdownItem[];
  top_managers_by_revenue: RevenueBreakdownItem[];
  revenue_by_category: RevenueBreakdownItem[];
  revenue_by_type: RevenueBreakdownItem[];
};

type DashboardResponse = {
  from_date: string | null;
  to_date: string | null;
  filters: Record<string, string>;
  series: DashboardSeriesPoint[];
  breakdowns: DashboardBreakdowns;
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

export default function DashboardPage() {
  const router = useRouter();
  const params = useParams();
  const { pushToast } = useToast();
  const projectId = useMemo(
    () => (Array.isArray(params.id) ? params.id[0] : params.id),
    [params.id],
  );

  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [spend, setSpend] = useState<number | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [managers, setManagers] = useState<Manager[]>([]);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [productCategory, setProductCategory] = useState("");
  const [productName, setProductName] = useState("");
  const [manager, setManager] = useState("");
  const [productType, setProductType] = useState("");
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
    return filters;
  }, [manager, productCategory, productName, productType]);

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

  const loadSpend = useCallback(async () => {
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
        `${API_BASE}/projects/${projectId}/metrics/spend?${params.toString()}`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        },
      );
      if (!response.ok) {
        return;
      }
      const payload = await response.json();
      setSpend(payload.value ?? 0);
    } catch {
      // Ignore spend errors.
    }
  }, [fromDate, projectId, toDate]);

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
    loadSpend();
    loadInsights();
  }, [loadDashboard, loadInsights, loadSpend]);

  const totals = useMemo(() => {
    if (!dashboard) {
      return {
        gross_sales: 0,
        refunds: 0,
        net_revenue: 0,
        orders: 0,
      };
    }
    return dashboard.series.reduce(
      (acc, point) => ({
        gross_sales: acc.gross_sales + point.gross_sales,
        refunds: acc.refunds + point.refunds,
        net_revenue: acc.net_revenue + point.net_revenue,
        orders: acc.orders + point.orders,
      }),
      { gross_sales: 0, refunds: 0, net_revenue: 0, orders: 0 },
    );
  }, [dashboard]);

  const handleApply = () => {
    loadDashboard();
    loadSpend();
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
      setDashboard(null);
      setSpend(null);
      setInsights([]);
      setProducts([]);
      setManagers([]);
      await Promise.all([loadDashboard(), loadSpend(), loadInsights(), loadDimensions()]);
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
    loadDashboard();
  };

  const hasNoData = dashboard && dashboard.series.length === 0;

  return (
    <div className="page">
      <section className="page-header">
        <div>
          <h2 className="section-title">Дэшборд</h2>
          <p className="helper-text">
            Что дальше? Настройте фильтры, чтобы получить сводку по продажам.
          </p>
        </div>
        <div className="inline-actions">
          <Button variant="secondary" onClick={() => router.push(`/projects/${projectId}`)}>
            К проекту
          </Button>
          <Button variant="destructive" onClick={() => setClearDialogOpen(true)}>
            Очистить дашборд
          </Button>
        </div>
      </section>

      <Card>
        <div className="grid">
          <h3 className="section-title">Фильтры</h3>
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
              <Select value={productName} onChange={(event) => setProductName(event.target.value)}>
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
          <div className="inline-actions">
            <Button variant="primary" onClick={handleApply}>
              Применить
            </Button>
            <Button variant="secondary" onClick={handleResetFilters}>
              Сбросить фильтры
            </Button>
          </div>
        </div>
      </Card>

      {latestUploadAt ? (
        <Card tone="bordered">
          Последнее обновление данных: {new Date(latestUploadAt).toLocaleString("ru-RU")}
        </Card>
      ) : null}

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

      {dashboard ? (
        <div className="grid">
          <Card>
            <h3 className="section-title">Executive</h3>
            <div className="kpi-grid">
              <div className="kpi-card">
                <span className="kpi-label">Gross Sales</span>
                <span className="kpi-value">{totals.gross_sales.toFixed(2)}</span>
                {insightByMetric.gross_sales ? (
                  <p className="helper-text">{insightByMetric.gross_sales.text}</p>
                ) : null}
              </div>
              <div className="kpi-card">
                <span className="kpi-label">Refunds</span>
                <span className="kpi-value">{totals.refunds.toFixed(2)}</span>
                {insightByMetric.refunds ? (
                  <p className="helper-text">{insightByMetric.refunds.text}</p>
                ) : null}
              </div>
              <div className="kpi-card">
                <span className="kpi-label">Net Revenue</span>
                <span className="kpi-value">{totals.net_revenue.toFixed(2)}</span>
                {insightByMetric.net_revenue ? (
                  <p className="helper-text">{insightByMetric.net_revenue.text}</p>
                ) : null}
              </div>
              <div className="kpi-card">
                <span className="kpi-label">Orders</span>
                <span className="kpi-value">{totals.orders}</span>
                {insightByMetric.orders ? (
                  <p className="helper-text">{insightByMetric.orders.text}</p>
                ) : null}
              </div>
            </div>
          </Card>

          <Card>
            <h3 className="section-title">Sales</h3>
            <div className="grid-2">
              <Card tone="soft">
                <h4>Топ продуктов по выручке</h4>
                <div className="grid">
                  {dashboard.breakdowns.top_products_by_revenue.map((item) => (
                    <div key={item.name} className="row-card">
                      <span>{item.name}</span>
                      <strong>{item.revenue.toFixed(2)}</strong>
                    </div>
                  ))}
                </div>
              </Card>
              <Card tone="soft">
                <h4>Топ менеджеров по выручке</h4>
                <div className="grid">
                  {dashboard.breakdowns.top_managers_by_revenue.map((item) => (
                    <div key={item.name} className="row-card">
                      <span>{item.name}</span>
                      <strong>{item.revenue.toFixed(2)}</strong>
                    </div>
                  ))}
                </div>
              </Card>
              <Card tone="soft">
                <h4>Выручка по категориям</h4>
                <div className="grid">
                  {dashboard.breakdowns.revenue_by_category.map((item) => (
                    <div key={item.name} className="row-card">
                      <span>{item.name}</span>
                      <strong>{item.revenue.toFixed(2)}</strong>
                    </div>
                  ))}
                </div>
              </Card>
              <Card tone="soft">
                <h4>Выручка по типам</h4>
                <div className="grid">
                  {dashboard.breakdowns.revenue_by_type.map((item) => (
                    <div key={item.name} className="row-card">
                      <span>{item.name}</span>
                      <strong>{item.revenue.toFixed(2)}</strong>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          </Card>

          {spend && spend > 0 ? (
            <Card>
              <h3 className="section-title">Marketing</h3>
              <div className="kpi-grid">
                <div className="kpi-card">
                  <span className="kpi-label">Spend</span>
                  <span className="kpi-value">{spend.toFixed(2)}</span>
                </div>
              </div>
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

          <Card>
            <h3 className="section-title">Динамика по дням</h3>
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Дата</th>
                    <th>Gross Sales</th>
                    <th>Refunds</th>
                    <th>Net Revenue</th>
                    <th>Orders</th>
                  </tr>
                </thead>
                <tbody>
                  {dashboard.series.map((point) => (
                    <tr key={point.date}>
                      <td>{new Date(point.date).toLocaleDateString("ru-RU")}</td>
                      <td>{point.gross_sales.toFixed(2)}</td>
                      <td>{point.refunds.toFixed(2)}</td>
                      <td>{point.net_revenue.toFixed(2)}</td>
                      <td>{point.orders}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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
