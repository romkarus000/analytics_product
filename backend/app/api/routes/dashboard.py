from __future__ import annotations

import json
from datetime import date
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.api.deps import CurrentUser
from app.db.session import get_db
from app.models.dim_manager import DimManager
from app.models.dim_manager_alias import DimManagerAlias
from app.models.dim_product import DimProduct
from app.models.dim_product_alias import DimProductAlias
from app.models.fact_marketing_spend import FactMarketingSpend
from app.models.fact_transaction import FactTransaction
from app.models.insight import Insight
from app.models.project import Project
from app.schemas.dashboard import DashboardResponse
from app.services.dashboard import get_dashboard_data

router = APIRouter(prefix="/projects", tags=["dashboard"])


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


def _parse_filters(filters: str | None) -> dict[str, Any]:
    if not filters:
        return {}
    try:
        payload = json.loads(filters)
    except json.JSONDecodeError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Некорректный JSON для filters.",
        ) from exc
    if not isinstance(payload, dict):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="filters должен быть JSON-объектом.",
        )
    return payload


@router.get("/{project_id}/dashboard", response_model=DashboardResponse)
def get_dashboard(
    project_id: int,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
    from_date: date | None = Query(default=None, alias="from"),
    to_date: date | None = Query(default=None, alias="to"),
    filters: str | None = Query(default=None),
) -> DashboardResponse:
    _get_project(project_id, current_user, db)
    filters_payload = _parse_filters(filters)
    data = get_dashboard_data(db, project_id, from_date, to_date, filters_payload)
    return DashboardResponse(**data)


@router.delete(
    "/{project_id}/dashboard",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
)
def clear_dashboard(
    project_id: int,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
) -> Response:
    _get_project(project_id, current_user, db)
    db.execute(
        delete(FactTransaction).where(FactTransaction.project_id == project_id)
    )
    db.execute(
        delete(FactMarketingSpend).where(FactMarketingSpend.project_id == project_id)
    )
    db.execute(delete(Insight).where(Insight.project_id == project_id))
    db.execute(
        delete(DimProductAlias).where(DimProductAlias.project_id == project_id)
    )
    db.execute(delete(DimProduct).where(DimProduct.project_id == project_id))
    db.execute(
        delete(DimManagerAlias).where(DimManagerAlias.project_id == project_id)
    )
    db.execute(delete(DimManager).where(DimManager.project_id == project_id))
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
