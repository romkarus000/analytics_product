from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import CurrentUser
from app.db.session import get_db
from app.models.project import Project
from app.schemas.projects import ProjectCreate, ProjectOwner, ProjectPublic, ProjectsResponse

router = APIRouter(prefix="/projects", tags=["projects"])


@router.get("", response_model=ProjectsResponse)
def list_projects(
    current_user: CurrentUser,
    db: Session = Depends(get_db),
) -> ProjectsResponse:
    projects = db.scalars(
        select(Project)
        .where(Project.owner_id == current_user.id)
        .order_by(Project.created_at.desc())
    ).all()
    return ProjectsResponse(
        user=ProjectOwner(id=current_user.id, email=current_user.email),
        projects=[ProjectPublic.model_validate(project) for project in projects],
    )


@router.post("", response_model=ProjectPublic, status_code=status.HTTP_201_CREATED)
def create_project(
    payload: ProjectCreate,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
) -> ProjectPublic:
    project = Project(
        owner_id=current_user.id,
        name=payload.name,
        timezone=payload.timezone,
    )
    db.add(project)
    db.commit()
    db.refresh(project)
    return ProjectPublic.model_validate(project)


@router.get("/{project_id}", response_model=ProjectPublic)
def get_project(
    project_id: int,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
) -> ProjectPublic:
    project = db.scalar(
        select(Project).where(
            Project.id == project_id,
            Project.owner_id == current_user.id,
        )
    )
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Проект не найден.",
        )
    return ProjectPublic.model_validate(project)
