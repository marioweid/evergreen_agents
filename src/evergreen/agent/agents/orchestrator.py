"""Root orchestrator — routes queries to the appropriate sub-agent."""

import asyncpg
from pydantic_ai import Agent, RunContext

from evergreen.agent.agents.customer import CustomerDeps, customer_agent
from evergreen.agent.agents.impact import ImpactDeps, impact_agent
from evergreen.agent.agents.report import ReportDeps, report_agent
from evergreen.agent.agents.roadmap import RoadmapDeps, roadmap_agent


class OrchestratorDeps:
    def __init__(self, pool: asyncpg.Pool, openai_api_key: str, token_path: str = "") -> None:
        self.pool = pool
        self.openai_api_key = openai_api_key
        self.token_path = token_path


orchestrator: Agent[OrchestratorDeps, str] = Agent(
    "openai:gpt-4o",
    deps_type=OrchestratorDeps,
    system_prompt=(
        "You are the Evergreen assistant — an intelligent system for tracking Microsoft 365 "
        "roadmap changes and their impact on customers.\n\n"
        "You have access to four specialized agents:\n"
        "- roadmap_agent: search and browse M365 roadmap items\n"
        "- customer_agent: manage customer records (create, update, delete, list)\n"
        "- impact_agent: analyze how roadmap changes affect a specific customer\n"
        "- report_agent: generate weekly impact reports per customer\n\n"
        "Route each request to the most appropriate agent. Combine results from multiple "
        "agents when needed. Always be concise and actionable."
    ),
)


@orchestrator.tool
async def query_roadmap(ctx: RunContext[OrchestratorDeps], query: str) -> str:
    """Delegate a roadmap search or question to the roadmap agent."""
    deps = RoadmapDeps(pool=ctx.deps.pool, openai_api_key=ctx.deps.openai_api_key)
    result = await roadmap_agent.run(query, deps=deps)
    return result.output


@orchestrator.tool
async def manage_customers(ctx: RunContext[OrchestratorDeps], instruction: str) -> str:
    """Delegate customer management tasks (list/create/update/delete) to the customer agent."""
    deps = CustomerDeps(pool=ctx.deps.pool)
    result = await customer_agent.run(instruction, deps=deps)
    return result.output


@orchestrator.tool
async def analyze_impact(ctx: RunContext[OrchestratorDeps], instruction: str) -> str:
    """Delegate impact analysis for a customer to the impact agent."""
    deps = ImpactDeps(pool=ctx.deps.pool, openai_api_key=ctx.deps.openai_api_key)
    result = await impact_agent.run(instruction, deps=deps)
    return result.output


@orchestrator.tool
async def generate_report(ctx: RunContext[OrchestratorDeps], instruction: str) -> str:
    """Delegate report generation to the report agent."""
    deps = ReportDeps(
        pool=ctx.deps.pool,
        openai_api_key=ctx.deps.openai_api_key,
        token_path=ctx.deps.token_path,
    )
    result = await report_agent.run(instruction, deps=deps)
    return result.output
