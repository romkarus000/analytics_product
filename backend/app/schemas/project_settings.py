from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class ProjectSettingsBase(BaseModel):
    group_labels: list[str] = Field(default_factory=list, max_length=5)
    dedup_policy: str = Field(default="keep_all_rows")


class ProjectSettingsCreate(ProjectSettingsBase):
    pass


class ProjectSettingsUpdate(ProjectSettingsBase):
    pass


class ProjectSettingsPublic(ProjectSettingsBase):
    model_config = ConfigDict(from_attributes=True)

    project_id: int
    created_at: datetime
    updated_at: datetime
