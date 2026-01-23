from __future__ import annotations

from pathlib import Path
from uuid import uuid4

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, File, Form, HTTPException, Response, UploadFile, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import CurrentUser
from app.core.config import get_settings
from app.db.session import get_db
from app.models.column_mapping import ColumnMapping
from app.models.project import Project
from app.models.project_dashboard_source import ProjectDashboardSource
from app.models.upload import Upload, UploadStatus, UploadType
from app.schemas.uploads import (
    DashboardSourcePublic,
    DashboardSourceUpdate,
    MappingStatus,
    UploadCleanupRequest,
    UploadCleanupResult,
    UploadPublic,
)

router = APIRouter(prefix="/projects", tags=["uploads"])
uploads_router = APIRouter(prefix="/uploads", tags=["uploads"])

ALLOWED_EXTENSIONS = {".csv", ".xlsx"}
MAX_UPLOAD_SIZE = 10 * 1024 * 1024


def _ensure_project(
    project_id: int,
    current_user: CurrentUser,
    db: Session,
) -> Project:
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
    return project


def _parse_upload_type(raw_value: str) -> UploadType:
    try:
        return UploadType(raw_value)
    except ValueError:
        normalized = raw_value.strip().lower()
        for upload_type in UploadType:
            if (
                upload_type.name.lower() == normalized
                or upload_type.value.lower() == normalized
            ):
                return upload_type
    raise HTTPException(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        detail="Неверный тип загрузки.",
    )


@router.get("/{project_id}/uploads", response_model=list[UploadPublic])
def list_uploads(
    project_id: int,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
) -> list[UploadPublic]:
    _ensure_project(project_id, current_user, db)
    uploads = db.scalars(
        select(Upload)
        .where(Upload.project_id == project_id, Upload.is_deleted.is_(False))
        .order_by(Upload.created_at.desc())
    ).all()
    upload_ids = [upload.id for upload in uploads]
    mapped_ids = set()
    if upload_ids:
        mapped_ids = set(
            db.scalars(
                select(ColumnMapping.upload_id).where(
                    ColumnMapping.upload_id.in_(upload_ids)
                )
            ).all()
        )
    sources = db.scalars(
        select(ProjectDashboardSource).where(
            ProjectDashboardSource.project_id == project_id
        )
    ).all()
    source_map = {source.data_type: source.upload_id for source in sources}

    return [
        UploadPublic(
            id=upload.id,
            project_id=upload.project_id,
            type=upload.type,
            status=upload.status,
            file_path=upload.file_path,
            original_filename=upload.original_filename,
            created_at=upload.created_at,
            used_in_dashboard=source_map.get(upload.type) == upload.id,
            mapping_status=(
                MappingStatus.MAPPED
                if upload.id in mapped_ids
                else MappingStatus.UNMAPPED
            ),
        )
        for upload in uploads
    ]


@router.post(
    "/{project_id}/uploads",
    response_model=UploadPublic,
    status_code=status.HTTP_201_CREATED,
)
async def create_upload(
    project_id: int,
    current_user: CurrentUser,
    file: UploadFile = File(...),
    upload_type: str = Form(..., alias="type"),
    db: Session = Depends(get_db),
) -> UploadPublic:
    _ensure_project(project_id, current_user, db)
    resolved_upload_type = _parse_upload_type(upload_type)

    filename = file.filename or ""
    extension = Path(filename).suffix.lower()
    if extension not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Поддерживаются только файлы CSV или XLSX.",
        )

    settings = get_settings()
    upload_root = Path(settings.upload_dir)
    project_dir = upload_root / f"project_{project_id}"
    project_dir.mkdir(parents=True, exist_ok=True)

    stored_name = f"{uuid4().hex}{extension}"
    stored_path = project_dir / stored_name

    total_size = 0
    try:
        with stored_path.open("wb") as target:
            while True:
                chunk = await file.read(1024 * 1024)
                if not chunk:
                    break
                total_size += len(chunk)
                if total_size > MAX_UPLOAD_SIZE:
                    raise HTTPException(
                        status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                        detail="Файл превышает допустимый размер.",
                    )
                target.write(chunk)
    except HTTPException:
        if stored_path.exists():
            stored_path.unlink(missing_ok=True)
        raise
    finally:
        await file.close()

    upload = Upload(
        project_id=project_id,
        type=resolved_upload_type,
        status=UploadStatus.UPLOADED,
        file_path=str(stored_path),
        original_filename=filename,
    )
    db.add(upload)
    db.commit()
    db.refresh(upload)
    return UploadPublic(
        id=upload.id,
        project_id=upload.project_id,
        type=upload.type,
        status=upload.status,
        file_path=upload.file_path,
        original_filename=upload.original_filename,
        created_at=upload.created_at,
        used_in_dashboard=False,
        mapping_status=MappingStatus.UNMAPPED,
    )


