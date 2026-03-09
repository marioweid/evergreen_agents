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
    report_template: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None


class CustomerCreate(BaseModel):
    name: str
    description: str
    products_used: list[str]
    priority: Literal["low", "medium", "high"] = "medium"
    notes: str | None = None


class CustomerUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    products_used: list[str] | None = None
    priority: Literal["low", "medium", "high"] | None = None
    notes: str | None = None
    report_template: str | None = None


class CustomerDocument(BaseModel):
    id: int
    customer_id: int
    title: str
    content: str
    created_at: datetime | None = None
    updated_at: datetime | None = None


class CustomerDocumentCreate(BaseModel):
    title: str
    content: str


class CustomerDocumentUpdate(BaseModel):
    title: str | None = None
    content: str | None = None


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


class RoadmapChange(BaseModel):
    id: int
    item_id: int
    item_title: str
    change_type: str
    old_value: str | None = None
    new_value: str | None = None
    sync_id: str
    detected_at: datetime


class RoadmapFilters(BaseModel):
    products: list[str]
    statuses: list[str]
    release_phases: list[str]


class Report(BaseModel):
    id: int
    customer_id: int
    title: str
    content: str
    status: str = "draft"
    generated_at: datetime
