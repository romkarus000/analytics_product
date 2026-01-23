"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { API_BASE } from "../../../lib/api";
import type { Project } from "../../../lib/types";
import Card from "../../../../components/ui/Card";
import Button from "../../../../components/ui/Button";
import Badge from "../../../../components/ui/Badge";
import Skeleton from "../../../../components/ui/Skeleton";
import Tooltip from "../../../../components/ui/Tooltip";

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

  return (
    <div className="page">
      <section className="page-header">
        <div>
          <h2 className="section-title">Обзор проекта</h2>
          <p className="helper-text">
            Что дальше? Проверьте параметры проекта и переходите к загрузке данных.
          </p>
        </div>
        <Button variant="secondary" onClick={() => router.push("/projects")}> 
          Все проекты
        </Button>
      </section>

      {error ? <Card tone="bordered">{error}</Card> : null}

      {isLoading ? (
        <Card>
          <Skeleton height={28} width={240} />
          <Skeleton height={16} width={180} />
          <Skeleton height={90} />
        </Card>
      ) : null}

      {project ? (
        <Card>
          <div className="grid">
            <div>
              <h3>{project.name}</h3>
              <p className="helper-text">ID проекта: {project.id}</p>
              <div className="inline-actions">
                <Badge variant="info">Таймзона: {project.timezone}</Badge>
                <Badge variant="muted">Валюта: {project.currency ?? "—"}</Badge>
              </div>
            </div>
            <div className="inline-actions">
              <Button
                variant="primary"
                onClick={() => router.push(`/projects/${projectId}/uploads`)}
              >
                Перейти к загрузкам
              </Button>
              <Tooltip content="Скоро появится настройка прав и ролей">
                <Button variant="secondary" disabled>
                  Настройки проекта
                </Button>
              </Tooltip>
              <Tooltip content="Экспорт станет доступен после настройки дэшборда">
                <Button variant="ghost" disabled>
                  Экспорт
                </Button>
              </Tooltip>
            </div>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
