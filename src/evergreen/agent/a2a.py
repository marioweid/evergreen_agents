"""A2A protocol server wrapping the Evergreen orchestrator."""


import asyncpg
from a2a.server.agent_execution import AgentExecutor, RequestContext
from a2a.server.apps import A2AStarletteApplication
from a2a.server.events import EventQueue
from a2a.server.request_handlers import DefaultRequestHandler
from a2a.server.tasks import InMemoryTaskStore
from a2a.types import (
    AgentCapabilities,
    AgentCard,
    AgentSkill,
    Part,
    Task,
    TaskState,
    TextPart,
    UnsupportedOperationError,
)

from evergreen.agent.agents.orchestrator import OrchestratorDeps, orchestrator


class EvergreenExecutor(AgentExecutor):
    """Executes queries against the Evergreen orchestrator."""

    def __init__(self, pool: asyncpg.Pool, openai_api_key: str) -> None:
        self._pool = pool
        self._openai_api_key = openai_api_key

    async def execute(self, context: RequestContext, event_queue: EventQueue) -> None:
        user_message = _extract_text(context.message)
        if not user_message:
            await event_queue.enqueue_event(
                _make_task(context.task_id, TaskState.failed, "Empty message received.")
            )
            return

        deps = OrchestratorDeps(pool=self._pool, openai_api_key=self._openai_api_key)
        result = await orchestrator.run(user_message, deps=deps)

        await event_queue.enqueue_event(
            _make_task(context.task_id, TaskState.completed, result.data)
        )

    async def cancel(self, context: RequestContext, event_queue: EventQueue) -> None:
        raise UnsupportedOperationError("Cancellation is not supported.")


def build_agent_card(host: str, port: int) -> AgentCard:
    return AgentCard(
        name="Evergreen Agent",
        description=(
            "Tracks the Microsoft 365 roadmap and analyzes its impact on customers. "
            "Supports roadmap search, customer management, impact analysis, and weekly reports."
        ),
        url=f"http://{host}:{port}/",
        version="0.1.0",
        capabilities=AgentCapabilities(streaming=False),
        skills=[
            AgentSkill(
                id="roadmap_search",
                name="Roadmap Search",
                description="Search and browse Microsoft 365 roadmap items.",
                examples=["What's new in Microsoft Teams?", "Show Teams features in preview"],
            ),
            AgentSkill(
                id="customer_management",
                name="Customer Management",
                description="Create, update, delete, and list customers.",
                examples=["Add customer Contoso using Teams and SharePoint", "List all customers"],
            ),
            AgentSkill(
                id="impact_analysis",
                name="Impact Analysis",
                description="Analyze how roadmap changes affect a specific customer.",
                examples=["What roadmap changes affect Contoso?"],
            ),
            AgentSkill(
                id="weekly_report",
                name="Weekly Report",
                description="Generate a weekly M365 impact report for a customer.",
                examples=["Generate weekly report for Contoso"],
            ),
        ],
    )


def create_a2a_app(
    pool: asyncpg.Pool, openai_api_key: str, host: str, port: int
) -> A2AStarletteApplication:
    """Create the A2A ASGI application."""
    agent_card = build_agent_card(host, port)
    executor = EvergreenExecutor(pool=pool, openai_api_key=openai_api_key)
    handler = DefaultRequestHandler(
        agent_executor=executor,
        task_store=InMemoryTaskStore(),
    )
    return A2AStarletteApplication(agent_card=agent_card, http_handler=handler)


def _extract_text(message: object) -> str:
    """Pull plain text from an A2A message."""
    if not hasattr(message, "parts"):
        return str(message)
    texts = []
    for part in message.parts:
        if isinstance(part, TextPart):
            texts.append(part.text)
        elif isinstance(part.root, TextPart):
            texts.append(part.root.text)
    return " ".join(texts).strip()


def _make_task(task_id: str, state: TaskState, text: str) -> Task:
    part: Part = Part(root=TextPart(text=text))
    return Task(id=task_id, status=state, parts=[part])
