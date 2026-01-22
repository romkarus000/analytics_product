from sqlalchemy import ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class DimProductAlias(Base):
    __tablename__ = "dim_product_aliases"
    __table_args__ = (
        UniqueConstraint("project_id", "alias", name="uq_dim_product_aliases_alias"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    project_id: Mapped[int] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    alias: Mapped[str] = mapped_column(String(255), nullable=False)
    product_id: Mapped[int] = mapped_column(
        ForeignKey("dim_products.id", ondelete="CASCADE"), nullable=False
    )
