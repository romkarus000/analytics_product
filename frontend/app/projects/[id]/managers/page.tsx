"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { API_BASE } from "../../../lib/api";

type ManagerAlias = {
  id: number;
  alias: string;
  manager_id: number;
};

type Manager = {
  id: number;
  canonical_name: string;
  created_at: string;
  aliases: ManagerAlias[];
};

export default function ManagersPage() {
  const router = useRouter();
  const params = useParams();
  const projectId = useMemo(
    () => (Array.isArray(params.id) ? params.id[0] : params.id),
    [params.id],
  );

  const [managers, setManagers] = useState<Manager[]>([]);
  const [newName, setNewName] = useState("");
  const [editDrafts, setEditDrafts] = useState<Record<number, string>>({});
  const [aliasDrafts, setAliasDrafts] = useState<Record<number, string>>({});
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadManagers = useCallback(async () => {
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
        `${API_BASE}/projects/${projectId}/managers`,
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
      const payload = (await response.json()) as Manager[];
      if (!response.ok) {
        setError((payload as { detail?: string }).detail ?? "Не удалось загрузить менеджеров.");
        return;
      }
      setManagers(payload);
      setEditDrafts(
        payload.reduce<Record<number, string>>((acc, manager) => {
          acc[manager.id] = manager.canonical_name;
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
    loadManagers();
  }, [loadManagers]);

  const handleCreate = async () => {
    setError("");
    setSuccess("");
    const accessToken = localStorage.getItem("access_token");
    if (!accessToken || !projectId) {
      router.push("/login");
      return;
    }
    if (!newName.trim()) {
      setError("Введите имя менеджера.");
      return;
    }
    setIsSubmitting(true);
    try {
      const response = await fetch(
        `${API_BASE}/projects/${projectId}/managers`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ canonical_name: newName.trim() }),
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
        setError(payload.detail ?? "Не удалось создать менеджера.");
        return;
      }
      setSuccess("Менеджер создан.");
      setNewName("");
      await loadManagers();
    } catch (err) {
      setError("Ошибка сети. Попробуйте ещё раз.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdate = async (managerId: number) => {
    setError("");
    setSuccess("");
    const accessToken = localStorage.getItem("access_token");
    if (!accessToken || !projectId) {
      router.push("/login");
      return;
    }
    const name = editDrafts[managerId]?.trim();
    if (!name) {
      setError("Введите имя менеджера.");
      return;
    }
    setIsSubmitting(true);
    try {
      const response = await fetch(
        `${API_BASE}/projects/${projectId}/managers/${managerId}`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ canonical_name: name }),
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
        setError(payload.detail ?? "Не удалось обновить менеджера.");
        return;
      }
      setSuccess("Менеджер обновлён.");
      await loadManagers();
    } catch (err) {
      setError("Ошибка сети. Попробуйте ещё раз.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAliasAdd = async (managerId: number) => {
    setError("");
    setSuccess("");
    const accessToken = localStorage.getItem("access_token");
    if (!accessToken || !projectId) {
      router.push("/login");
      return;
    }
    const aliasValue = aliasDrafts[managerId]?.trim();
    if (!aliasValue) {
      setError("Введите алиас.");
      return;
    }
    setIsSubmitting(true);
    try {
      const response = await fetch(
        `${API_BASE}/projects/${projectId}/managers/${managerId}/aliases`,
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
      setAliasDrafts((prev) => ({ ...prev, [managerId]: "" }));
      await loadManagers();
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
          <h1>Менеджеры</h1>
          <p className="muted">Сопоставляйте алиасы менеджеров с каноничными именами.</p>
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
        <h2>Новый менеджер</h2>
        <label className="field">
          Каноничное имя
          <input
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            placeholder="Например, Ирина"
          />
        </label>
        <div className="form-actions">
          <button type="button" disabled={isSubmitting} onClick={handleCreate}>
            {isSubmitting ? "Сохраняем..." : "Создать менеджера"}
          </button>
        </div>
        {error ? <p className="error">{error}</p> : null}
        {success ? <p className="success">{success}</p> : null}
      </div>

      <div className="card section-card">
        <h2>Список менеджеров</h2>
        {isLoading ? <p>Загружаем менеджеров...</p> : null}
        {!isLoading && managers.length === 0 ? (
          <p className="muted">Пока нет менеджеров. Добавьте первого.</p>
        ) : null}
        <div className="dimension-list">
          {managers.map((manager) => (
            <div key={manager.id} className="dimension-item">
              <div className="dimension-header">
                <div>
                  <h3>{manager.canonical_name}</h3>
                  <p className="muted">
                    Создан {new Date(manager.created_at).toLocaleDateString("ru-RU")}
                  </p>
                </div>
                <span className="badge">ID {manager.id}</span>
              </div>
              <div className="alias-list">
                {manager.aliases.length > 0 ? (
                  manager.aliases.map((alias) => (
                    <span key={alias.id} className="alias-pill">
                      {alias.alias}
                    </span>
                  ))
                ) : (
                  <span className="muted">Алиасы не добавлены.</span>
                )}
              </div>
              <label className="field">
                Каноничное имя
                <input
                  value={editDrafts[manager.id] ?? ""}
                  onChange={(event) =>
                    setEditDrafts((prev) => ({
                      ...prev,
                      [manager.id]: event.target.value,
                    }))
                  }
                />
              </label>
              <div className="form-actions">
                <button
                  type="button"
                  className="secondary"
                  disabled={isSubmitting}
                  onClick={() => handleUpdate(manager.id)}
                >
                  Сохранить изменения
                </button>
              </div>
              <div className="alias-form">
                <label className="field">
                  Новый алиас
                  <input
                    value={aliasDrafts[manager.id] ?? ""}
                    onChange={(event) =>
                      setAliasDrafts((prev) => ({
                        ...prev,
                        [manager.id]: event.target.value,
                      }))
                    }
                    placeholder="Например, IRINA"
                  />
                </label>
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => handleAliasAdd(manager.id)}
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
