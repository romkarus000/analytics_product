from __future__ import annotations

import json
from datetime import date
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import CurrentUser
from app.db.session import get_db
from app.models.insight import Insight
from app.models.project import Project
from app.schemas.insights import InsightPublic

router = APIRouter(prefix="/projects", tags=["insights"])


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


@router.get("/{project_id}/insights", response_model=list[InsightPublic])
def list_insights(
    project_id: int,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
    from_date: date | None = Query(default=None, alias="from"),
    to_date: date | None = Query(default=None, alias="to"),
) -> list[InsightPublic]:
    _get_project(project_id, current_user, db)
    query = select(Insight).where(Insight.project_id == project_id)
    if from_date:
        query = query.where(Insight.period_from >= from_date)
    if to_date:
        query = query.where(Insight.period_to <= to_date)
    insights = db.scalars(query.order_by(Insight.created_at.desc())).all()

    response: list[InsightPublic] = []
    for insight in insights:
        evidence: dict[str, Any] = {}
        try:
            evidence = json.loads(insight.evidence_json)
        except json.JSONDecodeError:
            evidence = {}
        response.append(
            InsightPublic(
                id=insight.id,
                project_id=insight.project_id,
                metric_key=insight.metric_key,
                period_from=insight.period_from,
                period_to=insight.period_to,
                text=insight.text,
                evidence_json=evidence,
                created_at=insight.created_at,
            )
        )
    return response
