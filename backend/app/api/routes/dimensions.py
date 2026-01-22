from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.api.deps import CurrentUser
from app.db.session import get_db
from app.models.dim_manager import DimManager
from app.models.dim_manager_alias import DimManagerAlias
from app.models.dim_product import DimProduct
from app.models.dim_product_alias import DimProductAlias
from app.models.fact_transaction import FactTransaction
from app.models.project import Project
from app.schemas.dimensions import (
    ManagerAliasCreate,
    ManagerAliasPublic,
    ManagerCreate,
    ManagerPublic,
    ManagerUpdate,
    ProductAliasCreate,
    ProductAliasPublic,
    ProductCreate,
    ProductPublic,
    ProductUpdate,
)

router = APIRouter(prefix="/projects", tags=["dimensions"])


def _get_project(project_id: int, current_user: CurrentUser, db: Session) -> Project:
    project = db.scalar(
        select(Project).where(
            Project.id == project_id, Project.owner_id == current_user.id
        )
    )
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Проект не найден.",
        )
    return project


def _build_product_aliases(
    db: Session, project_id: int, product_ids: list[int]
) -> dict[int, list[DimProductAlias]]:
    if not product_ids:
        return {}
    aliases = db.scalars(
        select(DimProductAlias)
        .where(
            DimProductAlias.project_id == project_id,
            DimProductAlias.product_id.in_(product_ids),
        )
        .order_by(DimProductAlias.alias.asc())
    ).all()
    grouped: dict[int, list[DimProductAlias]] = {}
    for alias in aliases:
        grouped.setdefault(alias.product_id, []).append(alias)
    return grouped


def _build_manager_aliases(
    db: Session, project_id: int, manager_ids: list[int]
) -> dict[int, list[DimManagerAlias]]:
    if not manager_ids:
        return {}
    aliases = db.scalars(
        select(DimManagerAlias)
        .where(
            DimManagerAlias.project_id == project_id,
            DimManagerAlias.manager_id.in_(manager_ids),
        )
        .order_by(DimManagerAlias.alias.asc())
    ).all()
    grouped: dict[int, list[DimManagerAlias]] = {}
    for alias in aliases:
        grouped.setdefault(alias.manager_id, []).append(alias)
    return grouped


def _apply_product_alias(
    db: Session, project_id: int, alias: str, product: DimProduct
) -> DimProductAlias:
    existing = db.scalar(
        select(DimProductAlias).where(
            DimProductAlias.project_id == project_id,
            DimProductAlias.alias == alias,
        )
    )
    if existing:
        existing.product_id = product.id
        alias_row = existing
    else:
        alias_row = DimProductAlias(
            project_id=project_id,
            alias=alias,
            product_id=product.id,
        )
        db.add(alias_row)

    db.flush()
    db.execute(
        update(FactTransaction)
        .where(
            FactTransaction.project_id == project_id,
            FactTransaction.product_name_norm == alias,
        )
        .values(product_id=product.id, product_name_norm=product.canonical_name)
    )
    return alias_row


def _apply_manager_alias(
    db: Session, project_id: int, alias: str, manager: DimManager
) -> DimManagerAlias:
    existing = db.scalar(
        select(DimManagerAlias).where(
            DimManagerAlias.project_id == project_id,
            DimManagerAlias.alias == alias,
        )
    )
    if existing:
        existing.manager_id = manager.id
        alias_row = existing
    else:
        alias_row = DimManagerAlias(
            project_id=project_id,
            alias=alias,
            manager_id=manager.id,
        )
        db.add(alias_row)

    db.flush()
    db.execute(
        update(FactTransaction)
        .where(
            FactTransaction.project_id == project_id,
            FactTransaction.manager_norm == alias,
        )
        .values(manager_id=manager.id, manager_norm=manager.canonical_name)
    )
    return alias_row


@router.get("/{project_id}/products", response_model=list[ProductPublic])
def list_products(
    project_id: int,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
) -> list[ProductPublic]:
    _get_project(project_id, current_user, db)
    products = db.scalars(
        select(DimProduct)
        .where(DimProduct.project_id == project_id)
        .order_by(DimProduct.created_at.desc())
    ).all()
    product_ids = [product.id for product in products]
    aliases = _build_product_aliases(db, project_id, product_ids)
    response: list[ProductPublic] = []
    for product in products:
        response.append(
            ProductPublic(
                id=product.id,
                canonical_name=product.canonical_name,
                category=product.category,
                product_type=product.product_type,
                created_at=product.created_at,
                aliases=[
                    ProductAliasPublic.model_validate(alias)
                    for alias in aliases.get(product.id, [])
                ],
            )
        )
    return response


@router.post(
    "/{project_id}/products",
    response_model=ProductPublic,
    status_code=status.HTTP_201_CREATED,
)
def create_product(
    project_id: int,
    payload: ProductCreate,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
) -> ProductPublic:
    _get_project(project_id, current_user, db)
    product = DimProduct(
        project_id=project_id,
        canonical_name=payload.canonical_name.strip(),
        category=payload.category.strip(),
        product_type=payload.product_type.strip(),
    )
    db.add(product)
    db.flush()
    alias_row = _apply_product_alias(
        db, project_id, product.canonical_name, product
    )
    db.commit()
    db.refresh(product)
    return ProductPublic(
        id=product.id,
        canonical_name=product.canonical_name,
        category=product.category,
        product_type=product.product_type,
        created_at=product.created_at,
        aliases=[ProductAliasPublic.model_validate(alias_row)],
    )


