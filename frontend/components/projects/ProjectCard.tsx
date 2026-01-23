import type { Project } from "../../app/lib/types";
import Card from "../ui/Card";
import Button from "../ui/Button";
import Tooltip from "../ui/Tooltip";
import styles from "./Projects.module.css";

type ProjectCardProps = {
  project: Project;
  onOpen: (project: Project) => void;
  onUploads: (project: Project) => void;
};

const ProjectCard = ({ project, onOpen, onUploads }: ProjectCardProps) => {
  return (
    <Card className={styles.projectCard}>
      <div className={styles.projectMeta}>
        <h3 className={styles.projectName}>{project.name}</h3>
        <p className={styles.projectTimezone}>Таймзона: {project.timezone}</p>
      </div>
      <div className={styles.projectActions}>
        <Button
          variant="primary"
          size="sm"
          className={styles.softButton}
          onClick={() => onOpen(project)}
        >
          Открыть
        </Button>
        <Button
          variant="secondary"
          size="sm"
          className={styles.softButton}
          onClick={() => onUploads(project)}
        >
          Загрузки
        </Button>
        <Tooltip content="Скоро появятся настройки доступа">
          <Button variant="ghost" size="sm" className={styles.softButton} disabled>
            Настройки
          </Button>
        </Tooltip>
        <Tooltip content="Экспорт будет доступен после настройки проекта">
          <Button variant="ghost" size="sm" className={styles.softButton} disabled>
            Экспорт
          </Button>
        </Tooltip>
      </div>
    </Card>
  );
};

export default ProjectCard;
