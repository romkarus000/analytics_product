"use client";

import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { API_BASE } from "../../lib/api";
import type { Project } from "../../lib/types";
import Card from "../../../components/ui/Card";
import Button from "../../../components/ui/Button";
import Input from "../../../components/ui/Input";
import Select from "../../../components/ui/Select";
import Dialog from "../../../components/ui/Dialog";
import Skeleton from "../../../components/ui/Skeleton";
import Tooltip from "../../../components/ui/Tooltip";
import { useToast } from "../../../components/ui/Toast";

const STORAGE_KEY = "selected_project";

type ProjectsResponse = {
  user: { id: number; email: string };
  projects: Project[];
};

const timezones = [
  "Europe/Moscow",
  "Europe/Berlin",
  "Asia/Dubai",
  "Asia/Almaty",
  "UTC",
];

export default function ProjectsPage() {
  const router = useRouter();
  const { pushToast } = useToast();
  const [data, setData] = useState<ProjectsResponse | null>(null);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [name, setName] = useState("");
  const [timezone, setTimezone] = useState("Europe/Moscow");
  const [currency, setCurrency] = useState("RUB");
  const [template, setTemplate] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);

  const selectedProject = useMemo(() => {
    if (!data || !selectedProjectId) {
      return null;
    }
    return data.projects.find((project) => String(project.id) === selectedProjectId) ?? null;
  }, [data, selectedProjectId]);

  const isEmpty = Boolean(data && data.projects.length === 0);
  const headerPrimaryVariant: "primary" | "secondary" =
    !selectedProject && !isEmpty ? "primary" : "secondary";

  const loadProjects = useCallback(async () => {
    const accessToken = localStorage.getItem("access_token");
    if (!accessToken) {
      router.push("/login");
      return;
    }

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

      const payload = (await response.json()) as ProjectsResponse;
      if (!response.ok) {
        setError((payload as { detail?: string }).detail ?? "Не удалось загрузить проекты.");
        return;
      }

      setData(payload);
      setError("");
    } catch (err) {
      setError("Ошибка сети. Попробуйте ещё раз.");
    }
  }, [router]);

  useEffect(() => {
    loadProjects();
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const payload = JSON.parse(stored) as Project;
        setSelectedProjectId(payload?.id ? String(payload.id) : null);
      } catch {
        setSelectedProjectId(null);
      }
    }
  }, [loadProjects]);

  const filteredProjects = useMemo(() => {
    if (!data) return [];
    const query = search.trim().toLowerCase();
    if (!query) return data.projects;
    return data.projects.filter((project) =>
      project.name.toLowerCase().includes(query),
    );
  }, [data, search]);

  const handleCreateProject = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

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
          currency,
          template,
        }),
      });

      if (response.status === 401) {
        localStorage.removeItem("access_token");
        localStorage.removeItem("refresh_token");
        router.push("/login");
        return;
      }

      const payload = (await response.json()) as Project & { detail?: string };
      if (!response.ok) {
        pushToast(payload.detail ?? "Не удалось создать проект.", "error");
        return;
      }

      setData((prev) =>
        prev ? { ...prev, projects: [payload, ...prev.projects] } : prev,
      );
      setName("");
      setTimezone("Europe/Moscow");
      setCurrency("RUB");
      setTemplate("");
      setIsModalOpen(false);
      pushToast("Проект создан.", "success");
    } catch (err) {
      pushToast("Ошибка сети. Попробуйте ещё раз.", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSelectProject = (project: Project) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
    setSelectedProjectId(String(project.id));
    router.push(`/projects/${project.id}`);
  };

  return (
    <div className="page">
      <section className="page-header">
        <div>
          <h2 className="section-title">Ваши проекты</h2>
          <p className="helper-text">
            Что дальше? Выберите проект, чтобы перейти к загрузке данных и настройке
            дэшборда.
          </p>
        </div>
        <div className="inline-actions">
          <Button variant={headerPrimaryVariant} onClick={() => setIsModalOpen(true)}>
            Создать проект
          </Button>
          <Button variant="secondary" onClick={loadProjects}>
            Обновить список
          </Button>
        </div>
      </section>

      {error ? <Card tone="bordered">{error}</Card> : null}

      {!data && !error ? (
        <div className="grid">
          <Skeleton height={96} />
          <Skeleton height={96} />
        </div>
      ) : null}

      {selectedProject ? (
        <Card>
          <div className="grid">
            <div>
              <h3>{selectedProject.name}</h3>
              <p className="helper-text">Таймзона: {selectedProject.timezone}</p>
            </div>
            <div className="inline-actions">
              <Button
                variant="primary"
                onClick={() => router.push(`/projects/${selectedProject.id}/uploads`)}
              >
                Перейти к загрузкам
              </Button>
              <Tooltip content="Раздел скоро появится">
                <Button variant="secondary" disabled>
                  Настройки проекта
                </Button>
              </Tooltip>
              <Tooltip content="Экспорт будет доступен после настройки">
                <Button variant="ghost" disabled>
                  Экспорт
                </Button>
              </Tooltip>
            </div>
          </div>
        </Card>
      ) : null}

      {!selectedProject ? (
        <Card>
          <div className="grid">
            <Input
              placeholder="Поиск проекта"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            {data && filteredProjects.length > 0 ? (
              <div className="card-list">
                {filteredProjects.map((project) => (
                  <div key={project.id} className="row-card">
                    <div className="row-meta">
                      <strong>{project.name}</strong>
                      <span className="helper-text">Таймзона: {project.timezone}</span>
                    </div>
                    <Button
                      variant="secondary"
                      onClick={() => handleSelectProject(project)}
                    >
                      Открыть
                    </Button>
                  </div>
                ))}
              </div>
            ) : null}
            {data && filteredProjects.length === 0 ? (
              <div className="empty-state">
                <strong>Пока нет проектов</strong>
                <span>Создайте первый проект, чтобы начать аналитику.</span>
                <Button variant="primary" onClick={() => setIsModalOpen(true)}>
                  Создать проект
                </Button>
              </div>
            ) : null}
          </div>
        </Card>
      ) : null}

      <Dialog
        open={isModalOpen}
        title="Создать проект"
        description="Укажите базовые настройки — остальное можно изменить позже."
        onClose={() => setIsModalOpen(false)}
        footer={
          <>
            <Button variant="ghost" type="button" onClick={() => setIsModalOpen(false)}>
              Отмена
            </Button>
            <Button type="submit" form="create-project" disabled={isSubmitting}>
              {isSubmitting ? "Создаём..." : "Создать"}
            </Button>
          </>
        }
      >
        <form id="create-project" className="grid" onSubmit={handleCreateProject}>
          <label className="field">
            Название проекта
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Например, Аналитика продаж"
              required
            />
            <small>Название будет видно всем участникам проекта.</small>
          </label>
          <label className="field">
            Часовой пояс
            <Select value={timezone} onChange={(event) => setTimezone(event.target.value)}>
              {timezones.map((zone) => (
                <option key={zone} value={zone}>
                  {zone}
                </option>
              ))}
            </Select>
          </label>
          <label className="field">
            Валюта
            <Input
              value={currency}
              onChange={(event) => setCurrency(event.target.value)}
              placeholder="RUB"
            />
          </label>
          <label className="field">
            Шаблон проекта (опционально)
            <Input
              value={template}
              onChange={(event) => setTemplate(event.target.value)}
              placeholder="Retail / SaaS / Services"
            />
          </label>
        </form>
      </Dialog>
    </div>
  );
}
