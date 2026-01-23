"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { API_BASE } from "../../../../lib/api";
import type { UploadRecord } from "../../../../lib/types";
import Badge from "../../../../../components/ui/Badge";
import Button from "../../../../../components/ui/Button";
import Card from "../../../../../components/ui/Card";
import Dialog from "../../../../../components/ui/Dialog";
import Input from "../../../../../components/ui/Input";
import Select from "../../../../../components/ui/Select";
import Skeleton from "../../../../../components/ui/Skeleton";
import Tooltip from "../../../../../components/ui/Tooltip";
import { useToast } from "../../../../../components/ui/Toast";

const MAX_UPLOAD_SIZE = 10 * 1024 * 1024;
const allowedExtensions = [".csv", ".xlsx"];

const statusLabels: Record<UploadRecord["status"], string> = {
  uploaded: "Загружен",
  validated: "Проверен",
  imported: "Импортирован",
  failed: "Ошибка",
};

const typeLabels: Record<UploadRecord["type"], string> = {
  transactions: "Транзакции",
  marketing_spend: "Маркетинг",
};

const resolveIncludeFlag = (upload: UploadRecord) => {
  const value =
    upload.include_in_dashboard ??
    upload.used_in_dashboard ??
    upload.is_used_in_dashboard ??
    upload.enabled ??
    upload.active;
  if (typeof value === "boolean") {
    return value;
  }
  return upload.status === "imported";
};

