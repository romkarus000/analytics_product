from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class ProductCreate(BaseModel):
    canonical_name: str = Field(min_length=1, max_length=255)
    category: str = Field(min_length=1, max_length=255)
    product_type: str = Field(min_length=1, max_length=64)


class ProductUpdate(BaseModel):
    canonical_name: str = Field(min_length=1, max_length=255)
    category: str = Field(min_length=1, max_length=255)
    product_type: str = Field(min_length=1, max_length=64)


class ProductAliasCreate(BaseModel):
    alias: str = Field(min_length=1, max_length=255)


class ProductAliasPublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    alias: str
    product_id: int


class ProductPublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    canonical_name: str
    category: str
    product_type: str
    created_at: datetime
    aliases: list[ProductAliasPublic]


class ManagerCreate(BaseModel):
    canonical_name: str = Field(min_length=1, max_length=255)


class ManagerUpdate(BaseModel):
    canonical_name: str = Field(min_length=1, max_length=255)


class ManagerAliasCreate(BaseModel):
    alias: str = Field(min_length=1, max_length=255)


class ManagerAliasPublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    alias: str
    manager_id: int


class ManagerPublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    canonical_name: str
    created_at: datetime
    aliases: list[ManagerAliasPublic]
