import type { Project } from "../../app/lib/types";
import ProjectCard from "./ProjectCard";
import styles from "./Projects.module.css";

type ProjectListProps = {
  projects: Project[];
  onOpen: (project: Project) => void;
  onUploads: (project: Project) => void;
};

const ProjectList = ({ projects, onOpen, onUploads }: ProjectListProps) => {
  return (
    <div className={styles.projectGrid}>
      {projects.map((project) => (
        <ProjectCard
          key={project.id}
          project={project}
          onOpen={onOpen}
          onUploads={onUploads}
        />
      ))}
    </div>
  );
};

export default ProjectList;