@router.post(
    "/{project_id}/dashboard-sources",
    response_model=DashboardSourcePublic,
)
def set_dashboard_source(
    project_id: int,
    payload: DashboardSourceUpdate,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
) -> DashboardSourcePublic:
    _ensure_project(project_id, current_user, db)

    if payload.upload_id is not None:
        upload = db.scalar(
            select(Upload).where(
                Upload.id == payload.upload_id,
                Upload.project_id == project_id,
                Upload.is_deleted.is_(False),
            )
        )
        if not upload:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Загрузка не найдена.",
            )
        if upload.type != payload.data_type:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Тип данных не совпадает с загрузкой.",
            )

    source = db.scalar(
        select(ProjectDashboardSource).where(
            ProjectDashboardSource.project_id == project_id,
            ProjectDashboardSource.data_type == payload.data_type,
        )
    )
    if source:
        source.upload_id = payload.upload_id
    else:
        source = ProjectDashboardSource(
            project_id=project_id,
            data_type=payload.data_type,
            upload_id=payload.upload_id,
        )
        db.add(source)
    db.commit()
    db.refresh(source)
    return DashboardSourcePublic.model_validate(source)


@router.post(
    "/{project_id}/uploads/cleanup",
    response_model=UploadCleanupResult,
)
def cleanup_uploads(
    project_id: int,
    payload: UploadCleanupRequest,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
) -> UploadCleanupResult:
    _ensure_project(project_id, current_user, db)
    sources = db.scalars(
        select(ProjectDashboardSource).where(
            ProjectDashboardSource.project_id == project_id
        )
    ).all()
    active_ids = {source.upload_id for source in sources if source.upload_id}

    query = select(Upload).where(
        Upload.project_id == project_id,
        Upload.is_deleted.is_(False),
    )
    if active_ids:
        query = query.where(Upload.id.not_in(active_ids))
    if payload.older_than_days is not None:
        cutoff = datetime.now(timezone.utc) - timedelta(days=payload.older_than_days)
        query = query.where(Upload.created_at < cutoff)

    uploads = db.scalars(query).all()
    for upload in uploads:
        upload.is_deleted = True
    db.commit()
    return UploadCleanupResult(deleted=len(uploads))


@uploads_router.delete(
    "/{upload_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
)
def delete_upload(
    upload_id: int,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
) -> Response:
    upload = db.scalar(
        select(Upload)
        .join(Project, Upload.project_id == Project.id)
        .where(
            Upload.id == upload_id,
            Upload.is_deleted.is_(False),
            Project.owner_id == current_user.id,
        )
    )
    if not upload:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Загрузка не найдена.",
        )
    source = db.scalar(
        select(ProjectDashboardSource).where(
            ProjectDashboardSource.project_id == upload.project_id,
            ProjectDashboardSource.data_type == upload.type,
        )
    )
    if source and source.upload_id == upload.id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Сначала уберите загрузку из дэшборда.",
        )
    upload.is_deleted = True
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
