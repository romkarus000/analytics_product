"use client";

import { type FormEvent, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api";

type Project = {
  id: number;
  name: string;
  timezone: string;
  created_at: string;
};

type ProjectsResponse = {
  user: { id: number; email: string };
  projects: Project[];
};

export default function ProjectsPage() {
  const router = useRouter();
  const [data, setData] = useState<ProjectsResponse | null>(null);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [formSuccess, setFormSuccess] = useState("");
  const [name, setName] = useState("");
  const [timezone, setTimezone] = useState("Europe/Moscow");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadProjects = useCallback(async () => {
    const accessToken = localStorage.getItem("access_token");
    if (!accessToken) {
      router.push("/login");
      return false;
    }

    try {
      const response = await fetch(`${API_BASE}/projects`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (response.status === 401) {
        localStorage.removeItem("access_token");
        localStorage.removeItem("refresh_token");
        router.push("/login");
        return false;
      }

      const payload = await response.json();
      if (!response.ok) {
        setError(payload.detail ?? "Не удалось загрузить проекты.");
        return false;
      }

      setData(payload);
      setError("");
      return true;
    } catch (err) {
      setError("Ошибка сети. Попробуйте ещё раз.");
      return false;
    }
  }, [router]);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  const handleLogout = async () => {
    const refreshToken = localStorage.getItem("refresh_token");
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");

    if (refreshToken) {
      await fetch(`${API_BASE}/auth/logout`, { method: "POST" });
    }
    router.push("/login");
  };

  const handleCreateProject = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError("");
    setFormSuccess("");

    const accessToken = localStorage.getItem("access_token");
    if (!accessToken) {
      router.push("/login");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch(`${API_BASE}/projects`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: name.trim(),
          timezone: timezone.trim() || "Europe/Moscow",
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
        setFormError(payload.detail ?? "Не удалось создать проект.");
        return;
      }

      setFormSuccess("Проект создан.");
      setName("");
      setTimezone("Europe/Moscow");
      setData((prev) =>
        prev
          ? { ...prev, projects: [payload, ...prev.projects] }
          : prev,
      );
    } catch (err) {
      setFormError("Ошибка сети. Попробуйте ещё раз.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="auth-page">
      <div className="auth-card">
        <div className="projects-header">
          <h1>Ваши проекты</h1>
          <button type="button" onClick={handleLogout} className="secondary">
            Выйти
          </button>
        </div>
        {error ? <p className="error">{error}</p> : null}
        {!data && !error ? <p>Загружаем проекты...</p> : null}
        {data ? (
          <>
            <p className="muted">Вы вошли как {data.user.email}</p>
            <form className="project-form" onSubmit={handleCreateProject}>
              <label className="field">
                Название проекта
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Например, Аналитика продаж"
                  required
                />
              </label>
              <label className="field">
                Часовой пояс
                <input
                  value={timezone}
                  onChange={(event) => setTimezone(event.target.value)}
                  placeholder="Europe/Moscow"
                />
              </label>
              <div className="project-form-actions">
                <button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? "Создаём..." : "Создать проект"}
                </button>
              </div>
              {formError ? <p className="error">{formError}</p> : null}
              {formSuccess ? <p className="success">{formSuccess}</p> : null}
            </form>
            <ul className="project-list">
              {data.projects.map((project) => (
                <li key={project.id} className="project-item">
                  <div className="project-row">
                    <div>
                      <strong>{project.name}</strong>
                      <p className="muted">
                        Часовой пояс: {project.timezone}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => router.push(`/projects/${project.id}`)}
                    >
                      Открыть
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </div>
    </main>
  );
}
