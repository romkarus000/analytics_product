"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

import { API_BASE } from "../../app/lib/api";
import type { Project, UploadRecord } from "../../app/lib/types";
import Badge from "../ui/Badge";
import Button from "../ui/Button";
import Tooltip from "../ui/Tooltip";
import styles from "./SidebarStepper.module.css";

const steps = [
  { key: "project", label: "Проект", slug: "projects" },
  { key: "uploads", label: "Загрузка данных", slug: "uploads" },
  { key: "dashboard", label: "Дэшборд", slug: "dashboard" },
  { key: "managers", label: "Менеджеры", slug: "managers" },
  { key: "products", label: "Продукты", slug: "products" },
  { key: "alerts", label: "Алерты", slug: "alerts" },
];

const STORAGE_KEY = "selected_project";

const SidebarStepper = () => {
  const router = useRouter();
  const pathname = usePathname();
  const [project, setProject] = useState<Project | null>(null);
  const [uploads, setUploads] = useState<UploadRecord[]>([]);
  const [isOpen, setIsOpen] = useState(false);

  const projectIdFromPath = useMemo(() => {
    const segments = pathname.split("/").filter(Boolean);
    const projectIndex = segments.indexOf("projects");
    if (projectIndex !== -1 && segments[projectIndex + 1]) {
      return segments[projectIndex + 1];
    }
    return null;
  }, [pathname]);

  const selectedProjectId = useMemo(() => {
    if (projectIdFromPath) {
      return projectIdFromPath;
    }
    if (typeof window === "undefined") {
      return null;
    }
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      return null;
    }
    try {
      const payload = JSON.parse(stored) as Project;
      return payload?.id ? String(payload.id) : null;
    } catch {
      return null;
    }
  }, [projectIdFromPath]);

  const loadProject = useCallback(async () => {
    if (!selectedProjectId) {
      setProject(null);
      setUploads([]);
      return;
    }

    const accessToken = localStorage.getItem("access_token");
    if (!accessToken) {
      return;
    }

    try {
      const [projectResponse, uploadsResponse] = await Promise.all([
        fetch(`${API_BASE}/projects/${selectedProjectId}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        }),
        fetch(`${API_BASE}/projects/${selectedProjectId}/uploads`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        }),
      ]);

      if (projectResponse.ok) {
        const payload = (await projectResponse.json()) as Project;
        setProject(payload);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      }

      if (uploadsResponse.ok) {
        const payload = (await uploadsResponse.json()) as UploadRecord[];
        setUploads(payload);
      }
    } catch {
      // Ignore sidebar loading errors.
    }
  }, [selectedProjectId]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        setProject(JSON.parse(stored) as Project);
      } catch {
        setProject(null);
      }
    }
    loadProject();
  }, [loadProject]);

  const hasProject = Boolean(selectedProjectId);
  const hasUploads = uploads.length > 0;
  const hasImported = uploads.some((item) => item.status === "imported");
  const hasDashboardData = uploads.some((upload) => {
    const includeValue =
      upload.include_in_dashboard ??
      upload.used_in_dashboard ??
      upload.is_used_in_dashboard ??
      upload.enabled ??
      upload.active;
    const isIncluded = typeof includeValue === "boolean" ? includeValue : upload.status === "imported";
    return upload.status === "imported" && isIncluded;
  });

  const handleStepClick = (slug: string) => {
    if (slug === "projects") {
      router.push("/projects");
      return;
    }
    if (!selectedProjectId) {
      return;
    }
    router.push(`/projects/${selectedProjectId}/${slug}`);
  };

  const activeStep = useMemo(() => {
    const segments = pathname.split("/").filter(Boolean);
    if (segments.includes("uploads")) return "uploads";
    if (segments.includes("dashboard")) return "dashboard";
    if (segments.includes("managers")) return "managers";
    if (segments.includes("products")) return "products";
    if (segments.includes("alerts")) return "alerts";
    return "project";
  }, [pathname]);

  const isStepDisabled = (slug: string) => {
    if (!hasProject && slug !== "projects") {
      return "Сначала выберите проект";
    }
    if (slug === "dashboard" || slug === "alerts") {
      if (!hasDashboardData) {
        return "Загрузите данные и включите их в дэшборд";
      }
    }
    return "";
  };

  const stepStatus = (slug: string) => {
    if (slug === "projects" && hasProject) return "completed";
    if (slug === "uploads" && hasImported) return "completed";
    return slug === activeStep ? "active" : "default";
  };

  const projectLabel = project?.name ?? "Проект не выбран";
  const projectTimezone = project?.timezone ?? "—";

  return (
    <aside className={styles.sidebar}>
      <div className={styles.mobileBar}>
        <div>
          <strong>{projectLabel}</strong>
          <span>{projectTimezone}</span>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setIsOpen((prev) => !prev)}
        >
          Меню
        </Button>
      </div>

      <div className={`${styles.drawer} ${isOpen ? styles.open : ""}`}>
        <div className={styles.projectHeader}>
          <div>
            <p className={styles.projectLabel}>{projectLabel}</p>
            <p className={styles.projectMeta}>Таймзона: {projectTimezone}</p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              localStorage.removeItem(STORAGE_KEY);
              setProject(null);
              setUploads([]);
              router.push("/projects");
            }}
          >
            Сменить проект
          </Button>
        </div>

        <nav className={styles.stepper}>
          {steps.map((step, index) => {
            const status = stepStatus(step.slug);
            const disabledReason = isStepDisabled(step.slug);
            const isDisabled = Boolean(disabledReason);

            return (
              <Tooltip key={step.key} content={disabledReason} disabled={!isDisabled}>
                <button
                  type="button"
                  className={`${styles.step} ${styles[status]} ${
                    isDisabled ? styles.disabled : ""
                  }`}
                  onClick={() => handleStepClick(step.slug)}
                  disabled={isDisabled}
                >
                  <span className={styles.stepIndex}>
                    {status === "completed" ? "✓" : index + 1}
                  </span>
                  <span className={styles.stepLabel}>{step.label}</span>
                  {status === "completed" ? (
                    <Badge variant="success">Готово</Badge>
                  ) : null}
                </button>
              </Tooltip>
            );
          })}
        </nav>
      </div>
    </aside>
  );
};

export default SidebarStepper;
