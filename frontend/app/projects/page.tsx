"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api";

type Project = {
  id: number;
  name: string;
};

type ProjectsResponse = {
  user: { id: number; email: string };
  projects: Project[];
};

export default function ProjectsPage() {
  const router = useRouter();
  const [data, setData] = useState<ProjectsResponse | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const accessToken = localStorage.getItem("access_token");
    if (!accessToken) {
      router.push("/login");
      return;
    }

    const loadProjects = async () => {
      try {
        const response = await fetch(`${API_BASE}/projects`, {
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
          setError(payload.detail ?? "Не удалось загрузить проекты.");
          return;
        }

        setData(payload);
      } catch (err) {
        setError("Ошибка сети. Попробуйте ещё раз.");
      }
    };

    loadProjects();
  }, [router]);

  const handleLogout = async () => {
    const refreshToken = localStorage.getItem("refresh_token");
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");

    if (refreshToken) {
      await fetch(`${API_BASE}/auth/logout`, { method: "POST" });
    }
    router.push("/login");
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
            <ul className="project-list">
              {data.projects.map((project) => (
                <li key={project.id} className="project-item">
                  <strong>{project.name}</strong>
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </div>
    </main>
  );
}
