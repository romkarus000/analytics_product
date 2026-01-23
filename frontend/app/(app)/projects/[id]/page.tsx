"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { API_BASE } from "../../../lib/api";
import type { Project } from "../../../lib/types";
import Card from "../../../../components/ui/Card";
import Button from "../../../../components/ui/Button";
import Skeleton from "../../../../components/ui/Skeleton";
import Tooltip from "../../../../components/ui/Tooltip";
import ProjectHeader from "../../../../components/projects/ProjectHeader";
import styles from "../../../../components/projects/Projects.module.css";

const STORAGE_KEY = "selected_project";

export default function ProjectDetailPage() {
  const router = useRouter();
  const params = useParams();
  const projectId = Array.isArray(params.id) ? params.id[0] : params.id;
  const [project, setProject] = useState<Project | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const accessToken = localStorage.getItem("access_token");
    if (!accessToken) {
      router.push("/login");
      return;
    }

    if (!projectId) {
      setError("Проект не найден.");
      setIsLoading(false);
      return;
    }

    const loadProject = async () => {
      setIsLoading(true);
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

        const payload = (await response.json()) as Project & { detail?: string };
        if (!response.ok) {
          setError(payload.detail ?? "Не удалось загрузить проект.");
          return;
        }

        setProject(payload);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      } catch (err) {
        setError("Ошибка сети. Попробуйте ещё раз.");
      } finally {
        setIsLoading(false);
      }
    };

    loadProject();
  }, [projectId, router]);

  const lastUpdated = useMemo(() => {
    if (!project?.created_at) {
      return "—";
    }
    try {
      return new Date(project.created_at).toLocaleString("ru-RU", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return project.created_at;
    }
  }, [project?.created_at]);

  return (
    <div className="page">
      <ProjectHeader
        title={project?.name ?? "Проект"}
        subtitle={project ? `ID проекта: ${project.id}` : undefined}
        status={`Последнее обновление данных: ${lastUpdated}`}
        actions={
          <Button variant="secondary" onClick={() => router.push("/projects")}>
            Все проекты
          </Button>
        }
      />

      {error ? <Card tone="bordered">{error}</Card> : null}

      {isLoading ? (
        <Card>
          <Skeleton height={24} width={200} />
          <Skeleton height={16} width={140} />
          <Skeleton height={80} />
        </Card>
      ) : null}

      {project ? (
        <div className={styles.detailGrid}>
          <Card className="grid">
            <div>
              <p className={styles.cardTitle}>Кратко о проекте</p>
              <p className={styles.cardDescription}>
                Управляйте источниками данных и настройками аналитики без лишних шагов.
              </p>
            </div>
            <div className="inline-actions">
              <span className="helper-text">Таймзона: {project.timezone}</span>
              <span className="helper-text">Валюта: {project.currency ?? "—"}</span>
            </div>
          </Card>

          <Card className={styles.quickActions}>
            <p className={styles.cardTitle}>Quick actions</p>
            <div className={styles.projectActions}>
              <Button
                variant="primary"
                size="sm"
                className={styles.softButton}
                onClick={() => router.push(`/projects/${projectId}/uploads`)}
              >
                Перейти к загрузкам
              </Button>
              <Button
                variant="secondary"
                size="sm"
                className={styles.softButton}
                onClick={() => router.push(`/projects/${projectId}/dashboard`)}
              >
                Открыть дашборд
              </Button>
              <Tooltip content="Скоро появятся настройки доступа">
                <Button variant="ghost" size="sm" className={styles.softButton} disabled>
                  Настройки проекта
                </Button>
              </Tooltip>
            </div>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