export default function UploadsPage() {
  const router = useRouter();
  const params = useParams();
  const { pushToast } = useToast();
  const projectId = useMemo(
    () => (Array.isArray(params.id) ? params.id[0] : params.id),
    [params.id],
  );

  const [uploads, setUploads] = useState<UploadRecord[]>([]);
  const [includeMap, setIncludeMap] = useState<Record<number, boolean>>({});
  const [uploadType, setUploadType] =
    useState<UploadRecord["type"]>("transactions");
  const [file, setFile] = useState<File | null>(null);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmTarget, setConfirmTarget] = useState<UploadRecord | null>(null);

  const loadUploads = async (accessToken: string) => {
    if (!projectId) return;
    setIsLoading(true);
    try {
      const response = await fetch(`${API_BASE}/projects/${projectId}/uploads`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (response.status === 401) {
        localStorage.removeItem("access_token");
        localStorage.removeItem("refresh_token");
        router.push("/login");
        return;
      }
      const payload = (await response.json()) as UploadRecord[];
      if (!response.ok) {
        setError((payload as { detail?: string }).detail ?? "Не удалось загрузить историю.");
        return;
      }
      setUploads(payload);
      setIncludeMap(
        payload.reduce<Record<number, boolean>>((acc, upload) => {
          acc[upload.id] = resolveIncludeFlag(upload);
          return acc;
        }, {}),
      );
      setError("");
    } catch (err) {
      setError("Ошибка сети. Попробуйте ещё раз.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const accessToken = localStorage.getItem("access_token");
    if (!accessToken) {
      router.push("/login");
      return;
    }

    if (!projectId) {
      setError("Проект не найден.");
      return;
    }

    loadUploads(accessToken);
  }, [projectId, router]);

  const validateFile = (selectedFile: File) => {
    const extension = `.${selectedFile.name.split(".").pop() ?? ""}`.toLowerCase();
    if (!allowedExtensions.includes(extension)) {
      return "Разрешены только файлы CSV или XLSX.";
    }
    if (selectedFile.size > MAX_UPLOAD_SIZE) {
      return "Размер файла превышает 10 МБ.";
    }
    return "";
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setSuccess("");

    if (!projectId) {
      setError("Проект не найден.");
      return;
    }

    if (!file) {
      setError("Выберите файл для загрузки.");
      return;
    }

    const fileError = validateFile(file);
    if (fileError) {
      setError(fileError);
      return;
    }

    const accessToken = localStorage.getItem("access_token");
    if (!accessToken) {
      router.push("/login");
      return;
    }

    setIsSubmitting(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("type", uploadType);

      const response = await fetch(`${API_BASE}/projects/${projectId}/uploads`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        body: formData,
      });

      if (response.status === 401) {
        localStorage.removeItem("access_token");
        localStorage.removeItem("refresh_token");
        router.push("/login");
        return;
      }

      const payload = (await response.json()) as UploadRecord & { detail?: string };
      if (!response.ok) {
        setError(payload.detail ?? "Не удалось загрузить файл.");
        pushToast(payload.detail ?? "Не удалось загрузить файл.", "error");
        return;
      }

      setUploads((prev) => [payload, ...prev]);
      setIncludeMap((prev) => ({ ...prev, [payload.id]: resolveIncludeFlag(payload) }));
      setFile(null);
      setSuccess("Файл успешно загружен.");
      pushToast("Файл загружен и отправлен на обработку.", "success");
    } catch (err) {
      setError("Ошибка сети. Попробуйте ещё раз.");
      pushToast("Ошибка сети. Попробуйте ещё раз.", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredUploads = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return uploads;
    return uploads.filter((upload) =>
      upload.original_filename.toLowerCase().includes(query),
    );
  }, [search, uploads]);

  const hasDashboardData = uploads.some((upload) => {
    const isIncluded = includeMap[upload.id] ?? resolveIncludeFlag(upload);
    return upload.status === "imported" && isIncluded;
  });

  const handleToggleInclude = (upload: UploadRecord) => {
    setIncludeMap((prev) => ({ ...prev, [upload.id]: !prev[upload.id] }));
    pushToast("Скоро сохраним выбор на сервере.", "info");
    setConfirmTarget(null);
  };

  return (
    <div className="page">
      <section className="page-header">
        <div>
          <h2 className="section-title">Загрузка данных</h2>
          <p className="helper-text">
            Что дальше? Загрузите файл, отметьте его для дэшборда и переходите к аналитике.
          </p>
        </div>
        <Tooltip content="Включите хотя бы один документ для дэшборда" disabled={hasDashboardData}>
          <Button
            variant="primary"
            onClick={() => router.push(`/projects/${projectId}/dashboard`)}
            disabled={!hasDashboardData}
          >
            Перейти в дэшборд
          </Button>
        </Tooltip>
      </section>

      <Card>
        <form className="grid-2" onSubmit={handleSubmit}>
          <label className="field">
            Тип данных
            <Select
              value={uploadType}
              onChange={(event) =>
                setUploadType(event.target.value as UploadRecord["type"])
              }
              helperText="Выберите тип таблицы для корректной обработки."
            >
              <option value="transactions">Транзакции</option>
              <option value="marketing_spend">Маркетинговые расходы</option>
            </Select>
          </label>

          <label className="field">
            Файл
            <Input
              type="file"
              accept=".csv,.xlsx"
              onChange={(event) => {
                const nextFile = event.target.files?.[0] ?? null;
                setFile(nextFile);
              }}
              helperText="Форматы: CSV или XLSX. Максимум 10 МБ."
            />
          </label>

          <div className="inline-actions">
            <Button variant="secondary" type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Загружаем..." : "Загрузить файл"}
            </Button>
            <Button variant="ghost" type="button" onClick={() => setFile(null)}>
              Сбросить выбор
            </Button>
          </div>
        </form>
        {error ? <p className="error">{error}</p> : null}
        {success ? <p className="success">{success}</p> : null}
      </Card>

      <Card>
        <div className="page-header">
          <div>
            <h3 className="section-title">История загрузок</h3>
            <p className="helper-text">Поиск по имени файла и статусу обработки.</p>
          </div>
          <Input
            placeholder="Поиск файла"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>

        {isLoading ? (
          <div className="card-list">
            <Skeleton height={72} />
            <Skeleton height={72} />
          </div>
        ) : null}

        {!isLoading && error ? (
          <Card tone="bordered">Не удалось загрузить историю. Попробуйте ещё раз.</Card>
        ) : null}

        {!isLoading && filteredUploads.length === 0 ? (
          <div className="empty-state">
            <strong>Пока нет загрузок</strong>
            <span>Загрузите первый файл, чтобы начать анализ.</span>
            <Button variant="primary" onClick={() => document.querySelector("input[type='file']")?.click()}>
              Загрузить файл
            </Button>
          </div>
        ) : null}

        {filteredUploads.length > 0 ? (
          <div className="card-list">
            {filteredUploads.map((upload) => {
              const isIncluded = includeMap[upload.id] ?? resolveIncludeFlag(upload);
              return (
                <div key={upload.id} className="row-card">
                  <div className="row-meta">
                    <strong>{upload.original_filename}</strong>
                    <span className="helper-text">
                      {typeLabels[upload.type]} · {new Date(upload.created_at).toLocaleString("ru-RU")}
                    </span>
                  </div>
                  <div className="row-actions">
                    <Badge variant={upload.status === "failed" ? "warning" : "info"}>
                      {statusLabels[upload.status]}
                    </Badge>
                    {isIncluded ? (
                      <Badge variant="success">Используется в дэшборде</Badge>
                    ) : (
                      <Badge variant="muted">Не используется</Badge>
                    )}
                    <Button
                      variant="secondary"
                      onClick={() => router.push(`/uploads/${upload.id}/mapping`)}
                    >
                      Разметить
                    </Button>
                    {isIncluded ? (
                      <Button
                        variant="destructive"
                        onClick={() => setConfirmTarget(upload)}
                      >
                        Исключить
                      </Button>
                    ) : (
                      <Button variant="secondary" onClick={() => handleToggleInclude(upload)}>
                        Включить
                      </Button>
                    )}
                    <Tooltip content="История и метаданные появятся позже">
                      <Button variant="ghost" disabled>
                        Подробнее
                      </Button>
                    </Tooltip>
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}
      </Card>

      <Dialog
        open={Boolean(confirmTarget)}
        title="Исключить из дэшборда?"
        description="Данные останутся в системе, но не попадут в витрины аналитики."
        onClose={() => setConfirmTarget(null)}
        footer={
          <>
            <Button variant="ghost" type="button" onClick={() => setConfirmTarget(null)}>
              Отмена
            </Button>
            <Button
              variant="destructive"
              type="button"
              onClick={() => confirmTarget && handleToggleInclude(confirmTarget)}
            >
              Исключить
            </Button>
          </>
        }
      >
        {confirmTarget ? (
          <p>
            Файл <strong>{confirmTarget.original_filename}</strong> будет исключён из дэшборда.
          </p>
        ) : null}
      </Dialog>
    </div>
  );
}
