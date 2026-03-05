"""Fetch M365 Roadmap items from the Microsoft feed."""

from __future__ import annotations

import httpx

from evergreen.shared.models import RoadmapItem

_ROADMAP_URL = "https://www.microsoft.com/en-us/microsoft-365/roadmap?f=json&filters="


def _parse_item(raw: dict) -> RoadmapItem:
    def split_tags(value: str | None) -> list[str]:
        if not value:
            return []
        return [v.strip() for v in value.split(";") if v.strip()]

    return RoadmapItem(
        id=int(raw["id"]),
        title=raw.get("title", ""),
        description=raw.get("description", ""),
        status=raw.get("status"),
        release_date=raw.get("publicRoadmapStatus") or raw.get("roadmapDate"),
        products=split_tags(raw.get("products")),
        platforms=split_tags(raw.get("platforms")),
        cloud_instances=split_tags(raw.get("cloudInstances")),
        release_phase=raw.get("releasePhase"),
    )


async def fetch_roadmap_items() -> list[RoadmapItem]:
    """Fetch all roadmap items from the M365 roadmap feed."""
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.get(_ROADMAP_URL)
        response.raise_for_status()
        data = response.json()

    items_raw = data.get("items", [])
    return [_parse_item(item) for item in items_raw]
