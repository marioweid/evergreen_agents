"""Roadmap search sub-agent."""


import asyncpg
from pydantic_ai import Agent, RunContext

from evergreen.agent.tools.roadmap import (
    list_recent_roadmap_items,
    search_roadmap,
)
from evergreen.pipeline.embedder import embed_query
from evergreen.shared.models import RoadmapItem, RoadmapSearchResult


class RoadmapDeps:
    def __init__(self, pool: asyncpg.Pool, openai_api_key: str) -> None:
        self.pool = pool
        self.openai_api_key = openai_api_key


roadmap_agent: Agent[RoadmapDeps, str] = Agent(
    "anthropic:claude-sonnet-4-6",
    deps_type=RoadmapDeps,
    system_prompt=(
        "You are an M365 roadmap expert. Answer questions about Microsoft 365 features, "
        "updates, and planned changes using the roadmap database. Be concise and factual."
    ),
)


@roadmap_agent.tool
async def search_m365_roadmap(ctx: RunContext[RoadmapDeps], query: str) -> list[dict]:
    """Semantic search for M365 roadmap items matching the query."""
    embedding = await embed_query(query, ctx.deps.openai_api_key)
    results: list[RoadmapSearchResult] = await search_roadmap(ctx.deps.pool, embedding, limit=8)
    return [
        {
            "id": r.item.id,
            "title": r.item.title,
            "description": r.item.description,
            "status": r.item.status,
            "products": r.item.products,
            "release_phase": r.item.release_phase,
            "similarity": round(r.similarity, 3),
        }
        for r in results
    ]


@roadmap_agent.tool
async def list_recent_items(
    ctx: RunContext[RoadmapDeps], product: str | None = None, limit: int = 10
) -> list[dict]:
    """List recently updated roadmap items, optionally filtered by product name."""
    items: list[RoadmapItem] = await list_recent_roadmap_items(
        ctx.deps.pool, product_filter=product, limit=limit
    )
    return [
        {
            "id": i.id,
            "title": i.title,
            "status": i.status,
            "products": i.products,
            "release_phase": i.release_phase,
            "updated_at": i.updated_at.isoformat() if i.updated_at else None,
        }
        for i in items
    ]
