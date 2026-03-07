"""Shared Pydantic models for database entities."""


from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class Customer(BaseModel):
    id: int | None = None
    name: str
    description: str
    products_used: list[str]
    priority: Literal["low", "medium", "high"] = "medium"
    notes: str | None = None
    drive_folder_id: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None


class CustomerCreate(BaseModel):
    name: str
    description: str
    products_used: list[str]
    priority: Literal["low", "medium", "high"] = "medium"
    notes: str | None = None


class CustomerUpdate(BaseModel):
    description: str | None = None
    products_used: list[str] | None = None
    priority: Literal["low", "medium", "high"] | None = None
    notes: str | None = None


class RoadmapItem(BaseModel):
    id: int
    title: str
    description: str | None = None
    status: str | None = None
    release_date: str | None = None
    products: list[str] = Field(default_factory=list)
    platforms: list[str] = Field(default_factory=list)
    cloud_instances: list[str] = Field(default_factory=list)
    release_phase: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None


class RoadmapSearchResult(BaseModel):
    item: RoadmapItem
    similarity: float


class ImpactResult(BaseModel):
    customer: Customer
    impacted_items: list[RoadmapSearchResult]
    summary: str


class WeeklyReport(BaseModel):
    customer: Customer
    report_text: str
    generated_at: datetime


class RoadmapFilters(BaseModel):
    products: list[str]
    statuses: list[str]
    release_phases: list[str]
