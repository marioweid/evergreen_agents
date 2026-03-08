"""Agent service entry point."""

import json
import logging
import os
from collections.abc import AsyncGenerator, AsyncIterator
from contextlib import asynccontextmanager
from typing import Literal

import uvicorn
from fastapi import FastAPI, HTTPException, Query, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from openai import AsyncOpenAI
from pydantic import BaseModel
from pydantic_ai.messages import ModelMessage, ModelRequest, ModelResponse, TextPart, UserPromptPart

from evergreen.agent.agents.orchestrator import OrchestratorDeps, orchestrator
from evergreen.agent.tools.customer import (
    create_customer,
    delete_customer,
    get_customer,
    list_customers,
    update_customer,
)
from evergreen.agent.tools.roadmap import (
    browse_roadmap,
    get_roadmap_filters,
    get_roadmap_item,
    search_roadmap,
)
from evergreen.pipeline.database import list_customer_reports
from evergreen.pipeline.embedder import embed_query
from evergreen.shared.database import close_pool, get_pool
from evergreen.shared.models import (
    Customer,
    CustomerCreate,
    CustomerUpdate,
    Report,
    RoadmapFilters,
    RoadmapItem,
    RoadmapSearchResult,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
logger = logging.getLogger(__name__)

DATABASE_URL = os.environ["DATABASE_URL"]
OPENAI_API_KEY = os.environ["OPENAI_API_KEY"]
HOST = os.getenv("AGENT_HOST", "0.0.0.0")
PORT = int(os.getenv("AGENT_PORT", "8000"))
GOOGLE_OAUTH_TOKEN_PATH = os.getenv("GOOGLE_OAUTH_TOKEN_PATH", "")


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class QueryRequest(BaseModel):
    query: str
    history: list[ChatMessage] = []


class QueryResponse(BaseModel):
    answer: str


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    logger.info("Starting Evergreen agent on %s:%d", HOST, PORT)
    await get_pool(DATABASE_URL)
    yield
    await close_pool()
    logger.info("Evergreen agent shut down")


app = FastAPI(title="Evergreen Agent", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,  # type: ignore[invalid-argument-type]  # starlette ParamSpec limitation
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health() -> dict:
    return {"status": "ok"}


@app.post("/query", response_model=QueryResponse)
async def query(request: QueryRequest) -> QueryResponse:
    pool = await get_pool(DATABASE_URL)
    deps = OrchestratorDeps(
        pool=pool, openai_api_key=OPENAI_API_KEY, token_path=GOOGLE_OAUTH_TOKEN_PATH
    )
    result = await orchestrator.run(request.query, deps=deps)
    return QueryResponse(answer=result.output)


# --- Streaming query ---

_REWRITE_SYSTEM = (
    "Rewrite the follow-up question as a fully self-contained question that can be "
    "understood without any prior context. Incorporate relevant details from the "
    "conversation history (e.g. entity names, topics) directly into the question. "
    "Output only the rewritten question, nothing else."
)


async def _rewrite_query(query: str, history: list[ChatMessage], api_key: str) -> str:
    """Rewrite a follow-up question into a standalone question using the chat history."""
    if not history:
        return query
    client = AsyncOpenAI(api_key=api_key)
    conv = "\n".join(f"{m.role}: {m.content}" for m in history)
    response = await client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {"role": "system", "content": _REWRITE_SYSTEM},
            {"role": "user", "content": f"Conversation:\n{conv}\n\nFollow-up: {query}"},
        ],
        max_tokens=200,
        temperature=0,
    )
    rewritten = (response.choices[0].message.content or query).strip()
    logger.info("Query rewritten: %r → %r", query, rewritten)
    return rewritten


def _to_model_messages(history: list[ChatMessage]) -> list[ModelMessage]:
    messages: list[ModelMessage] = []
    for msg in history:
        if msg.role == "user":
            messages.append(ModelRequest(parts=[UserPromptPart(content=msg.content)]))
        else:
            messages.append(ModelResponse(parts=[TextPart(content=msg.content)]))
    return messages


async def _sse_stream(
    query: str, history: list[ChatMessage], deps: OrchestratorDeps
) -> AsyncGenerator[str]:
    rewritten = await _rewrite_query(query, history, deps.openai_api_key)
    message_history = _to_model_messages(history)
    full_response = ""
    async with orchestrator.run_stream(
        rewritten, deps=deps, message_history=message_history
    ) as result:
        async for chunk in result.stream_text(delta=True):
            full_response += chunk
            yield f"data: {json.dumps({'delta': chunk})}\n\n"
    updated_history = [
        *[m.model_dump() for m in history],
        {"role": "user", "content": query},
        {"role": "assistant", "content": full_response},
    ]
    yield f"data: {json.dumps({'history': updated_history})}\n\n"
    yield "data: [DONE]\n\n"


