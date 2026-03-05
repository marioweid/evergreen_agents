"""Report generation sub-agent — weekly per-customer impact reports."""


from datetime import datetime

import asyncpg
from pydantic_ai import Agent, RunContext

from evergreen.agent.tools.customer import get_customer, list_customers
from evergreen.agent.tools.roadmap import list_recent_roadmap_items, search_roadmap
from evergreen.pipeline.embedder import embed_query
from evergreen.shared.models import Customer


class ReportDeps:
    def __init__(self, pool: asyncpg.Pool, openai_api_key: str) -> None:
        self.pool = pool
        self.openai_api_key = openai_api_key


report_agent: Agent[ReportDeps, str] = Agent(
    "anthropic:claude-sonnet-4-6",
    deps_type=ReportDeps,
    system_prompt=(
        "You generate weekly Microsoft 365 impact reports for customers. "
        "Each report should be professional, concise, and actionable. "
        "Structure: Executive Summary, Key Changes (with impact rating), Recommendations. "
        "Tailor the content to the customer's specific M365 products and business context."
    ),
)


@report_agent.tool
async def fetch_customer_for_report(ctx: RunContext[ReportDeps], customer_name: str) -> dict | None:
    """Get customer profile for report generation."""
    customer = await get_customer(ctx.deps.pool, customer_name)
    return customer.model_dump() if customer else None


@report_agent.tool
async def get_relevant_changes_for_report(
    ctx: RunContext[ReportDeps], products_query: str, limit: int = 15
) -> list[dict]:
    """Get recent roadmap changes relevant to the customer's products."""
    embedding = await embed_query(products_query, ctx.deps.openai_api_key)
    results = await search_roadmap(ctx.deps.pool, embedding, limit=limit)
    return [
        {
            "id": r.item.id,
            "title": r.item.title,
            "description": r.item.description,
            "status": r.item.status,
            "products": r.item.products,
            "release_phase": r.item.release_phase,
            "release_date": r.item.release_date,
        }
        for r in results
    ]


@report_agent.tool
async def get_latest_roadmap_additions(ctx: RunContext[ReportDeps], limit: int = 20) -> list[dict]:
    """Get the most recently added or updated roadmap items."""
    items = await list_recent_roadmap_items(ctx.deps.pool, limit=limit)
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


@report_agent.tool
async def list_customers_for_bulk_report(ctx: RunContext[ReportDeps]) -> list[dict]:
    """List all customers to generate bulk reports."""
    customers: list[Customer] = await list_customers(ctx.deps.pool)
    return [c.model_dump(exclude={"created_at", "updated_at"}) for c in customers]


@report_agent.tool
async def get_current_date(ctx: RunContext[ReportDeps]) -> str:
    """Get today's date for the report header."""
    return datetime.now().strftime("%Y-%m-%d")
