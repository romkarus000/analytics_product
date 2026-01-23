"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";

import SidebarStepper from "../../components/layout/SidebarStepper";
import Button from "../../components/ui/Button";
import { ToastProvider } from "../../components/ui/Toast";
import styles from "./layout.module.css";

const STORAGE_KEY = "selected_project";

const sectionLabels: Record<string, string> = {
  projects: "Проект",
  uploads: "Загрузка данных",
  dashboard: "Дэшборд",
  managers: "Менеджеры",
  products: "Продукты",
  alerts: "Алерты",
};

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [projectName, setProjectName] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      setProjectName(null);
      return;
    }
    try {
      const payload = JSON.parse(stored) as { name?: string };
      setProjectName(payload?.name ?? null);
    } catch {
      setProjectName(null);
    }
  }, [pathname]);

  const section = useMemo(() => {
    const segments = pathname.split("/").filter(Boolean);
    const match = segments.find((segment) => sectionLabels[segment]);
    return match ? sectionLabels[match] : "Проект";
  }, [pathname]);

  const breadcrumb = `Проекты / ${projectName ?? "—"} / ${section}`;
  const showDashboardActions = pathname.includes("dashboard");

  return (
    <ToastProvider>
      <div className={styles.shell}>
        <SidebarStepper />
        <div className={styles.main}>
          <header className={styles.header}>
            <div>
              <p className={styles.breadcrumb}>{breadcrumb}</p>
              <h1 className={styles.title}>{section}</h1>
            </div>
            <div className={styles.actions}>
              <Button variant="ghost" size="sm" disabled={!showDashboardActions}>
                Экспорт
              </Button>
              <Button variant="ghost" size="sm" disabled={!showDashboardActions}>
                Настройки
              </Button>
            </div>
          </header>
          <div className={styles.content}>{children}</div>
        </div>
      </div>
    </ToastProvider>
  );
}
