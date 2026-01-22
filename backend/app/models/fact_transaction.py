from datetime import date, datetime, timezone

from sqlalchemy import Date, DateTime, Float, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class FactTransaction(Base):
    __tablename__ = "fact_transactions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    project_id: Mapped[int] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    order_id: Mapped[str] = mapped_column(String(128), nullable=False)
    date: Mapped[date] = mapped_column(Date, nullable=False)
    operation_type: Mapped[str] = mapped_column(String(32), nullable=False)
    amount: Mapped[float] = mapped_column(Float, nullable=False)
    client_id: Mapped[str] = mapped_column(String(128), nullable=False)
    product_name_raw: Mapped[str] = mapped_column(String(255), nullable=False)
    product_name_norm: Mapped[str] = mapped_column(String(255), nullable=False)
    product_category: Mapped[str] = mapped_column(String(255), nullable=False)
    product_type: Mapped[str | None] = mapped_column(String(255), nullable=True)
    manager_raw: Mapped[str] = mapped_column(String(255), nullable=False)
    manager_norm: Mapped[str] = mapped_column(String(255), nullable=False)
    payment_method: Mapped[str | None] = mapped_column(String(255), nullable=True)
    commission: Mapped[float | None] = mapped_column(Float, nullable=True)
    utm_source: Mapped[str | None] = mapped_column(String(255), nullable=True)
    utm_medium: Mapped[str | None] = mapped_column(String(255), nullable=True)
    utm_campaign: Mapped[str | None] = mapped_column(String(255), nullable=True)
    utm_term: Mapped[str | None] = mapped_column(String(255), nullable=True)
    utm_content: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
