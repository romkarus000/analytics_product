from sqlalchemy import ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class DimManagerAlias(Base):
    __tablename__ = "dim_manager_aliases"
    __table_args__ = (
        UniqueConstraint("project_id", "alias", name="uq_dim_manager_aliases_alias"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    project_id: Mapped[int] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    alias: Mapped[str] = mapped_column(String(255), nullable=False)
    manager_id: Mapped[int] = mapped_column(
        ForeignKey("dim_managers.id", ondelete="CASCADE"), nullable=False
    )
