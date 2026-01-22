"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { API_BASE } from "../../../lib/api";

type ProductAlias = {
  id: number;
  alias: string;
  product_id: number;
};

type Product = {
  id: number;
  canonical_name: string;
  category: string;
  product_type: string;
  created_at: string;
  aliases: ProductAlias[];
};

type ProductDraft = {
  canonical_name: string;
  category: string;
  product_type: string;
};

const PRODUCT_TYPES = [
  { value: "course", label: "Курс" },
  { value: "subscription", label: "Подписка" },
  { value: "addon", label: "Дополнение" },
  { value: "service", label: "Сервис" },
];

export default function ProductsPage() {
  const router = useRouter();
  const params = useParams();
  const projectId = useMemo(
    () => (Array.isArray(params.id) ? params.id[0] : params.id),
    [params.id],
  );

  const [products, setProducts] = useState<Product[]>([]);
  const [draft, setDraft] = useState<ProductDraft>({
    canonical_name: "",
    category: "",
    product_type: "course",
  });
  const [editDrafts, setEditDrafts] = useState<Record<number, ProductDraft>>({});
  const [aliasDrafts, setAliasDrafts] = useState<Record<number, string>>({});
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadProducts = useCallback(async () => {
    const accessToken = localStorage.getItem("access_token");
    if (!accessToken) {
      router.push("/login");
      return;
    }
    if (!projectId) {
      setError("Проект не найден.");
      return;
    }
    try {
      const response = await fetch(
        `${API_BASE}/projects/${projectId}/products`,
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
      const payload = (await response.json()) as Product[];
      if (!response.ok) {
        setError((payload as { detail?: string }).detail ?? "Не удалось загрузить продукты.");
        return;
      }
      setProducts(payload);
      setEditDrafts(
        payload.reduce<Record<number, ProductDraft>>((acc, product) => {
          acc[product.id] = {
            canonical_name: product.canonical_name,
            category: product.category,
            product_type: product.product_type,
          };
          return acc;
        }, {}),
      );
      setError("");
    } catch (err) {
      setError("Ошибка сети. Попробуйте ещё раз.");
    } finally {
      setIsLoading(false);
    }
  }, [projectId, router]);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  const handleCreate = async () => {
    setError("");
    setSuccess("");
    const accessToken = localStorage.getItem("access_token");
    if (!accessToken || !projectId) {
      router.push("/login");
      return;
    }
    if (!draft.canonical_name.trim() || !draft.category.trim()) {
      setError("Заполните название и категорию.");
      return;
    }
    setIsSubmitting(true);
    try {
      const response = await fetch(
        `${API_BASE}/projects/${projectId}/products`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            canonical_name: draft.canonical_name.trim(),
            category: draft.category.trim(),
            product_type: draft.product_type,
          }),
        },
      );
      if (response.status === 401) {
        localStorage.removeItem("access_token");
        localStorage.removeItem("refresh_token");
        router.push("/login");
        return;
      }
      const payload = await response.json();
      if (!response.ok) {
        setError(payload.detail ?? "Не удалось создать продукт.");
        return;
      }
      setSuccess("Продукт создан.");
      setDraft({ canonical_name: "", category: "", product_type: "course" });
      await loadProducts();
    } catch (err) {
      setError("Ошибка сети. Попробуйте ещё раз.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdate = async (productId: number) => {
    setError("");
    setSuccess("");
    const accessToken = localStorage.getItem("access_token");
    if (!accessToken || !projectId) {
      router.push("/login");
      return;
    }
    const updatePayload = editDrafts[productId];
    if (!updatePayload?.canonical_name.trim() || !updatePayload?.category.trim()) {
      setError("Заполните название и категорию.");
      return;
    }
    setIsSubmitting(true);
    try {
      const response = await fetch(
        `${API_BASE}/projects/${projectId}/products/${productId}`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            canonical_name: updatePayload.canonical_name.trim(),
            category: updatePayload.category.trim(),
            product_type: updatePayload.product_type,
          }),
        },
      );
      if (response.status === 401) {
        localStorage.removeItem("access_token");
        localStorage.removeItem("refresh_token");
        router.push("/login");
        return;
      }
      const payload = await response.json();
      if (!response.ok) {
        setError(payload.detail ?? "Не удалось обновить продукт.");
        return;
      }
      setSuccess("Продукт обновлён.");
      await loadProducts();
    } catch (err) {
      setError("Ошибка сети. Попробуйте ещё раз.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAliasAdd = async (productId: number) => {
    setError("");
    setSuccess("");
    const accessToken = localStorage.getItem("access_token");
    if (!accessToken || !projectId) {
      router.push("/login");
      return;
    }
    const aliasValue = aliasDrafts[productId]?.trim();
    if (!aliasValue) {
      setError("Введите алиас.");
      return;
    }
    setIsSubmitting(true);
    try {
      const response = await fetch(
        `${API_BASE}/projects/${projectId}/products/${productId}/aliases`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ alias: aliasValue }),
        },
      );
      if (response.status === 401) {
        localStorage.removeItem("access_token");
        localStorage.removeItem("refresh_token");
        router.push("/login");
        return;
      }
      const payload = await response.json();
      if (!response.ok) {
        setError(payload.detail ?? "Не удалось добавить алиас.");
        return;
      }
      setSuccess("Алиас добавлен.");
      setAliasDrafts((prev) => ({ ...prev, [productId]: "" }));
      await loadProducts();
    } catch (err) {
      setError("Ошибка сети. Попробуйте ещё раз.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="container">
      <div className="page-header">
        <div>
          <h1>Продукты</h1>
          <p className="muted">Создавайте каноничные продукты и склеивайте алиасы.</p>
        </div>
        <button
          type="button"
          className="secondary"
          onClick={() => router.push(`/projects/${projectId}`)}
        >
          Назад к проекту
        </button>
      </div>

      <div className="card section-card">
        <h2>Новый продукт</h2>
        <div className="grid form-grid">
          <label className="field">
            Каноничное название
            <input
              value={draft.canonical_name}
              onChange={(event) =>
                setDraft((prev) => ({ ...prev, canonical_name: event.target.value }))
              }
              placeholder="Например, Аналитика PRO"
            />
          </label>
          <label className="field">
            Категория
            <input
              value={draft.category}
              onChange={(event) =>
                setDraft((prev) => ({ ...prev, category: event.target.value }))
              }
              placeholder="Например, Обучение"
            />
          </label>
          <label className="field">
            Тип
            <select
              value={draft.product_type}
              onChange={(event) =>
                setDraft((prev) => ({ ...prev, product_type: event.target.value }))
              }
            >
              {PRODUCT_TYPES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="form-actions">
          <button type="button" disabled={isSubmitting} onClick={handleCreate}>
            {isSubmitting ? "Сохраняем..." : "Создать продукт"}
          </button>
        </div>
        {error ? <p className="error">{error}</p> : null}
        {success ? <p className="success">{success}</p> : null}
      </div>

      <div className="card section-card">
        <h2>Список продуктов</h2>
        {isLoading ? <p>Загружаем продукты...</p> : null}
        {!isLoading && products.length === 0 ? (
          <p className="muted">Пока нет продуктов. Добавьте первый.</p>
        ) : null}
        <div className="dimension-list">
          {products.map((product) => (
            <div key={product.id} className="dimension-item">
              <div className="dimension-header">
                <div>
                  <h3>{product.canonical_name}</h3>
                  <p className="muted">
                    Категория: {product.category} · Тип: {product.product_type}
                  </p>
                </div>
                <span className="badge">
                  Создан {new Date(product.created_at).toLocaleDateString("ru-RU")}
                </span>
              </div>
              <div className="alias-list">
                {product.aliases.length > 0 ? (
                  product.aliases.map((alias) => (
                    <span key={alias.id} className="alias-pill">
                      {alias.alias}
                    </span>
                  ))
                ) : (
                  <span className="muted">Алиасы не добавлены.</span>
                )}
              </div>
              <div className="grid form-grid">
                <label className="field">
                  Каноничное название
                  <input
                    value={editDrafts[product.id]?.canonical_name ?? ""}
                    onChange={(event) =>
                      setEditDrafts((prev) => ({
                        ...prev,
                        [product.id]: {
                          ...prev[product.id],
                          canonical_name: event.target.value,
                        },
                      }))
                    }
                  />
                </label>
                <label className="field">
                  Категория
                  <input
                    value={editDrafts[product.id]?.category ?? ""}
                    onChange={(event) =>
                      setEditDrafts((prev) => ({
                        ...prev,
                        [product.id]: {
                          ...prev[product.id],
                          category: event.target.value,
                        },
                      }))
                    }
                  />
                </label>
                <label className="field">
                  Тип
                  <select
                    value={editDrafts[product.id]?.product_type ?? "course"}
                    onChange={(event) =>
                      setEditDrafts((prev) => ({
                        ...prev,
                        [product.id]: {
                          ...prev[product.id],
                          product_type: event.target.value,
                        },
                      }))
                    }
                  >
                    {PRODUCT_TYPES.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="form-actions">
                <button
                  type="button"
                  className="secondary"
                  disabled={isSubmitting}
                  onClick={() => handleUpdate(product.id)}
                >
                  Сохранить изменения
                </button>
              </div>
              <div className="alias-form">
                <label className="field">
                  Новый алиас
                  <input
                    value={aliasDrafts[product.id] ?? ""}
                    onChange={(event) =>
                      setAliasDrafts((prev) => ({
                        ...prev,
                        [product.id]: event.target.value,
                      }))
                    }
                    placeholder="Например, PRO-2024"
                  />
                </label>
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => handleAliasAdd(product.id)}
                >
                  Склеить алиас
                </button>
              </div>
            </div>
          ))}
        </div>
        {error ? <p className="error">{error}</p> : null}
        {success ? <p className="success">{success}</p> : null}
      </div>
    </main>
  );
}
