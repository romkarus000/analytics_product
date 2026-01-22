from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, Integer, JSON
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class ColumnMapping(Base):
    __tablename__ = "column_mappings"

    upload_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("uploads.id", ondelete="CASCADE"),
        primary_key=True,
    )
    mapping_json: Mapped[dict] = mapped_column(JSON, nullable=False)
    normalization_json: Mapped[dict] = mapped_column(JSON, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
