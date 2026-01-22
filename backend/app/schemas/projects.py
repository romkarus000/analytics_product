from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class ProjectCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    timezone: str = Field(default="Europe/Moscow", min_length=1, max_length=64)


class ProjectPublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    owner_id: int
    name: str
    timezone: str
    created_at: datetime


class ProjectOwner(BaseModel):
    id: int
    email: str


class ProjectsResponse(BaseModel):
    user: ProjectOwner
    projects: list[ProjectPublic]
