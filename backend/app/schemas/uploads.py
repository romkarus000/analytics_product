from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class UploadType(str, Enum):
    TRANSACTIONS = "transactions"
    MARKETING_SPEND = "marketing_spend"


class UploadStatus(str, Enum):
    UPLOADED = "uploaded"
    VALIDATED = "validated"
    IMPORTED = "imported"
    FAILED = "failed"


class UploadPublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    project_id: int
    type: UploadType
    status: UploadStatus
    file_path: str
    original_filename: str
    created_at: datetime


class UploadPreview(BaseModel):
    headers: list[str]
    sample_rows: list[list[Any]]
    inferred_types: dict[str, str]
    mapping_suggestions: dict[str, str | None]
    upload_type: UploadType | None = None


class ColumnMappingCreate(BaseModel):
    mapping: dict[str, str | None] = Field(default_factory=dict)
    normalization: dict[str, dict[str, Any]] = Field(default_factory=dict)


class ColumnMappingPublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    upload_id: int
    mapping_json: dict[str, Any]
    normalization_json: dict[str, Any]
    created_at: datetime


class QualityIssue(BaseModel):
    row: int
    field: str
    message: str


class QualityStats(BaseModel):
    total_rows: int
    valid_rows: int
    error_count: int
    warning_count: int


class QualityReport(BaseModel):
    errors: list[QualityIssue]
    warnings: list[QualityIssue]
    stats: QualityStats


class ImportResult(BaseModel):
    imported: int
