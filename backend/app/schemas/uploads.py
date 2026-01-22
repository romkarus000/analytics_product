from datetime import datetime
from enum import Enum

from pydantic import BaseModel, ConfigDict


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
