from __future__ import annotations

import json
from datetime import date
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import CurrentUser
from app.db.session import get_db
from app.models.project import Project
from app.schemas.metrics import MetricDefinitionPublic, MetricValueResponse
from app.services.metrics import (
    compute_metric,
    get_metric_definition,
    is_metric_available,
    list_metric_definitions,
)

router = APIRouter(prefix="/projects", tags=["metrics"])


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


@router.get("/{project_id}/metrics", response_model=list[MetricDefinitionPublic])
def list_metrics(
    project_id: int,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
) -> list[MetricDefinitionPublic]:
    _get_project(project_id, current_user, db)
    metrics = list_metric_definitions(db)
    response: list[MetricDefinitionPublic] = []
    for metric in metrics:
        requirements = json.loads(metric.requirements_json or "[]")
        dims_allowed = json.loads(metric.dims_allowed_json or "[]")
        response.append(
            MetricDefinitionPublic(
                metric_key=metric.metric_key,
                title=metric.title,
                description=metric.description,
                source_table=metric.source_table,
                aggregation=metric.aggregation,
                dims_allowed=dims_allowed,
                requirements=requirements,
                version=metric.version,
                created_at=metric.created_at,
                is_available=is_metric_available(db, project_id, requirements),
            )
        )
    return response


@router.get("/{project_id}/metrics/{metric_key}", response_model=MetricValueResponse)
def get_metric(
    project_id: int,
    metric_key: str,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
    from_date: date | None = Query(default=None, alias="from"),
    to_date: date | None = Query(default=None, alias="to"),
    filters: str | None = Query(default=None),
) -> MetricValueResponse:
    _get_project(project_id, current_user, db)
    metric = get_metric_definition(db, metric_key)
    if not metric:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Метрика не найдена.",
        )
    filters_payload = _parse_filters(filters)
    value = compute_metric(db, project_id, metric_key, from_date, to_date, filters_payload)
    return MetricValueResponse(
        metric_key=metric.metric_key,
        title=metric.title,
        description=metric.description,
        value=value,
        from_date=from_date,
        to_date=to_date,
        filters=filters_payload,
    )
