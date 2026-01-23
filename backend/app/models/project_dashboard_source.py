from datetime import datetime, timezone

from sqlalchemy import DateTime, Enum as SqlEnum, ForeignKey, Integer
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.upload import UploadType


class ProjectDashboardSource(Base):
    __tablename__ = "project_dashboard_sources"

    project_id: Mapped[int] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"),
        primary_key=True,
    )
    data_type: Mapped[UploadType] = mapped_column(
        SqlEnum(
            UploadType,
            name="upload_type",
            values_callable=lambda enum_cls: [member.value for member in enum_cls],
        ),
        primary_key=True,
    )
    upload_id: Mapped[int | None] = mapped_column(
        Integer,
        ForeignKey("uploads.id", ondelete="SET NULL"),
        nullable=True,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
