from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import CurrentUser
from app.db.session import get_db
from app.models.project import Project
from app.models.project_settings import ProjectSettings
from app.schemas.projects import ProjectCreate, ProjectOwner, ProjectPublic, ProjectsResponse
from app.schemas.project_settings import (
    ProjectSettingsPublic,
    ProjectSettingsUpdate,
)

router = APIRouter(prefix="/projects", tags=["projects"])

DEFAULT_GROUP_LABELS = [
    "Группа 1",
    "Группа 2",
    "Группа 3",
    "Группа 4",
    "Группа 5",
]


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
    settings = ProjectSettings(
        project_id=project.id,
        group_labels_json=DEFAULT_GROUP_LABELS,
        dedup_policy="keep_all_rows",
    )
    db.add(settings)
    db.commit()
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


@router.get("/{project_id}/settings", response_model=ProjectSettingsPublic)
def get_project_settings(
    project_id: int,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
) -> ProjectSettingsPublic:
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
    settings = db.get(ProjectSettings, project_id)
    if not settings:
        settings = ProjectSettings(
            project_id=project_id,
            group_labels_json=DEFAULT_GROUP_LABELS,
            dedup_policy="keep_all_rows",
        )
        db.add(settings)
        db.commit()
        db.refresh(settings)
    return ProjectSettingsPublic(
        project_id=settings.project_id,
        group_labels=settings.group_labels_json,
        dedup_policy=settings.dedup_policy,
        created_at=settings.created_at,
        updated_at=settings.updated_at,
    )


@router.put("/{project_id}/settings", response_model=ProjectSettingsPublic)
def update_project_settings(
    project_id: int,
    payload: ProjectSettingsUpdate,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
) -> ProjectSettingsPublic:
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
    settings = db.get(ProjectSettings, project_id)
    if not settings:
        settings = ProjectSettings(
            project_id=project_id,
            group_labels_json=DEFAULT_GROUP_LABELS,
            dedup_policy="keep_all_rows",
        )
        db.add(settings)
    settings.group_labels_json = payload.group_labels
    settings.dedup_policy = payload.dedup_policy
    settings.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(settings)
    return ProjectSettingsPublic(
        project_id=settings.project_id,
        group_labels=settings.group_labels_json,
        dedup_policy=settings.dedup_policy,
        created_at=settings.created_at,
        updated_at=settings.updated_at,
    )
