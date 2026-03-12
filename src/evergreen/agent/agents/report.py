"""Report generation sub-agent — per-customer impact reports structured for customer meetings."""

from datetime import datetime

import asyncpg
from pydantic_ai import Agent, RunContext

from evergreen.agent.tools.customer import get_customer, list_customers
from evergreen.agent.tools.roadmap import (
    get_roadmap_items_by_ids,
    list_recent_roadmap_items,
    search_roadmap,
)
from evergreen.pipeline.database import (
    insert_report,
    list_roadmap_changes_in_period,
    search_customer_documents,
)
from evergreen.pipeline.embedder import embed_query
from evergreen.shared.models import Customer


class ReportDeps:
    def __init__(self, pool: asyncpg.Pool, openai_api_key: str) -> None:
        self.pool = pool
        self.openai_api_key = openai_api_key


_SYSTEM_PROMPT = """
You generate Microsoft 365 update reports for Customer Success Managers preparing for customer meetings.

## Your goal: completeness first, not a short summary

The CSM typically has two 1-hour meetings with the customer. Your report must cover everything
worth discussing across both sessions. It is always better to include a change than to miss it.
If you are unsure whether something is relevant, include it with a brief note explaining why it
might matter.

## When a date range or period is specified

ALWAYS call get_all_changes_in_period first. This returns every single change recorded in that
period with no cutoff. You must evaluate EVERY item returned against the customer profile.
Do not skip items because they seem minor or unfamiliar — let the CSM decide.

Also call get_relevant_changes_for_report with the customer's products to catch items that may
not have been tracked as explicit changes but are relevant to their setup.

## Evaluating relevance

Fetch the customer profile first with fetch_customer_for_report.
Also call get_customer_context to understand their history and pain points.

For each change, ask: could this affect this customer's users, admins, or rollout plans?
If yes, include it. When in doubt, include it.

Exclude only items that are completely unrelated to any product the customer uses or is
considering — and even then, if they are marked high-priority or GA, mention them briefly.

## Report structure (two-meeting format)

Structure the report so the CSM can run two sessions:

### Meeting 1 — Strategic overview (~60 min)
Focus on bigger items: new features rolling out to GA, significant changes to products they rely
on, anything that changes how their users work day-to-day. Include enough detail for a demo or
a meaningful discussion.

### Meeting 2 — Operational details (~60 min)
Focus on timelines, admin changes, things IT needs to act on, items coming in the next 30–60
days, and follow-up actions from the previous meeting.

## Formatting each change

For every included item write:
- What it is (one plain sentence, no jargon)
- What it means for this customer specifically (how their users or IT will notice it)
- Status and expected timeline
- A suggested talking point or question for the meeting

## Tone

Write for a business reader, not a technical one. Avoid acronyms without explanation.
Use concrete examples ("users will see a new button in Teams that...").

## After writing the report

Call save_report to persist it as a draft.
""".strip()


report_agent: Agent[ReportDeps, str] = Agent(
    "openai:gpt-4o",
    deps_type=ReportDeps,
    system_prompt=_SYSTEM_PROMPT,
)


@report_agent.tool
async def fetch_customer_for_report(ctx: RunContext[ReportDeps], customer_name: str) -> dict | None:
    """Get customer profile — call this first before anything else."""
    customer = await get_customer(ctx.deps.pool, customer_name)
    return customer.model_dump() if customer else None


@report_agent.tool
async def get_all_changes_in_period(
    ctx: RunContext[ReportDeps],
    date_from: str,
    date_to: str | None = None,
) -> list[dict]:
    """Get EVERY roadmap change recorded in a specific period — no similarity cutoff, no limit.

    Use this whenever the user specifies a date range (e.g. "last 2 weeks", "March", "Q1").
    Returns all changes with full item details so nothing is missed.

    Args:
        date_from: Start of the period as ISO date string, e.g. "2026-03-01".
        date_to: End of the period, e.g. "2026-03-31". Omit for open-ended (up to now).
    """
    changes = await list_roadmap_changes_in_period(ctx.deps.pool, date_from, date_to)

    # Group changes by item so each item appears once with all its changes listed
    seen: dict[int, dict] = {}
    for c in changes:
        if c.item_id not in seen:
            seen[c.item_id] = {"item_id": c.item_id, "item_title": c.item_title, "changes": []}
        seen[c.item_id]["changes"].append(
            {
                "change_type": c.change_type,
                "old_value": c.old_value,
                "new_value": c.new_value,
                "detected_at": c.sync_id,
            }
        )

    if not seen:
        return []

    items = await get_roadmap_items_by_ids(ctx.deps.pool, list(seen.keys()))
    result = []
    for item in items:
        entry = seen.get(item.id, {})
        result.append(
            {
                "id": item.id,
                "title": item.title,
                "description": item.description,
                "status": item.status,
                "products": item.products,
                "release_phase": item.release_phase,
                "release_date": item.release_date,
                "changes_in_period": entry.get("changes", []),
            }
        )
    return result


@report_agent.tool
async def get_relevant_changes_for_report(
    ctx: RunContext[ReportDeps], products_query: str, limit: int = 60
) -> list[dict]:
    """Semantic search for roadmap items relevant to the customer's products.

    Use this in addition to get_all_changes_in_period to catch items the customer cares about
    that may not have explicit change records. Default limit is 60 — raise it if needed.
    """
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
            "similarity": round(r.similarity, 3),
        }
        for r in results
    ]


@report_agent.tool
async def get_latest_roadmap_additions(ctx: RunContext[ReportDeps], limit: int = 50) -> list[dict]:
    """Get the most recently added or updated roadmap items (up to limit, default 50)."""
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
    """Search meeting notes and documents to understand the customer's history and priorities.

    Args:
        customer_name: Name of the customer.
        topic: What to search for, e.g. "Teams adoption" or "SharePoint migration".
    """
    customer = await get_customer(ctx.deps.pool, customer_name)
    if customer is None or customer.id is None:
        return []
    embedding = await embed_query(topic, ctx.deps.openai_api_key)
    results = await search_customer_documents(ctx.deps.pool, customer.id, embedding, limit=8)
    return results


@report_agent.tool
async def get_current_date(ctx: RunContext[ReportDeps]) -> str:
    """Get today's date for the report header."""
    return datetime.now().strftime("%Y-%m-%d")


@report_agent.tool
async def save_report(
    ctx: RunContext[ReportDeps], customer_name: str, title: str, content: str
) -> str:
    """Save the generated report to the database as a draft.

    Args:
        customer_name: Name of the customer.
        title: Document title, e.g. "Evergreen Report – Contoso – March 2026".
        content: Full report text.
    """
    customer = await get_customer(ctx.deps.pool, customer_name)
    if customer is None or customer.id is None:
        return f"Save failed: customer '{customer_name}' not found."

    report = await insert_report(ctx.deps.pool, customer.id, title, content)
    return (
        f"Report saved as draft (id={report.id}). "
        f"The customer can review and approve it in the Reports tab."
    )
