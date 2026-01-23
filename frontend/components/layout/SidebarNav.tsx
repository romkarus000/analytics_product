"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

import { API_BASE } from "../../app/lib/api";
import type { Project, UploadRecord } from "../../app/lib/types";
import Button from "../ui/Button";
import Tooltip from "../ui/Tooltip";
import styles from "./SidebarNav.module.css";

const navItems = [
  { key: "projects", label: "Проекты", slug: "projects" },
  { key: "overview", label: "Обзор", slug: "overview" },
  { key: "uploads", label: "Загрузки", slug: "uploads" },
  { key: "dashboard", label: "Дэшборд", slug: "dashboard" },
  { key: "managers", label: "Менеджеры", slug: "managers" },
  { key: "products", label: "Продукты", slug: "products" },
  { key: "alerts", label: "Алерты", slug: "alerts" },
];

const STORAGE_KEY = "selected_project";

const SidebarNav = () => {
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
  const hasDashboardData = uploads.some((upload) => {
    const includeValue =
      upload.include_in_dashboard ??
      upload.used_in_dashboard ??
      upload.is_used_in_dashboard ??
      upload.enabled ??
      upload.active;
    const isIncluded =
      typeof includeValue === "boolean" ? includeValue : upload.status === "imported";
    return upload.status === "imported" && isIncluded;
  });

  const handleNavClick = (slug: string) => {
    if (slug === "projects") {
      router.push("/projects");
      return;
    }
    if (!selectedProjectId) {
      return;
    }
    if (slug === "overview") {
      router.push(`/projects/${selectedProjectId}`);
      return;
    }
    router.push(`/projects/${selectedProjectId}/${slug}`);
  };

  const activeKey = useMemo(() => {
    const segments = pathname.split("/").filter(Boolean);
    if (segments.length === 1 && segments[0] === "projects") {
      return "projects";
    }
    if (segments.includes("uploads")) return "uploads";
    if (segments.includes("dashboard")) return "dashboard";
    if (segments.includes("managers")) return "managers";
    if (segments.includes("products")) return "products";
    if (segments.includes("alerts")) return "alerts";
    if (segments[0] === "projects") return "overview";
    return "projects";
  }, [pathname]);

  const isItemDisabled = (slug: string) => {
    if (slug === "projects") return "";
    if (!hasProject) {
      return "Сначала выберите проект";
    }
    if ((slug === "dashboard" || slug === "alerts") && !hasDashboardData) {
      return "Загрузите данные и включите их в дэшборд";
    }
    return "";
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
        <Button variant="secondary" size="sm" onClick={() => setIsOpen((prev) => !prev)}>
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

        <nav className={styles.nav}>
          {navItems.map((item) => {
            const disabledReason = isItemDisabled(item.slug);
            const isDisabled = Boolean(disabledReason);
            const isActive = activeKey === item.key;

            return (
              <Tooltip key={item.key} content={disabledReason} disabled={!isDisabled}>
                <button
                  type="button"
                  className={`${styles.navItem} ${isActive ? styles.active : ""} ${
                    isDisabled ? styles.disabled : ""
                  }`}
                  onClick={() => handleNavClick(item.slug)}
                  disabled={isDisabled}
                >
                  <span className={styles.navLabel}>{item.label}</span>
                </button>
              </Tooltip>
            );
          })}
        </nav>
      </div>
    </aside>
  );
};

export default SidebarNav;
