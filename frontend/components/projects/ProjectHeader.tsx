import type { ReactNode } from "react";

import styles from "./Projects.module.css";

type ProjectHeaderProps = {
  title: string;
  subtitle?: string;
  status?: string;
  actions?: ReactNode;
};

const ProjectHeader = ({ title, subtitle, status, actions }: ProjectHeaderProps) => {
  return (
    <div className={styles.pageHeader}>
      <div className={styles.headerText}>
        <h1 className={styles.title}>{title}</h1>
        {subtitle ? <p className={styles.subtitle}>{subtitle}</p> : null}
        {status ? <p className={styles.status}>{status}</p> : null}
      </div>
      {actions ? <div className={styles.headerActions}>{actions}</div> : null}
    </div>
  );
};

export default ProjectHeader;
