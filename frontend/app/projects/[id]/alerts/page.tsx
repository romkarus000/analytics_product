"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api";

type TelegramBinding = {
  id: number;
  project_id: number;
  chat_id: string;
  created_at: string;
};

type AlertRule = {
  id: number;
  project_id: number;
  metric_key: string;
  rule_type: string;
  params: Record<string, unknown>;
  is_enabled: boolean;
  created_at: string;
};

type MetricDefinition = {
  metric_key: string;
  title: string;
  description?: string | null;
  is_available: boolean;
};

export default function AlertsPage() {
  const router = useRouter();
  const params = useParams();
  const projectId = useMemo(
    () => (Array.isArray(params.id) ? params.id[0] : params.id),
    [params.id],
  );

  const [binding, setBinding] = useState<TelegramBinding | null>(null);
  const [chatId, setChatId] = useState("");
  const [bindingMessage, setBindingMessage] = useState("");
  const [bindingMessageType, setBindingMessageType] = useState<
    "success" | "error" | ""
  >("");
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [metrics, setMetrics] = useState<MetricDefinition[]>([]);
  const [metricKey, setMetricKey] = useState("");
  const [ruleType, setRuleType] = useState("threshold");
  const [threshold, setThreshold] = useState("1000");
  const [comparison, setComparison] = useState("gt");
  const [lookbackDays, setLookbackDays] = useState("1");
  const [deltaPercent, setDeltaPercent] = useState("20");
  const [direction, setDirection] = useState("up");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  const availableMetrics = useMemo(
    () => metrics.filter((metric) => metric.is_available),
    [metrics],
  );

  const getAccessToken = useCallback(() => {
    const accessToken = localStorage.getItem("access_token");
    if (!accessToken) {
      router.push("/login");
      return null;
    }
    return accessToken;
  }, [router]);

  const loadMetrics = useCallback(async () => {
    const accessToken = getAccessToken();
    if (!accessToken || !projectId) {
      return;
    }
    const response = await fetch(`${API_BASE}/projects/${projectId}/metrics`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (response.status === 401) {
      localStorage.removeItem("access_token");
      localStorage.removeItem("refresh_token");
      router.push("/login");
      return;
    }
    if (response.ok) {
      const payload = (await response.json()) as MetricDefinition[];
      setMetrics(payload);
      if (!metricKey && payload.length > 0) {
        setMetricKey(payload[0].metric_key);
      }
    }
  }, [getAccessToken, metricKey, projectId, router]);

  const loadBinding = useCallback(async () => {
    const accessToken = getAccessToken();
    if (!accessToken || !projectId) {
      return;
    }
    const response = await fetch(`${API_BASE}/projects/${projectId}/telegram`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (response.status === 401) {
      localStorage.removeItem("access_token");
      localStorage.removeItem("refresh_token");
      router.push("/login");
      return;
    }
    if (response.ok) {
      const payload = (await response.json()) as TelegramBinding;
      setBinding(payload);
      setChatId(payload.chat_id);
    } else {
      setBinding(null);
    }
  }, [getAccessToken, projectId, router]);

  const loadRules = useCallback(async () => {
    const accessToken = getAccessToken();
    if (!accessToken || !projectId) {
      return;
    }
    const response = await fetch(`${API_BASE}/projects/${projectId}/alerts`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (response.status === 401) {
      localStorage.removeItem("access_token");
      localStorage.removeItem("refresh_token");
      router.push("/login");
      return;
    }
    if (!response.ok) {
      return;
    }
    const payload = (await response.json()) as AlertRule[];
    setRules(payload);
  }, [getAccessToken, projectId, router]);

  useEffect(() => {
    if (!projectId) {
      setError("Проект не найден.");
      return;
    }
    setIsLoading(true);
    setError("");
    Promise.all([loadBinding(), loadRules(), loadMetrics()])
      .catch(() => {
        setError("Ошибка сети. Попробуйте ещё раз.");
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [loadBinding, loadMetrics, loadRules, projectId]);

  const handleSaveBinding = async () => {
    const accessToken = getAccessToken();
    if (!accessToken || !projectId) {
      return;
    }
    setBindingMessage("");
    const response = await fetch(`${API_BASE}/projects/${projectId}/telegram`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ chat_id: chatId }),
    });
    if (response.status === 401) {
      localStorage.removeItem("access_token");
      localStorage.removeItem("refresh_token");
      router.push("/login");
      return;
    }
    if (response.ok) {
      const payload = (await response.json()) as TelegramBinding;
      setBinding(payload);
      setBindingMessage("Telegram подключен.");
      setBindingMessageType("success");
    } else {
      const payload = (await response.json()) as { detail?: string };
      setBindingMessage(payload.detail ?? "Не удалось сохранить chat_id.");
      setBindingMessageType("error");
    }
  };

  const handleDeleteBinding = async () => {
    const accessToken = getAccessToken();
    if (!accessToken || !projectId) {
      return;
    }
    const response = await fetch(`${API_BASE}/projects/${projectId}/telegram`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (response.status === 401) {
      localStorage.removeItem("access_token");
      localStorage.removeItem("refresh_token");
      router.push("/login");
      return;
    }
    setBinding(null);
    setBindingMessage("Telegram отключен.");
    setBindingMessageType("success");
  };

  const handleTelegramTest = async () => {
    const accessToken = getAccessToken();
    if (!accessToken || !projectId) {
      return;
    }
    const response = await fetch(`${API_BASE}/projects/${projectId}/telegram/test`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (response.status === 401) {
      localStorage.removeItem("access_token");
      localStorage.removeItem("refresh_token");
      router.push("/login");
      return;
    }
    if (response.ok) {
      setBindingMessage("Тестовое сообщение отправлено.");
      setBindingMessageType("success");
    } else {
      const payload = (await response.json()) as { detail?: string };
      setBindingMessage(payload.detail ?? "Не удалось отправить тест.");
      setBindingMessageType("error");
    }
  };

  const handleCreateRule = async () => {
    const accessToken = getAccessToken();
    if (!accessToken || !projectId) {
      return;
    }
    const paramsPayload =
      ruleType === "threshold"
        ? {
            threshold: Number(threshold),
            comparison,
            lookback_days: Number(lookbackDays),
          }
        : {
            delta_percent: Number(deltaPercent),
            direction,
            lookback_days: Number(lookbackDays),
          };
    const response = await fetch(`${API_BASE}/projects/${projectId}/alerts`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        metric_key: metricKey,
        rule_type: ruleType,
        params: paramsPayload,
        is_enabled: true,
      }),
    });
    if (response.status === 401) {
      localStorage.removeItem("access_token");
      localStorage.removeItem("refresh_token");
      router.push("/login");
      return;
    }
    if (response.ok) {
      await loadRules();
    } else {
      const payload = (await response.json()) as { detail?: string };
      setError(payload.detail ?? "Не удалось создать правило.");
    }
  };

  const handleToggleRule = async (rule: AlertRule) => {
    const accessToken = getAccessToken();
    if (!accessToken || !projectId) {
      return;
    }
    const response = await fetch(
      `${API_BASE}/projects/${projectId}/alerts/${rule.id}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ is_enabled: !rule.is_enabled }),
      },
    );
    if (response.status === 401) {
      localStorage.removeItem("access_token");
      localStorage.removeItem("refresh_token");
      router.push("/login");
      return;
    }
    if (response.ok) {
      await loadRules();
    }
  };

  const handleDeleteRule = async (ruleId: number) => {
    const accessToken = getAccessToken();
    if (!accessToken || !projectId) {
      return;
    }
    const response = await fetch(
      `${API_BASE}/projects/${projectId}/alerts/${ruleId}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );
    if (response.status === 401) {
      localStorage.removeItem("access_token");
      localStorage.removeItem("refresh_token");
      router.push("/login");
      return;
    }
    if (response.ok) {
      await loadRules();
    }
  };

  const handleRuleSendTest = async (ruleId: number) => {
    const accessToken = getAccessToken();
    if (!accessToken || !projectId) {
      return;
    }
    const response = await fetch(
      `${API_BASE}/projects/${projectId}/alerts/${ruleId}/send-test`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );
    if (response.status === 401) {
      localStorage.removeItem("access_token");
      localStorage.removeItem("refresh_token");
      router.push("/login");
      return;
    }
    if (!response.ok) {
      const payload = (await response.json()) as { detail?: string };
      setError(payload.detail ?? "Не удалось отправить тест.");
    }
  };

  return (
    <main className="container">
      <div className="page-header">
        <div>
          <h1 className="section-title">Telegram-алерты</h1>
          <p className="muted">
            Подключите чат Telegram и настройте правила мониторинга метрик.
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

      {error ? <p className="error">{error}</p> : null}
      {isLoading ? <p>Загружаем настройки...</p> : null}

      <section className="card section-card">
        <h2 className="section-title">Подключение Telegram</h2>
        <div className="form-grid">
          <label className="field">
            Chat ID
            <input
              value={chatId}
              onChange={(event) => setChatId(event.target.value)}
              placeholder="Например, 123456789"
            />
          </label>
          <div className="form-actions">
            <button type="button" onClick={handleSaveBinding}>
              {binding ? "Обновить" : "Подключить"}
            </button>
            <button
              type="button"
              className="secondary"
              onClick={handleTelegramTest}
              disabled={!binding}
            >
              Отправить тест
            </button>
            {binding ? (
              <button
                type="button"
                className="secondary"
                onClick={handleDeleteBinding}
              >
                Отключить
              </button>
            ) : null}
          </div>
        </div>
        {bindingMessage ? (
          <p className={bindingMessageType === "error" ? "error" : "success"}>
            {bindingMessage}
          </p>
        ) : null}
      </section>

      <section className="card section-card">
        <h2 className="section-title">Новое правило</h2>
        <div className="form-grid">
          <label className="field">
            Метрика
            <select
              value={metricKey}
              onChange={(event) => setMetricKey(event.target.value)}
            >
              {availableMetrics.map((metric) => (
                <option key={metric.metric_key} value={metric.metric_key}>
                  {metric.title}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Тип правила
            <select
              value={ruleType}
              onChange={(event) => setRuleType(event.target.value)}
            >
              <option value="threshold">Порог</option>
              <option value="anomaly">Аномалия</option>
            </select>
          </label>
          {ruleType === "threshold" ? (
            <>
              <label className="field">
                Порог
                <input
                  value={threshold}
                  onChange={(event) => setThreshold(event.target.value)}
                  type="number"
                />
              </label>
              <label className="field">
                Сравнение
                <select
                  value={comparison}
                  onChange={(event) => setComparison(event.target.value)}
                >
                  <option value="gt">Больше</option>
                  <option value="gte">Больше или равно</option>
                  <option value="lt">Меньше</option>
                  <option value="lte">Меньше или равно</option>
                </select>
              </label>
            </>
          ) : (
            <>
              <label className="field">
                Порог, %
                <input
                  value={deltaPercent}
                  onChange={(event) => setDeltaPercent(event.target.value)}
                  type="number"
                />
              </label>
              <label className="field">
                Направление
                <select
                  value={direction}
                  onChange={(event) => setDirection(event.target.value)}
                >
                  <option value="up">Рост</option>
                  <option value="down">Падение</option>
                </select>
              </label>
            </>
          )}
          <label className="field">
            Период, дней
            <input
              value={lookbackDays}
              onChange={(event) => setLookbackDays(event.target.value)}
              type="number"
              min={1}
            />
          </label>
          <div className="form-actions">
            <button type="button" onClick={handleCreateRule} disabled={!metricKey}>
              Создать правило
            </button>
          </div>
        </div>
      </section>

      <section className="card section-card">
        <h2 className="section-title">Правила</h2>
        {rules.length === 0 ? (
          <p className="muted">Правила ещё не настроены.</p>
        ) : (
          <div className="alerts-grid">
            {rules.map((rule) => (
              <div className="alert-card" key={rule.id}>
                <div className="alert-header">
                  <div>
                    <strong>{rule.metric_key}</strong>
                    <p className="muted">{rule.rule_type}</p>
                  </div>
                  <span className={rule.is_enabled ? "badge" : "muted"}>
                    {rule.is_enabled ? "Включено" : "Выключено"}
                  </span>
                </div>
                <pre className="alert-params">
                  {JSON.stringify(rule.params, null, 2)}
                </pre>
                <div className="alert-actions">
                  <button type="button" onClick={() => handleToggleRule(rule)}>
                    {rule.is_enabled ? "Выключить" : "Включить"}
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => handleRuleSendTest(rule.id)}
                  >
                    Send test
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => handleDeleteRule(rule.id)}
                  >
                    Удалить
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
