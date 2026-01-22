"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api";
const MAX_UPLOAD_SIZE = 10 * 1024 * 1024;
const allowedExtensions = [".csv", ".xlsx"];

type UploadRecord = {
  id: number;
  project_id: number;
  type: "transactions" | "marketing_spend";
  status: "uploaded" | "validated" | "imported" | "failed";
  original_filename: string;
  created_at: string;
  file_path: string;
};

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

export default function UploadsPage() {
  const router = useRouter();
  const params = useParams();
  const projectId = useMemo(
    () => (Array.isArray(params.id) ? params.id[0] : params.id),
    [params.id],
  );

  const [uploads, setUploads] = useState<UploadRecord[]>([]);
  const [uploadType, setUploadType] =
    useState<UploadRecord["type"]>("transactions");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

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
      const payload = await response.json();
      if (!response.ok) {
        setError(payload.detail ?? "Не удалось загрузить историю.");
        return;
      }
      setUploads(payload);
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

      const payload = await response.json();
      if (!response.ok) {
        setError(payload.detail ?? "Не удалось загрузить файл.");
        return;
      }

      setUploads((prev) => [payload, ...prev]);
      setFile(null);
      setSuccess("Файл успешно загружен.");
    } catch (err) {
      setError("Ошибка сети. Попробуйте ещё раз.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="auth-page">
      <div className="auth-card uploads-card">
        <div className="projects-header">
          <button
            type="button"
            className="secondary"
            onClick={() => router.push(`/projects/${projectId}`)}
          >
            Назад к проекту
          </button>
        </div>

        <div>
          <h1>Загрузка данных</h1>
          <p className="muted">
            Поддерживаемые форматы: CSV и XLSX. Максимальный размер файла — 10 МБ.
          </p>
        </div>

        <form className="upload-form" onSubmit={handleSubmit}>
          <label className="field">
            Тип данных
            <select
              value={uploadType}
              onChange={(event) =>
                setUploadType(event.target.value as UploadRecord["type"])
              }
            >
              <option value="transactions">Транзакции</option>
              <option value="marketing_spend">Маркетинговые расходы</option>
            </select>
          </label>

          <label className="field">
            Файл
            <input
              type="file"
              accept=".csv,.xlsx"
              onChange={(event) => {
                const nextFile = event.target.files?.[0] ?? null;
                setFile(nextFile);
              }}
            />
          </label>

          <button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Загружаем..." : "Загрузить файл"}
          </button>
        </form>

        {error ? <p className="error">{error}</p> : null}
        {success ? <p className="success">{success}</p> : null}

        <section className="upload-history">
          <h2>История загрузок</h2>
          {isLoading ? <p>Загружаем историю...</p> : null}
          {!isLoading && uploads.length === 0 ? (
            <p className="muted">Пока нет загруженных файлов.</p>
          ) : null}
          {uploads.length > 0 ? (
            <ul className="upload-list">
              {uploads.map((upload) => (
                <li key={upload.id} className="upload-item">
                  <div>
                    <p className="upload-title">{upload.original_filename}</p>
                    <p className="muted">
                      {typeLabels[upload.type]} ·{" "}
                      {new Date(upload.created_at).toLocaleString("ru-RU")}
                    </p>
                  </div>
                  <div className="upload-actions">
                    <span className={`upload-status status-${upload.status}`}>
                      {statusLabels[upload.status]}
                    </span>
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => router.push(`/uploads/${upload.id}/mapping`)}
                    >
                      Разметить
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      </div>
    </main>
  );
}
