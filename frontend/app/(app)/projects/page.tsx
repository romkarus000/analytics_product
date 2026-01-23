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
import { useToast } from "../../../components/ui/Toast";
import ProjectHeader from "../../../components/projects/ProjectHeader";
import ProjectList from "../../../components/projects/ProjectList";
import styles from "../../../components/projects/Projects.module.css";

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

  const isEmpty = Boolean(data && data.projects.length === 0);

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
  }, [loadProjects]);

  const filteredProjects = useMemo(() => {
    if (!data) return [];
    const query = search.trim().toLowerCase();
    if (!query) return data.projects;
    return data.projects.filter((project) => project.name.toLowerCase().includes(query));
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

      setData((prev) => (prev ? { ...prev, projects: [payload, ...prev.projects] } : prev));
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

  const handleOpenProject = (project: Project) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
    router.push(`/projects/${project.id}`);
  };

  const handleOpenUploads = (project: Project) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
    router.push(`/projects/${project.id}/uploads`);
  };

  return (
    <div className="page">
      <ProjectHeader
        title="Проекты"
        subtitle="Компактный список ваших пространств аналитики. Выберите проект и продолжайте работу."
        actions={
          <>
            <Button variant="primary" onClick={() => setIsModalOpen(true)}>
              Создать проект
            </Button>
            <Button variant="secondary" onClick={loadProjects}>
              Обновить список
            </Button>
          </>
        }
      />

      {error ? <Card tone="bordered">{error}</Card> : null}

      {!data && !error ? (
        <div className={styles.projectGrid}>
          <Skeleton height={120} />
          <Skeleton height={120} />
          <Skeleton height={120} />
        </div>
      ) : null}

      {data && !isEmpty ? (
        <div className="grid">
          <div className={styles.toolbar}>
            <div className={styles.searchField}>
              <Input
                placeholder="Поиск проекта"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
          </div>
          <ProjectList
            projects={filteredProjects}
            onOpen={handleOpenProject}
            onUploads={handleOpenUploads}
          />
        </div>
      ) : null}

      {data && filteredProjects.length === 0 && !isEmpty ? (
        <Card className={styles.emptyCard}>
          <strong>Совпадений не найдено</strong>
          <span>Попробуйте изменить запрос или сбросьте фильтр.</span>
          <Button variant="secondary" onClick={() => setSearch("")}>
            Сбросить поиск
          </Button>
        </Card>
      ) : null}

      {isEmpty ? (
        <Card className={styles.emptyCard}>
          <strong>Пока нет проектов</strong>
          <span>Создайте первый проект, чтобы начать аналитику.</span>
          <Button variant="primary" onClick={() => setIsModalOpen(true)}>
            Создать проект
          </Button>
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
