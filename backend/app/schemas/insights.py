from __future__ import annotations

from datetime import date, datetime
from typing import Any

from pydantic import BaseModel, ConfigDict


class InsightPublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    project_id: int
    metric_key: str
    period_from: date
    period_to: date
    text: str
    evidence_json: dict[str, Any]
    created_at: datetime
