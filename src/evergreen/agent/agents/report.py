"""Report generation sub-agent — weekly per-customer impact reports."""


from datetime import datetime

import asyncpg
from pydantic_ai import Agent, RunContext

from evergreen.agent.tools.customer import get_customer, list_customers
from evergreen.agent.tools.roadmap import list_recent_roadmap_items, search_roadmap
from evergreen.pipeline.database import search_customer_documents
from evergreen.pipeline.embedder import embed_query
from evergreen.pipeline.google_drive import write_report_to_drive
from evergreen.shared.models import Customer


class ReportDeps:
    def __init__(self, pool: asyncpg.Pool, openai_api_key: str, token_path: str = "") -> None:
        self.pool = pool
        self.openai_api_key = openai_api_key
        self.token_path = token_path


report_agent: Agent[ReportDeps, str] = Agent(
    "openai:gpt-4o",
    deps_type=ReportDeps,
    system_prompt=(
        "You generate Microsoft 365 impact reports for customers. "
        "Each report should be professional, concise, and actionable. "
        "Structure: Executive Summary, Key Changes (with impact rating), Recommendations. "
        "Always call get_customer_context first to retrieve meeting notes and background on the "
        "customer before deciding which roadmap changes are relevant. "
        "Exclude changes that have no plausible relevance to the customer's products or business. "
        "After composing the report text, call save_report_to_drive to persist it in the "
        "customer's Google Drive folder. If the customer has no drive_folder_id or Drive is not "
        "configured, skip that step and note it in your response."
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
async def get_customer_context(
    ctx: RunContext[ReportDeps], customer_name: str, topic: str
) -> list[dict]:
    """Search meeting notes and other customer documents for relevant context.

    Use this to understand the customer's pain points, goals, and history before
    deciding which roadmap changes are worth including in the report.

    Args:
        customer_name: Name of the customer.
        topic: What to search for, e.g. "Teams adoption challenges" or "SharePoint migration".
    """
    customer = await get_customer(ctx.deps.pool, customer_name)
    if customer is None or customer.id is None:
        return []
    embedding = await embed_query(topic, ctx.deps.openai_api_key)
    results = await search_customer_documents(ctx.deps.pool, customer.id, embedding, limit=5)
    return results


@report_agent.tool
async def get_current_date(ctx: RunContext[ReportDeps]) -> str:
    """Get today's date for the report header."""
    return datetime.now().strftime("%Y-%m-%d")


@report_agent.tool
async def save_report_to_drive(
    ctx: RunContext[ReportDeps], customer_name: str, title: str, content: str
) -> str:
    """Save the generated report as a Google Doc in the customer's Drive folder.

    Args:
        customer_name: Name of the customer (used to look up their Drive folder).
        title: Document title, e.g. "Evergreen Report – Contoso – 2026-03-07".
        content: Full report text to write.

    Returns:
        A message with the Drive file id, or an explanation if saving was skipped.
    """
    if not ctx.deps.token_path:
        return "Drive upload skipped: GOOGLE_OAUTH_TOKEN_PATH is not configured."

    customer = await get_customer(ctx.deps.pool, customer_name)
    if customer is None:
        return f"Drive upload skipped: customer '{customer_name}' not found."
    if not customer.drive_folder_id:
        return f"Drive upload skipped: customer '{customer_name}' has no Drive folder linked."

    file_id = await write_report_to_drive(
        ctx.deps.token_path, customer.drive_folder_id, title, content
    )
    return f"Report saved to Drive (file_id={file_id})."
