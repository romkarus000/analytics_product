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


class MappingStatus(str, Enum):
    MAPPED = "mapped"
    UNMAPPED = "unmapped"


class UploadPublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    project_id: int
    type: UploadType
    status: UploadStatus
    mapping_status: MappingStatus
    file_path: str
    original_filename: str
    created_at: datetime
    used_in_dashboard: bool = False


class DashboardSourceUpdate(BaseModel):
    data_type: UploadType
    upload_id: int | None = None


class DashboardSourcePublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    project_id: int
    data_type: UploadType
    upload_id: int | None = None
    updated_at: datetime


class UploadCleanupMode(str, Enum):
    ALL = "all"
    INACTIVE_ONLY = "inactive_only"


class UploadCleanupRequest(BaseModel):
    mode: UploadCleanupMode = UploadCleanupMode.INACTIVE_ONLY
    older_than_days: int | None = None


class UploadCleanupResult(BaseModel):
    deleted: int


class UploadPreview(BaseModel):
    headers: list[str]
    sample_rows: list[list[Any]]
    inferred_types: dict[str, str]
    mapping_suggestions: dict[str, str | None]
    column_stats: dict[str, dict[str, Any]] = Field(default_factory=dict)
    upload_type: UploadType | None = None
    project_id: int | None = None


class ColumnMappingCreate(BaseModel):
    mapping: dict[str, str | None] = Field(default_factory=dict)
    normalization: dict[str, dict[str, Any]] = Field(default_factory=dict)
    operation_type_mapping: dict[str, str] = Field(default_factory=dict)
    unknown_operation_policy: str = Field(default="error")


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
    skipped_rows: int = 0


class QualityReport(BaseModel):
    errors: list[QualityIssue]
    warnings: list[QualityIssue]
    stats: QualityStats


class ImportResult(BaseModel):
    imported: int
