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

const MAX_UPLOAD_SIZE = 20 * 1024 * 1024;
const allowedExtensions = [".csv", ".xlsx"];

const statusLabels: Record<UploadRecord["status"], string> = {
  uploaded: "Загружен",
  validated: "На проверке",
  imported: "Импортирован",
  failed: "Ошибка",
};

const typeLabels: Record<UploadRecord["type"], string> = {
  transactions: "Транзакции",
  marketing_spend: "Маркетинг",
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
  const [uploadType, setUploadType] =
    useState<UploadRecord["type"]>("transactions");
  const [file, setFile] = useState<File | null>(null);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCleaning, setIsCleaning] = useState(false);
  const [activeSourceId, setActiveSourceId] = useState<number | null>(null);
  const [confirmDeleteTarget, setConfirmDeleteTarget] =
    useState<UploadRecord | null>(null);
  const [confirmCleanupOpen, setConfirmCleanupOpen] = useState(false);

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
      return "Размер файла превышает 20 МБ.";
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
      setFile(null);
      setFileInputKey((prev) => prev + 1);
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

  const hasDashboardData = uploads.some(
    (upload) => upload.status === "imported" && upload.used_in_dashboard,
  );

  const updateDashboardSource = async (upload: UploadRecord, enable: boolean) => {
    if (!projectId) {
      setError("Проект не найден.");
      return;
    }
    const accessToken = localStorage.getItem("access_token");
    if (!accessToken) {
      router.push("/login");
      return;
    }
    setActiveSourceId(upload.id);
    try {
      const response = await fetch(
        `${API_BASE}/projects/${projectId}/dashboard-sources`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            data_type: upload.type,
            upload_id: enable ? upload.id : null,
          }),
        },
      );
      if (response.status === 401) {
        localStorage.removeItem("access_token");
        localStorage.removeItem("refresh_token");
        router.push("/login");
        return;
      }
      const payload = (await response.json()) as { detail?: string };
      if (!response.ok) {
        pushToast(payload.detail ?? "Не удалось обновить источник дэшборда.", "error");
        return;
      }
      setUploads((prev) =>
        prev.map((item) =>
          item.type === upload.type
            ? { ...item, used_in_dashboard: enable && item.id === upload.id }
            : item,
        ),
      );
      pushToast(
        enable ? "Источник для дэшборда обновлён." : "Источник снят с дэшборда.",
        "success",
      );
    } catch (err) {
      pushToast("Ошибка сети. Попробуйте ещё раз.", "error");
    } finally {
      setActiveSourceId(null);
    }
  };

  const handleDeleteUpload = async (upload: UploadRecord) => {
    const accessToken = localStorage.getItem("access_token");
    if (!accessToken) {
      router.push("/login");
      return;
    }
    setActiveSourceId(upload.id);
    try {
      const response = await fetch(`${API_BASE}/uploads/${upload.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (response.status === 401) {
        localStorage.removeItem("access_token");
        localStorage.removeItem("refresh_token");
        router.push("/login");
        return;
      }
      if (response.status === 409) {
        const payload = (await response.json()) as { detail?: string };
        pushToast(payload.detail ?? "Сначала уберите загрузку из дэшборда.", "warning");
        return;
      }
      if (!response.ok) {
        pushToast("Не удалось удалить загрузку.", "error");
        return;
      }
      setUploads((prev) => prev.filter((item) => item.id !== upload.id));
      pushToast("Загрузка удалена из списка.", "success");
    } catch (err) {
      pushToast("Ошибка сети. Попробуйте ещё раз.", "error");
    } finally {
      setActiveSourceId(null);
      setConfirmDeleteTarget(null);
    }
  };

  const handleCleanup = async () => {
    if (!projectId) {
      setError("Проект не найден.");
      return;
    }
    const accessToken = localStorage.getItem("access_token");
    if (!accessToken) {
      router.push("/login");
      return;
    }
    setIsCleaning(true);
    try {
      const response = await fetch(
        `${API_BASE}/projects/${projectId}/uploads/cleanup`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ mode: "inactive_only" }),
        },
      );
      if (response.status === 401) {
        localStorage.removeItem("access_token");
        localStorage.removeItem("refresh_token");
        router.push("/login");
        return;
      }
      if (!response.ok) {
        pushToast("Не удалось очистить список.", "error");
        return;
      }
      await loadUploads(accessToken);
      pushToast("Список очищен.", "success");
    } catch (err) {
      pushToast("Ошибка сети. Попробуйте ещё раз.", "error");
    } finally {
      setIsCleaning(false);
      setConfirmCleanupOpen(false);
    }
  };

  return (
    <div className="page uploads-page">
      <section className="page-header">
        <div>
          <h1 className="section-title">Загрузка данных</h1>
          <p className="helper-text">
            Загрузите CSV/XLSX и разметьте столбцы — метрики появятся автоматически.
          </p>
        </div>
        <Tooltip content="Сначала импортируйте данные" disabled={hasDashboardData}>
          <Button
            variant="ghost"
            size="sm"
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
            <span className="field-label">
              Тип данных
              <Tooltip content="Выберите тип таблицы для корректной обработки.">
                <span className="info-icon" aria-hidden>
                  i
                </span>
              </Tooltip>
            </span>
            <Select
              value={uploadType}
              onChange={(event) =>
                setUploadType(event.target.value as UploadRecord["type"])
              }
            >
              <option value="transactions">Транзакции</option>
              <option value="marketing_spend">Маркетинговые расходы</option>
            </Select>
          </label>

          <label className="field">
            Файл
            <Input
              key={fileInputKey}
              type="file"
              accept=".csv,.xlsx"
              onChange={(event) => {
                const nextFile = event.target.files?.[0] ?? null;
                setFile(nextFile);
              }}
              helperText="CSV/XLSX • до 10 МБ"
            />
          </label>

          <div className="inline-actions">
            <Button
              variant="primary"
              size="sm"
              type="submit"
              disabled={!file || isSubmitting}
            >
              {isSubmitting ? "Загружаем..." : "Загрузить"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              type="button"
              onClick={() => {
                setFile(null);
                setFileInputKey((prev) => prev + 1);
              }}
              disabled={!file || isSubmitting}
            >
              Сбросить
            </Button>
          </div>
        </form>
        {error ? <p className="error">{error}</p> : null}
        {success ? <p className="success">{success}</p> : null}
      </Card>

      <Card>
        <div className="page-header uploads-history-header">
          <div>
            <h3 className="section-title">История загрузок</h3>
            <p className="helper-text">Последние загрузки и их статусы.</p>
          </div>
          <div className="uploads-history-tools">
            <Input
              placeholder="Поиск файла"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <Button
              variant="destructive"
              size="sm"
              type="button"
              onClick={() => setConfirmCleanupOpen(true)}
              disabled={uploads.length === 0 || isLoading}
            >
              Очистить список
            </Button>
          </div>
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
            <Button
              variant="primary"
              size="sm"
              onClick={() => document.querySelector("input[type='file']")?.click()}
            >
              Загрузить
            </Button>
          </div>
        ) : null}

        {filteredUploads.length > 0 ? (
          <div className="card-list">
            {filteredUploads.map((upload) => {
              const isSettingSource = activeSourceId === upload.id;
              const isImported = upload.status === "imported";
              const statusVariant: "warning" | "success" | "info" | "muted" =
                upload.status === "failed"
                  ? "warning"
                  : upload.status === "imported"
                    ? "success"
                    : upload.status === "validated"
                      ? "info"
                      : "muted";
              const mappingLabel =
                upload.mapping_status === "mapped" ? "Обновить разметку" : "Разметить";
              return (
                <div key={upload.id} className="row-card">
                  <div className="row-meta">
                    <strong>{upload.original_filename}</strong>
                    <span className="helper-text">
                      {typeLabels[upload.type]} · {new Date(upload.created_at).toLocaleString("ru-RU")}
                    </span>
                  </div>
                  <div className="row-badges">
                    <Badge variant={statusVariant} className="badge-compact">
                      {statusLabels[upload.status]}
                    </Badge>
                    {upload.used_in_dashboard ? (
                      <Badge variant="success" className="badge-compact">
                        В дэшборде
                      </Badge>
                    ) : null}
                  </div>
                  <div className="row-actions">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => router.push(`/uploads/${upload.id}/mapping`)}
                    >
                      {mappingLabel}
                    </Button>
                    <Tooltip
                      content={
                        isImported
                          ? ""
                          : "Сначала завершите импорт, чтобы использовать в дэшборде."
                      }
                      disabled={isImported}
                    >
                      <Button
                        variant={upload.used_in_dashboard ? "secondary" : "ghost"}
                        size="sm"
                        disabled={!isImported || isSettingSource}
                        onClick={() =>
                          updateDashboardSource(upload, !upload.used_in_dashboard)
                        }
                      >
                        {upload.used_in_dashboard ? "Убрать" : "Использовать"}
                      </Button>
                    </Tooltip>
                    <Tooltip
                      content="Сначала уберите загрузку из дэшборда."
                      disabled={!upload.used_in_dashboard}
                    >
                      <Button
                        variant="destructive"
                        size="sm"
                        disabled={upload.used_in_dashboard || isSettingSource}
                        onClick={() => setConfirmDeleteTarget(upload)}
                      >
                        Удалить
                      </Button>
                    </Tooltip>
                    <Tooltip content="История и метаданные появятся позже">
                      <Button variant="ghost" size="sm" disabled>
                        Подробности
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
        open={Boolean(confirmDeleteTarget)}
        title="Удалить загрузку?"
        description="Загрузка исчезнет из истории. Файл останется в системе."
        onClose={() => setConfirmDeleteTarget(null)}
        footer={
          <>
            <Button variant="ghost" size="sm" type="button" onClick={() => setConfirmDeleteTarget(null)}>
              Отмена
            </Button>
            <Button
              variant="destructive"
              size="sm"
              type="button"
              onClick={() => confirmDeleteTarget && handleDeleteUpload(confirmDeleteTarget)}
            >
              Удалить
            </Button>
          </>
        }
      >
        {confirmDeleteTarget ? (
          <p>
            Удалить <strong>{confirmDeleteTarget.original_filename}</strong> из истории загрузок?
          </p>
        ) : null}
      </Dialog>

      <Dialog
        open={confirmCleanupOpen}
        title="Очистить список?"
        description="Будут удалены только неиспользуемые загрузки."
        onClose={() => setConfirmCleanupOpen(false)}
        footer={
          <>
            <Button
              variant="ghost"
              size="sm"
              type="button"
              onClick={() => setConfirmCleanupOpen(false)}
              disabled={isCleaning}
            >
              Отмена
            </Button>
            <Button
              variant="destructive"
              size="sm"
              type="button"
              onClick={handleCleanup}
              disabled={isCleaning}
            >
              {isCleaning ? "Очищаем..." : "Очистить"}
            </Button>
          </>
        }
      >
        <p>Список будет очищен без удаления активных источников дэшборда.</p>
      </Dialog>
    </div>
  );
}
