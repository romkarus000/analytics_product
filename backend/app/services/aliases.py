from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.dim_manager import DimManager
from app.models.dim_manager_alias import DimManagerAlias
from app.models.dim_product import DimProduct
from app.models.dim_product_alias import DimProductAlias


def resolve_product_alias(db: Session, project_id: int, alias: str) -> int | None:
    if not alias:
        return None
    return db.scalar(
        select(DimProductAlias.product_id).where(
            DimProductAlias.project_id == project_id,
            DimProductAlias.alias == alias,
        )
    )


def resolve_manager_alias(db: Session, project_id: int, alias: str) -> int | None:
    if not alias:
        return None
    return db.scalar(
        select(DimManagerAlias.manager_id).where(
            DimManagerAlias.project_id == project_id,
            DimManagerAlias.alias == alias,
        )
    )


def get_product_name(db: Session, product_id: int | None) -> str | None:
    if not product_id:
        return None
    return db.scalar(select(DimProduct.canonical_name).where(DimProduct.id == product_id))


def get_manager_name(db: Session, manager_id: int | None) -> str | None:
    if not manager_id:
        return None
    return db.scalar(select(DimManager.canonical_name).where(DimManager.id == manager_id))
