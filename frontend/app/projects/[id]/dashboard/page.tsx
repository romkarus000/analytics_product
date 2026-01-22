"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api";

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

export default function DashboardPage() {
  const router = useRouter();
  const params = useParams();
  const projectId = useMemo(
    () => (Array.isArray(params.id) ? params.id[0] : params.id),
    [params.id],
  );

  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [spend, setSpend] = useState<number | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [managers, setManagers] = useState<Manager[]>([]);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [productCategory, setProductCategory] = useState("");
  const [productName, setProductName] = useState("");
  const [manager, setManager] = useState("");
  const [productType, setProductType] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);

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
    } catch (err) {
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
    } catch (err) {
      // Ignore spend errors.
    }
  }, [fromDate, projectId, toDate]);

  useEffect(() => {
    loadDimensions();
  }, [loadDimensions]);

  useEffect(() => {
    loadDashboard();
    loadSpend();
  }, [loadDashboard, loadSpend]);

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
  };

  return (
    <main className="container">
      <div className="page-header">
        <div>
          <h1>Дашборды</h1>
          <p className="muted">
            Executive и Sales сводки с фильтрами по продуктам и менеджерам.
          </p>
        </div>
        <button
          type="button"
          className="secondary"
          onClick={() => router.push(`/projects/${projectId}`)}
        >
          Назад к проекту
        </button>
      </div>

      <section className="card dashboard-filters">
        <h2 className="section-title">Фильтры</h2>
        <div className="filter-grid">
          <label className="field">
            Период с
            <input
              type="date"
              value={fromDate}
              onChange={(event) => setFromDate(event.target.value)}
            />
          </label>
          <label className="field">
            Период по
            <input
              type="date"
              value={toDate}
              onChange={(event) => setToDate(event.target.value)}
            />
          </label>
          <label className="field">
            Категория продукта
            <select
              value={productCategory}
              onChange={(event) => setProductCategory(event.target.value)}
            >
              <option value="">Все категории</option>
              {categories.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Продукт
            <select
              value={productName}
              onChange={(event) => setProductName(event.target.value)}
            >
              <option value="">Все продукты</option>
              {productNames.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Менеджер
            <select
              value={manager}
              onChange={(event) => setManager(event.target.value)}
            >
              <option value="">Все менеджеры</option>
              {managerNames.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Тип продукта
            <select
              value={productType}
              onChange={(event) => setProductType(event.target.value)}
            >
              <option value="">Все типы</option>
              {types.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="filter-actions">
          <button type="button" onClick={handleApply}>
            Применить
          </button>
        </div>
      </section>

      {error ? <p className="error">{error}</p> : null}
      {isLoading ? <p>Загружаем дашборды...</p> : null}

      {dashboard ? (
        <div className="dashboard-grid">
          <section className="card dashboard-section">
            <h2 className="section-title">Executive</h2>
            <div className="metrics-grid">
              <div className="metric-card">
                <span className="metric-label">Gross Sales</span>
                <span className="metric-value">
                  {totals.gross_sales.toFixed(2)}
                </span>
              </div>
              <div className="metric-card">
                <span className="metric-label">Refunds</span>
                <span className="metric-value">
                  {totals.refunds.toFixed(2)}
                </span>
              </div>
              <div className="metric-card">
                <span className="metric-label">Net Revenue</span>
                <span className="metric-value">
                  {totals.net_revenue.toFixed(2)}
                </span>
              </div>
              <div className="metric-card">
                <span className="metric-label">Orders</span>
                <span className="metric-value">{totals.orders}</span>
              </div>
            </div>
          </section>

          <section className="card dashboard-section">
            <h2 className="section-title">Sales</h2>
            <div className="breakdown-grid">
              <div className="breakdown-card">
                <h3>Топ продуктов по выручке</h3>
                <ul>
                  {dashboard.breakdowns.top_products_by_revenue.map((item) => (
                    <li key={item.name}>
                      <span>{item.name}</span>
                      <strong>{item.revenue.toFixed(2)}</strong>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="breakdown-card">
                <h3>Топ менеджеров по выручке</h3>
                <ul>
                  {dashboard.breakdowns.top_managers_by_revenue.map((item) => (
                    <li key={item.name}>
                      <span>{item.name}</span>
                      <strong>{item.revenue.toFixed(2)}</strong>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="breakdown-card">
                <h3>Выручка по категориям</h3>
                <ul>
                  {dashboard.breakdowns.revenue_by_category.map((item) => (
                    <li key={item.name}>
                      <span>{item.name}</span>
                      <strong>{item.revenue.toFixed(2)}</strong>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="breakdown-card">
                <h3>Выручка по типам</h3>
                <ul>
                  {dashboard.breakdowns.revenue_by_type.map((item) => (
                    <li key={item.name}>
                      <span>{item.name}</span>
                      <strong>{item.revenue.toFixed(2)}</strong>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </section>

          {spend && spend > 0 ? (
            <section className="card dashboard-section">
              <h2 className="section-title">Marketing</h2>
              <div className="metrics-grid">
                <div className="metric-card">
                  <span className="metric-label">Spend</span>
                  <span className="metric-value">{spend.toFixed(2)}</span>
                </div>
              </div>
            </section>
          ) : null}

          <section className="card dashboard-section">
            <h2 className="section-title">Динамика по дням</h2>
            <div className="table-wrapper">
              <table className="dashboard-table">
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
                      <td>
                        {new Date(point.date).toLocaleDateString("ru-RU")}
                      </td>
                      <td>{point.gross_sales.toFixed(2)}</td>
                      <td>{point.refunds.toFixed(2)}</td>
                      <td>{point.net_revenue.toFixed(2)}</td>
                      <td>{point.orders}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
