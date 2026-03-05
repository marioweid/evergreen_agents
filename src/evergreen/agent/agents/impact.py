"""Impact analysis sub-agent — maps roadmap changes to customers."""


import asyncpg
from pydantic_ai import Agent, RunContext

from evergreen.agent.tools.customer import get_customer, list_customers
from evergreen.agent.tools.roadmap import search_roadmap
from evergreen.pipeline.embedder import embed_query
from evergreen.shared.models import Customer


class ImpactDeps:
    def __init__(self, pool: asyncpg.Pool, openai_api_key: str) -> None:
        self.pool = pool
        self.openai_api_key = openai_api_key


impact_agent: Agent[ImpactDeps, str] = Agent(
    "anthropic:claude-sonnet-4-6",
    deps_type=ImpactDeps,
    system_prompt=(
        "You analyze how Microsoft 365 roadmap changes impact specific customers. "
        "Consider the customer's products, priority, and context. "
        "Rank impact by relevance and provide actionable insights."
    ),
)


@impact_agent.tool
async def get_customer_profile(ctx: RunContext[ImpactDeps], customer_name: str) -> dict | None:
    """Fetch a customer's profile including their M365 products."""
    customer = await get_customer(ctx.deps.pool, customer_name)
    return customer.model_dump() if customer else None


@impact_agent.tool
async def find_relevant_roadmap_changes(
    ctx: RunContext[ImpactDeps], search_query: str, limit: int = 10
) -> list[dict]:
    """Search roadmap for changes relevant to the given query or product set."""
    embedding = await embed_query(search_query, ctx.deps.openai_api_key)
    results = await search_roadmap(ctx.deps.pool, embedding, limit=limit)
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


@impact_agent.tool
async def list_all_customers(ctx: RunContext[ImpactDeps]) -> list[dict]:
    """List all customers for bulk impact analysis."""
    customers: list[Customer] = await list_customers(ctx.deps.pool)
    return [c.model_dump(exclude={"created_at", "updated_at"}) for c in customers]
