from __future__ import annotations

from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import CurrentUser
from app.core.config import get_settings
from app.db.session import get_db
from app.models.project import Project
from app.models.upload import Upload, UploadStatus, UploadType
from app.schemas.uploads import UploadPublic

router = APIRouter(prefix="/projects", tags=["uploads"])

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


@router.get("/{project_id}/uploads", response_model=list[UploadPublic])
def list_uploads(
    project_id: int,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
) -> list[UploadPublic]:
    _ensure_project(project_id, current_user, db)
    uploads = db.scalars(
        select(Upload)
        .where(Upload.project_id == project_id)
        .order_by(Upload.created_at.desc())
    ).all()
    return [UploadPublic.model_validate(upload) for upload in uploads]


@router.post(
    "/{project_id}/uploads",
    response_model=UploadPublic,
    status_code=status.HTTP_201_CREATED,
)
async def create_upload(
    project_id: int,
    current_user: CurrentUser,
    file: UploadFile = File(...),
    upload_type: UploadType = Form(..., alias="type"),
    db: Session = Depends(get_db),
) -> UploadPublic:
    _ensure_project(project_id, current_user, db)

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
        type=upload_type,
        status=UploadStatus.UPLOADED,
        file_path=str(stored_path),
        original_filename=filename,
    )
    db.add(upload)
    db.commit()
    db.refresh(upload)
    return UploadPublic.model_validate(upload)