@app.post("/query/stream")
async def query_stream(request: QueryRequest) -> StreamingResponse:
    pool = await get_pool(DATABASE_URL)
    deps = OrchestratorDeps(
        pool=pool, openai_api_key=OPENAI_API_KEY, token_path=GOOGLE_OAUTH_TOKEN_PATH
    )
    return StreamingResponse(
        _sse_stream(request.query, request.history, deps),
        media_type="text/event-stream",
        headers={"X-Accel-Buffering": "no"},
    )


# --- Roadmap REST endpoints ---


@app.get("/roadmap", response_model=list[RoadmapItem])
async def roadmap_list(
    q: str | None = Query(default=None, description="Semantic search query"),
    product: str | None = Query(default=None, description="Filter by product (substring)"),
    status: str | None = Query(default=None, description="Filter by status (substring)"),
    release_phase: str | None = Query(
        default=None, description="Filter by release phase (substring)"
    ),
    limit: int = Query(default=50, ge=1, le=200),
) -> list[RoadmapItem]:
    pool = await get_pool(DATABASE_URL)
    embedding: list[float] | None = None
    if q:
        embedding = await embed_query(q, OPENAI_API_KEY)
    return await browse_roadmap(
        pool,
        embedding=embedding,
        product=product,
        status=status,
        release_phase=release_phase,
        limit=limit,
    )


@app.get("/roadmap/filters", response_model=RoadmapFilters)
async def roadmap_filters() -> RoadmapFilters:
    pool = await get_pool(DATABASE_URL)
    return await get_roadmap_filters(pool)


@app.get("/roadmap/{item_id}", response_model=RoadmapItem)
async def roadmap_get(item_id: int) -> RoadmapItem:
    pool = await get_pool(DATABASE_URL)
    item = await get_roadmap_item(pool, item_id)
    if item is None:
        raise HTTPException(status_code=404, detail=f"Roadmap item {item_id} not found")
    return item


# --- Customer REST endpoints ---


@app.get("/customers", response_model=list[Customer])
async def customers_list() -> list[Customer]:
    pool = await get_pool(DATABASE_URL)
    return await list_customers(pool)


@app.post("/customers", response_model=Customer, status_code=201)
async def customers_create(body: CustomerCreate) -> Customer:
    pool = await get_pool(DATABASE_URL)
    return await create_customer(pool, body)


@app.get("/customers/{name}", response_model=Customer)
async def customers_get(name: str) -> Customer:
    pool = await get_pool(DATABASE_URL)
    customer = await get_customer(pool, name)
    if customer is None:
        raise HTTPException(status_code=404, detail=f"Customer '{name}' not found")
    return customer


@app.patch("/customers/{name}", response_model=Customer)
async def customers_update(name: str, body: CustomerUpdate) -> Customer:
    pool = await get_pool(DATABASE_URL)
    customer = await update_customer(pool, name, body)
    if customer is None:
        raise HTTPException(status_code=404, detail=f"Customer '{name}' not found")
    return customer


@app.delete("/customers/{name}", status_code=204)
async def customers_delete(name: str) -> Response:
    pool = await get_pool(DATABASE_URL)
    deleted = await delete_customer(pool, name)
    if not deleted:
        raise HTTPException(status_code=404, detail=f"Customer '{name}' not found")
    return Response(status_code=204)


@app.get("/customers/{name}/reports", response_model=list[Report])
async def customers_reports(name: str) -> list[Report]:
    pool = await get_pool(DATABASE_URL)
    customer = await get_customer(pool, name)
    if customer is None or customer.id is None:
        raise HTTPException(status_code=404, detail=f"Customer '{name}' not found")
    return await list_customer_reports(pool, customer.id)


@app.get("/customers/{name}/impact", response_model=list[RoadmapSearchResult])
async def customers_impact(
    name: str,
    limit: int = Query(default=10, ge=1, le=50),
) -> list[RoadmapSearchResult]:
    pool = await get_pool(DATABASE_URL)
    customer = await get_customer(pool, name)
    if customer is None:
        raise HTTPException(status_code=404, detail=f"Customer '{name}' not found")
    query_text = " ".join(customer.products_used) or customer.description
    embedding = await embed_query(query_text, OPENAI_API_KEY)
    return await search_roadmap(pool, embedding, limit=limit)


if __name__ == "__main__":
    uvicorn.run("evergreen.agent.main:app", host=HOST, port=PORT, reload=False)
