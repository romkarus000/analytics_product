"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { API_BASE } from "../../../lib/api";

type UploadType = "transactions" | "marketing_spend";

type PreviewResponse = {
  headers: string[];
  sample_rows: Array<Array<string | number | null>>;
  inferred_types: Record<string, string>;
  mapping_suggestions: Record<string, string | null>;
  upload_type?: UploadType;
};

type NormalizationRule = {
  trim: boolean;
  lowercase: boolean;
  uppercase: boolean;
};

type QualityIssue = {
  row: number;
  field: string;
  message: string;
};

type QualityReport = {
  errors: QualityIssue[];
  warnings: QualityIssue[];
  stats: {
    total_rows: number;
    valid_rows: number;
    error_count: number;
    warning_count: number;
  };
};

type ImportResult = {
  imported: number;
};

const REQUIRED_FIELDS: Record<UploadType, string[]> = {
  transactions: [
    "order_id",
    "date",
    "operation_type",
    "amount",
    "client_id",
    "product_name",
    "product_category",
    "manager",
  ],
  marketing_spend: ["date", "spend_amount"],
};

const FIELD_LABELS: Record<string, string> = {
  order_id: "ID заказа",
  date: "Дата",
  operation_type: "Тип операции",
  amount: "Сумма",
  client_id: "ID клиента",
  product_name: "Название товара",
  product_category: "Категория товара",
  manager: "Менеджер",
  spend_amount: "Маркетинговые расходы",
  ignore: "Игнорировать",
};

const FIELD_OPTIONS: Record<UploadType, string[]> = {
  transactions: [
    "order_id",
    "date",
    "operation_type",
    "amount",
    "client_id",
    "product_name",
    "product_category",
    "manager",
    "ignore",
  ],
  marketing_spend: ["date", "spend_amount", "ignore"],
};