@router.patch("/{project_id}/products/{product_id}", response_model=ProductPublic)
def update_product(
    project_id: int,
    product_id: int,
    payload: ProductUpdate,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
) -> ProductPublic:
    _get_project(project_id, current_user, db)
    product = db.scalar(
        select(DimProduct).where(
            DimProduct.id == product_id, DimProduct.project_id == project_id
        )
    )
    if not product:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Продукт не найден.",
        )
    product.canonical_name = payload.canonical_name.strip()
    product.category = payload.category.strip()
    product.product_type = payload.product_type.strip()
    alias_row = _apply_product_alias(
        db, project_id, product.canonical_name, product
    )
    db.execute(
        update(FactTransaction)
        .where(
            FactTransaction.project_id == project_id,
            FactTransaction.product_id == product.id,
        )
        .values(product_name_norm=product.canonical_name)
    )
    db.commit()
    db.refresh(product)
    aliases = _build_product_aliases(db, project_id, [product.id]).get(product.id, [])
    if alias_row and all(alias.id != alias_row.id for alias in aliases):
        aliases.append(alias_row)
    return ProductPublic(
        id=product.id,
        canonical_name=product.canonical_name,
        category=product.category,
        product_type=product.product_type,
        created_at=product.created_at,
        aliases=[ProductAliasPublic.model_validate(alias) for alias in aliases],
    )


@router.post(
    "/{project_id}/products/{product_id}/aliases",
    response_model=ProductAliasPublic,
    status_code=status.HTTP_201_CREATED,
)
def add_product_alias(
    project_id: int,
    product_id: int,
    payload: ProductAliasCreate,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
) -> ProductAliasPublic:
    _get_project(project_id, current_user, db)
    product = db.scalar(
        select(DimProduct).where(
            DimProduct.id == product_id, DimProduct.project_id == project_id
        )
    )
    if not product:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Продукт не найден.",
        )
    alias = payload.alias.strip()
    if not alias:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Алиас не может быть пустым.",
        )
    alias_row = _apply_product_alias(db, project_id, alias, product)
    db.commit()
    db.refresh(alias_row)
    return ProductAliasPublic.model_validate(alias_row)


@router.get("/{project_id}/managers", response_model=list[ManagerPublic])
def list_managers(
    project_id: int,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
) -> list[ManagerPublic]:
    _get_project(project_id, current_user, db)
    managers = db.scalars(
        select(DimManager)
        .where(DimManager.project_id == project_id)
        .order_by(DimManager.created_at.desc())
    ).all()
    manager_ids = [manager.id for manager in managers]
    aliases = _build_manager_aliases(db, project_id, manager_ids)
    response: list[ManagerPublic] = []
    for manager in managers:
        response.append(
            ManagerPublic(
                id=manager.id,
                canonical_name=manager.canonical_name,
                created_at=manager.created_at,
                aliases=[
                    ManagerAliasPublic.model_validate(alias)
                    for alias in aliases.get(manager.id, [])
                ],
            )
        )
    return response


@router.post(
    "/{project_id}/managers",
    response_model=ManagerPublic,
    status_code=status.HTTP_201_CREATED,
)
def create_manager(
    project_id: int,
    payload: ManagerCreate,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
) -> ManagerPublic:
    _get_project(project_id, current_user, db)
    manager = DimManager(
        project_id=project_id,
        canonical_name=payload.canonical_name.strip(),
    )
    db.add(manager)
    db.flush()
    alias_row = _apply_manager_alias(
        db, project_id, manager.canonical_name, manager
    )
    db.commit()
    db.refresh(manager)
    return ManagerPublic(
        id=manager.id,
        canonical_name=manager.canonical_name,
        created_at=manager.created_at,
        aliases=[ManagerAliasPublic.model_validate(alias_row)],
    )


@router.patch("/{project_id}/managers/{manager_id}", response_model=ManagerPublic)
def update_manager(
    project_id: int,
    manager_id: int,
    payload: ManagerUpdate,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
) -> ManagerPublic:
    _get_project(project_id, current_user, db)
    manager = db.scalar(
        select(DimManager).where(
            DimManager.id == manager_id, DimManager.project_id == project_id
        )
    )
    if not manager:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Менеджер не найден.",
        )
    manager.canonical_name = payload.canonical_name.strip()
    alias_row = _apply_manager_alias(
        db, project_id, manager.canonical_name, manager
    )
    db.execute(
        update(FactTransaction)
        .where(
            FactTransaction.project_id == project_id,
            FactTransaction.manager_id == manager.id,
        )
        .values(manager_norm=manager.canonical_name)
    )
    db.commit()
    db.refresh(manager)
    aliases = _build_manager_aliases(db, project_id, [manager.id]).get(manager.id, [])
    if alias_row and all(alias.id != alias_row.id for alias in aliases):
        aliases.append(alias_row)
    return ManagerPublic(
        id=manager.id,
        canonical_name=manager.canonical_name,
        created_at=manager.created_at,
        aliases=[ManagerAliasPublic.model_validate(alias) for alias in aliases],
    )


@router.post(
    "/{project_id}/managers/{manager_id}/aliases",
    response_model=ManagerAliasPublic,
    status_code=status.HTTP_201_CREATED,
)
def add_manager_alias(
    project_id: int,
    manager_id: int,
    payload: ManagerAliasCreate,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
) -> ManagerAliasPublic:
    _get_project(project_id, current_user, db)
    manager = db.scalar(
        select(DimManager).where(
            DimManager.id == manager_id, DimManager.project_id == project_id
        )
    )
    if not manager:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Менеджер не найден.",
        )
    alias = payload.alias.strip()
    if not alias:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Алиас не может быть пустым.",
        )
    alias_row = _apply_manager_alias(db, project_id, alias, manager)
    db.commit()
    db.refresh(alias_row)
    return ManagerAliasPublic.model_validate(alias_row)
