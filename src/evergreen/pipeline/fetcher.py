"""Fetch M365 Roadmap items from the Microsoft RSS feed."""

import xml.etree.ElementTree as ET

import httpx

from evergreen.shared.models import RoadmapItem

_ROADMAP_RSS_URL = "https://www.microsoft.com/releasecommunications/api/v2/m365/rss"
_ATOM_NS = "http://www.w3.org/2005/Atom"

_STATUSES = {"In development", "Launched", "Rolling out", "Cancelled"}
_RELEASE_PHASES = {"General Availability", "Preview", "Public Preview", "Private Preview"}
_PLATFORMS = {"Web", "Desktop", "Mobile", "Mac", "iOS", "Android", "Windows", "Linux", "Teams"}


type _ClassifiedCategories = tuple[str | None, str | None, list[str], list[str], list[str]]


def _classify_categories(categories: list[str]) -> _ClassifiedCategories:
    """Split RSS categories into (status, release_phase, cloud_instances, products, platforms)."""
    status = None
    release_phase = None
    cloud_instances = []
    products = []
    platforms = []

    for cat in categories:
        if cat in _STATUSES:
            status = cat
        elif cat in _RELEASE_PHASES:
            release_phase = cat
        elif "Tenant" in cat or cat.startswith("GCC") or cat in {"DoD", "Air-Gapped"}:
            cloud_instances.append(cat)
        elif cat in _PLATFORMS:
            platforms.append(cat)
        else:
            products.append(cat)

    return status, release_phase, cloud_instances, products, platforms


def _parse_item(item: ET.Element) -> RoadmapItem:
    guid = item.findtext("guid", "").strip()
    title = item.findtext("title", "").strip()
    description = item.findtext("description", "").strip()
    pub_date = item.findtext("pubDate")
    categories = [c.text.strip() for c in item.findall("category") if c.text]

    status, release_phase, cloud_instances, products, platforms = _classify_categories(categories)

    return RoadmapItem(
        id=int(guid),
        title=title,
        description=description,
        status=status,
        release_date=pub_date,
        products=products,
        platforms=platforms,
        cloud_instances=cloud_instances,
        release_phase=release_phase,
    )


async def fetch_roadmap_items() -> list[RoadmapItem]:
    """Fetch all roadmap items from the M365 RSS feed."""
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.get(_ROADMAP_RSS_URL)
        response.raise_for_status()

    root = ET.fromstring(response.content)
    channel = root.find("channel")
    if channel is None:
        return []

    return [_parse_item(item) for item in channel.findall("item")]