export default function UploadMappingPage() {
  const router = useRouter();
  const params = useParams();
  const uploadId = useMemo(
    () => (Array.isArray(params.id) ? params.id[0] : params.id),
    [params.id],
  );

  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [normalization, setNormalization] = useState<
    Record<string, NormalizationRule>
  >({});
  const [uploadType, setUploadType] = useState<UploadType | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [qualityReport, setQualityReport] = useState<QualityReport | null>(null);

  useEffect(() => {
    const accessToken = localStorage.getItem("access_token");
    if (!accessToken) {
      router.push("/login");
      return;
    }
    if (!uploadId) {
      setError("Загрузка не найдена.");
      setIsLoading(false);
      return;
    }

    const loadPreview = async () => {
      try {
        const response = await fetch(`${API_BASE}/uploads/${uploadId}/preview`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (response.status === 401) {
          localStorage.removeItem("access_token");
          localStorage.removeItem("refresh_token");
          router.push("/login");
          return;
        }
        const payload = (await response.json()) as PreviewResponse;
        if (!response.ok) {
          setError((payload as { detail?: string }).detail ?? "Не удалось получить предпросмотр.");
          return;
        }
        setPreview(payload);
        if (payload.upload_type) {
          setUploadType(payload.upload_type);
        }
        const initialMapping: Record<string, string> = {};
        const initialNormalization: Record<string, NormalizationRule> = {};
        payload.headers.forEach((header) => {
          initialMapping[header] = payload.mapping_suggestions[header] ?? "";
          initialNormalization[header] = {
            trim: true,
            lowercase: false,
            uppercase: false,
          };
        });
        setMapping(initialMapping);
        setNormalization(initialNormalization);
      } catch (err) {
        setError("Ошибка сети. Попробуйте ещё раз.");
      } finally {
        setIsLoading(false);
      }
    };

    loadPreview();
  }, [router, uploadId]);

  const requiredFields = uploadType ? REQUIRED_FIELDS[uploadType] : [];
  const missingRequired = requiredFields.filter(
    (field) => !Object.values(mapping).includes(field),
  );

  const handleSave = async () => {
    setError("");
    setSuccess("");
    setQualityReport(null);
    const accessToken = localStorage.getItem("access_token");
    if (!accessToken) {
      router.push("/login");
      return;
    }
    if (!uploadId) {
      setError("Загрузка не найдена.");
      return;
    }
    if (missingRequired.length > 0) {
      setError("Заполните обязательные поля перед сохранением.");
      return;
    }
    setIsSubmitting(true);
    try {
      const response = await fetch(`${API_BASE}/uploads/${uploadId}/mapping`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          mapping,
          normalization,
        }),
      });
      if (response.status === 401) {
        localStorage.removeItem("access_token");
        localStorage.removeItem("refresh_token");
        router.push("/login");
        return;
      }
      const payload = await response.json();
      if (!response.ok) {
        setError(payload.detail ?? "Не удалось сохранить маппинг.");
        return;
      }
      setSuccess("Маппинг успешно сохранён.");
    } catch (err) {
      setError("Ошибка сети. Попробуйте ещё раз.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleValidate = async () => {
    setError("");
    setSuccess("");
    const accessToken = localStorage.getItem("access_token");
    if (!accessToken) {
      router.push("/login");
      return;
    }
    if (!uploadId) {
      setError("Загрузка не найдена.");
      return;
    }
    setIsValidating(true);
    try {
      const response = await fetch(`${API_BASE}/uploads/${uploadId}/validate`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (response.status === 401) {
        localStorage.removeItem("access_token");
        localStorage.removeItem("refresh_token");
        router.push("/login");
        return;
      }
      const payload = (await response.json()) as QualityReport;
      if (!response.ok) {
        setError((payload as { detail?: string }).detail ?? "Не удалось проверить файл.");
        return;
      }
      setQualityReport(payload);
      setSuccess("Проверка завершена.");
    } catch (err) {
      setError("Ошибка сети. Попробуйте ещё раз.");
    } finally {
      setIsValidating(false);
    }
  };

  const handleImport = async () => {
    setError("");
    setSuccess("");
    const accessToken = localStorage.getItem("access_token");
    if (!accessToken) {
      router.push("/login");
      return;
    }
    if (!uploadId) {
      setError("Загрузка не найдена.");
      return;
    }
    setIsImporting(true);
    try {
      const response = await fetch(`${API_BASE}/uploads/${uploadId}/import`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (response.status === 401) {
        localStorage.removeItem("access_token");
        localStorage.removeItem("refresh_token");
        router.push("/login");
        return;
      }
      const payload = (await response.json()) as ImportResult;
      if (!response.ok) {
        const detail = payload as { detail?: { message?: string; report?: QualityReport } };
        if (detail.detail?.report) {
          setQualityReport(detail.detail.report);
        }
        setError(detail.detail?.message ?? "Импорт не выполнен.");
        return;
      }
      setSuccess(`Импортировано строк: ${payload.imported}.`);
    } catch (err) {
      setError("Ошибка сети. Попробуйте ещё раз.");
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <main className="auth-page">
      <div className="auth-card mapping-card">
        <div className="projects-header">
          <button type="button" className="secondary" onClick={() => router.back()}>
            Назад
          </button>
        </div>

        <div>
          <h1>Мастер разметки</h1>
          <p className="muted">
            Сопоставьте колонки с бизнес-смыслами и настройте правила нормализации.
          </p>
        </div>

        {isLoading ? <p>Загружаем предпросмотр...</p> : null}
        {error ? <p className="error">{error}</p> : null}
        {success ? <p className="success">{success}</p> : null}

        {preview ? (
          <>
            <section className="mapping-section">
              <h2>Предпросмотр файла</h2>
              <div className="mapping-table-wrapper">
                <table className="mapping-table">
                  <thead>
                    <tr>
                      {preview.headers.map((header) => (
                        <th key={header}>{header}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.sample_rows.map((row, rowIndex) => (
                      <tr key={`row-${rowIndex}`}>
                        {preview.headers.map((header, columnIndex) => (
                          <td key={`${header}-${columnIndex}`}>
                            {row[columnIndex] ?? "—"}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="mapping-section">
              <h2>Сопоставление колонок</h2>
              {uploadType ? (
                <div className="mapping-requirements">
                  <p className="muted">
                    Обязательные поля:{" "}
                    {requiredFields.map((field) => FIELD_LABELS[field] ?? field).join(", ")}
                  </p>
                  {missingRequired.length > 0 ? (
                    <p className="warning">
                      Не заполнены:{" "}
                      {missingRequired
                        .map((field) => FIELD_LABELS[field] ?? field)
                        .join(", ")}
                    </p>
                  ) : null}
                </div>
              ) : null}
              <div className="mapping-table-wrapper">
                <table className="mapping-table mapping-config">
                  <thead>
                    <tr>
                      <th>Колонка</th>
                      <th>Тип</th>
                      <th>Смысл</th>
                      <th>Подсказка</th>
                      <th>Нормализация</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.headers.map((header) => (
                      <tr key={`mapping-${header}`}>
                        <td>{header}</td>
                        <td>{preview.inferred_types[header] ?? "string"}</td>
                        <td>
                          <select
                            value={mapping[header] ?? ""}
                            onChange={(event) =>
                              setMapping((prev) => ({
                                ...prev,
                                [header]: event.target.value,
                              }))
                            }
                          >
                            <option value="">Выберите смысл</option>
                            {(uploadType ? FIELD_OPTIONS[uploadType] : ["ignore"]).map(
                              (option) => (
                                <option key={`${header}-${option}`} value={option}>
                                  {FIELD_LABELS[option] ?? option}
                                </option>
                              ),
                            )}
                          </select>
                        </td>
                        <td>
                          {preview.mapping_suggestions[header]
                            ? FIELD_LABELS[preview.mapping_suggestions[header]!] ??
                              preview.mapping_suggestions[header]
                            : "—"}
                        </td>
                        <td>
                          <div className="normalization-options">
                            <label>
                              <input
                                type="checkbox"
                                checked={normalization[header]?.trim ?? false}
                                onChange={(event) =>
                                  setNormalization((prev) => ({
                                    ...prev,
                                    [header]: {
                                      ...prev[header],
                                      trim: event.target.checked,
                                    },
                                  }))
                                }
                              />
                              trim
                            </label>
                            <label>
                              <input
                                type="checkbox"
                                checked={normalization[header]?.lowercase ?? false}
                                onChange={(event) =>
                                  setNormalization((prev) => ({
                                    ...prev,
                                    [header]: {
                                      ...prev[header],
                                      lowercase: event.target.checked,
                                    },
                                  }))
                                }
                              />
                              lower
                            </label>
                            <label>
                              <input
                                type="checkbox"
                                checked={normalization[header]?.uppercase ?? false}
                                onChange={(event) =>
                                  setNormalization((prev) => ({
                                    ...prev,
                                    [header]: {
                                      ...prev[header],
                                      uppercase: event.target.checked,
                                    },
                                  }))
                                }
                              />
                              upper
                            </label>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <div className="mapping-actions">
              <button type="button" onClick={handleSave} disabled={isSubmitting}>
                {isSubmitting ? "Сохраняем..." : "Сохранить маппинг"}
              </button>
              <button
                type="button"
                className="secondary"
                onClick={handleValidate}
                disabled={isValidating}
              >
                {isValidating ? "Проверяем..." : "Проверить качество"}
              </button>
              <button
                type="button"
                onClick={handleImport}
                disabled={isImporting || !qualityReport || qualityReport.errors.length > 0}
              >
                {isImporting ? "Импортируем..." : "Импортировать"}
              </button>
            </div>

            {qualityReport ? (
              <section className="mapping-section quality-report">
                <h2>Отчет качества</h2>
                <div className="quality-stats">
                  <span>Всего строк: {qualityReport.stats.total_rows}</span>
                  <span>Без ошибок: {qualityReport.stats.valid_rows}</span>
                  <span>Ошибок: {qualityReport.stats.error_count}</span>
                  <span>Предупреждений: {qualityReport.stats.warning_count}</span>
                </div>

                <div className="quality-grid">
                  <div>
                    <h3>Ошибки</h3>
                    {qualityReport.errors.length === 0 ? (
                      <p className="muted">Ошибок не найдено.</p>
                    ) : (
                      <ul className="quality-list">
                        {qualityReport.errors.map((issue, index) => (
                          <li key={`error-${index}`}>
                            Строка {issue.row}: {FIELD_LABELS[issue.field] ?? issue.field} —{" "}
                            {issue.message}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div>
                    <h3>Предупреждения</h3>
                    {qualityReport.warnings.length === 0 ? (
                      <p className="muted">Предупреждений нет.</p>
                    ) : (
                      <ul className="quality-list">
                        {qualityReport.warnings.map((issue, index) => (
                          <li key={`warning-${index}`}>
                            Строка {issue.row}: {FIELD_LABELS[issue.field] ?? issue.field} —{" "}
                            {issue.message}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </section>
            ) : null}
          </>
        ) : null}
      </div>
    </main>
  );
}
