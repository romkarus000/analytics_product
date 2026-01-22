"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api";

type ProjectDetail = {
  id: number;
  name: string;
  timezone: string;
  created_at: string;
};

export default function ProjectDetailPage() {
  const router = useRouter();
  const params = useParams();
  const projectId = Array.isArray(params.id) ? params.id[0] : params.id;
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [error, setError] = useState("");

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

    const loadProject = async () => {
      try {
        const response = await fetch(`${API_BASE}/projects/${projectId}`, {
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
          setError(payload.detail ?? "Не удалось загрузить проект.");
          return;
        }

        setProject(payload);
      } catch (err) {
        setError("Ошибка сети. Попробуйте ещё раз.");
      }
    };

    loadProject();
  }, [params.id, router]);

  return (
    <main className="auth-page">
      <div className="auth-card">
        <div className="projects-header">
          <button
            type="button"
            className="secondary"
            onClick={() => router.push("/projects")}
          >
            Назад к проектам
          </button>
          <button
            type="button"
            onClick={() => router.push(`/projects/${projectId}/uploads`)}
            disabled={!projectId}
          >
            Загрузки данных
          </button>
          <button
            type="button"
            className="secondary"
            onClick={() => router.push(`/projects/${projectId}/products`)}
            disabled={!projectId}
          >
            Продукты
          </button>
          <button
            type="button"
            className="secondary"
            onClick={() => router.push(`/projects/${projectId}/managers`)}
            disabled={!projectId}
          >
            Менеджеры
          </button>
        </div>
        {error ? <p className="error">{error}</p> : null}
        {!project && !error ? <p>Загружаем проект...</p> : null}
        {project ? (
          <div className="project-detail">
            <h1>{project.name}</h1>
            <div className="project-meta">
              <span className="badge">Часовой пояс: {project.timezone}</span>
              <span className="muted">
                Создан: {new Date(project.created_at).toLocaleString("ru-RU")}
              </span>
            </div>
          </div>
        ) : null}
      </div>
    </main>
  );
}
