"""Customer management sub-agent."""


import asyncpg
from pydantic_ai import Agent, RunContext

from evergreen.agent.tools.customer import (
    create_customer,
    delete_customer,
    get_customer,
    list_customers,
    update_customer,
)
from evergreen.shared.models import CustomerCreate, CustomerUpdate


class CustomerDeps:
    def __init__(self, pool: asyncpg.Pool) -> None:
        self.pool = pool


customer_agent: Agent[CustomerDeps, str] = Agent(
    "openai:gpt-4o",
    deps_type=CustomerDeps,
    system_prompt=(
        "You manage a database of customers and the Microsoft 365 products they use. "
        "You can list, create, update, and delete customers. "
        "Always confirm destructive operations before executing them."
    ),
)


@customer_agent.tool
async def get_all_customers(ctx: RunContext[CustomerDeps]) -> list[dict]:
    """List all customers in the database."""
    customers = await list_customers(ctx.deps.pool)
    return [c.model_dump(exclude={"created_at", "updated_at"}) for c in customers]


@customer_agent.tool
async def find_customer(ctx: RunContext[CustomerDeps], name: str) -> dict | None:
    """Look up a customer by name."""
    customer = await get_customer(ctx.deps.pool, name)
    return customer.model_dump() if customer else None


@customer_agent.tool
async def add_customer(
    ctx: RunContext[CustomerDeps],
    name: str,
    description: str,
    products_used: list[str],
    priority: str = "medium",
    notes: str | None = None,
) -> dict:
    """Create a new customer record."""
    data = CustomerCreate(
        name=name,
        description=description,
        products_used=products_used,
        priority=priority,  # type: ignore[arg-type]
        notes=notes,
    )
    customer = await create_customer(ctx.deps.pool, data)
    return customer.model_dump()


@customer_agent.tool
async def modify_customer(
    ctx: RunContext[CustomerDeps],
    name: str,
    description: str | None = None,
    products_used: list[str] | None = None,
    priority: str | None = None,
    notes: str | None = None,
) -> dict | None:
    """Update an existing customer's fields."""
    data = CustomerUpdate(
        description=description,
        products_used=products_used,
        priority=priority,  # type: ignore[arg-type]
        notes=notes,
    )
    customer = await update_customer(ctx.deps.pool, name, data)
    return customer.model_dump() if customer else None


@customer_agent.tool
async def remove_customer(ctx: RunContext[CustomerDeps], name: str) -> bool:
    """Delete a customer by name. Returns True if deleted."""
    return await delete_customer(ctx.deps.pool, name)
