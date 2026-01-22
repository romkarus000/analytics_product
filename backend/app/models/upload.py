from datetime import datetime, timezone
from enum import Enum

from sqlalchemy import DateTime, Enum as SqlEnum, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class UploadType(str, Enum):
    TRANSACTIONS = "transactions"
    MARKETING_SPEND = "marketing_spend"


class UploadStatus(str, Enum):
    UPLOADED = "uploaded"
    VALIDATED = "validated"
    IMPORTED = "imported"
    FAILED = "failed"


class Upload(Base):
    __tablename__ = "uploads"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    project_id: Mapped[int] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    type: Mapped[UploadType] = mapped_column(
        SqlEnum(UploadType, name="upload_type"),
        nullable=False,
    )
    status: Mapped[UploadStatus] = mapped_column(
        SqlEnum(UploadStatus, name="upload_status"),
        nullable=False,
    )
    file_path: Mapped[str] = mapped_column(String(512), nullable=False)
    original_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
