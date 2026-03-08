"""Agent service entry point."""

import json
import logging
import os
from collections.abc import AsyncGenerator, AsyncIterator
from contextlib import asynccontextmanager
from datetime import date, datetime
from typing import Literal

import uvicorn
from fastapi import BackgroundTasks, FastAPI, HTTPException, Query, Response
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
    get_roadmap_items_by_ids,
    search_roadmap,
)
from evergreen.pipeline.database import (
    approve_report,
    delete_customer_document,
    delete_report,
    insert_customer_document,
    insert_report,
    list_customer_documents,
    list_customer_reports,
    update_customer_document,
    update_report,
)
from evergreen.pipeline.embedder import embed_query
from evergreen.pipeline.main import run_ingestion
from evergreen.shared.database import close_pool, get_pool
from evergreen.shared.models import (
    Customer,
    CustomerCreate,
    CustomerDocument,
    CustomerDocumentCreate,
    CustomerDocumentUpdate,
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


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class QueryRequest(BaseModel):
    query: str
    history: list[ChatMessage] = []


class QueryResponse(BaseModel):
    answer: str


class GenerateReportRequest(BaseModel):
    item_ids: list[int]


class ReportPreview(BaseModel):
    title: str
    content: str


class SaveReportRequest(BaseModel):
    title: str
    content: str
    status: Literal["draft", "approved"] = "draft"


_STARTUP_MIGRATION = """
DO $$ BEGIN
    -- Drop obsolete Drive columns from customers
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'customers' AND column_name = 'drive_folder_id'
    ) THEN
        ALTER TABLE customers DROP COLUMN drive_folder_id;
    END IF;

    -- Drop obsolete drive_file_id column from reports
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'reports' AND column_name = 'drive_file_id'
    ) THEN
        ALTER TABLE reports DROP COLUMN drive_file_id;
    END IF;

    -- Create reports table if it does not exist yet
    CREATE TABLE IF NOT EXISTS reports (
        id            SERIAL PRIMARY KEY,
        customer_id   INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        title         TEXT NOT NULL,
        content       TEXT NOT NULL,
        status        TEXT NOT NULL DEFAULT 'draft',
        generated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- Add status column to reports if it was created before status was introduced
    ALTER TABLE reports ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'approved';

    -- Rebuild customer_documents without Drive columns if needed
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'customer_documents' AND column_name = 'drive_file_id'
    ) THEN
        DROP TABLE customer_documents;
        CREATE TABLE customer_documents (
            id          SERIAL PRIMARY KEY,
            customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
            title       TEXT NOT NULL,
            content     TEXT NOT NULL,
            embedding   vector(1536),
            created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    ELSE
        -- Ensure updated_at exists on fresh schema variants
        ALTER TABLE customer_documents
            ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
    END IF;

    -- Drop stale Drive index if present
    DROP INDEX IF EXISTS customers_drive_folder_id_idx;
END $$
"""


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    logger.info("Starting Evergreen agent on %s:%d", HOST, PORT)
    pool = await get_pool(DATABASE_URL)
    await pool.execute(_STARTUP_MIGRATION)
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


# --- Pipeline trigger ---

_pipeline: dict = {"running": False, "last_run": None, "error": None}


async def _run_pipeline_task() -> None:
    _pipeline["running"] = True
    _pipeline["error"] = None
    try:
        await run_ingestion()
        _pipeline["last_run"] = datetime.now().isoformat()
    except Exception as exc:  # noqa: BLE001
        _pipeline["error"] = str(exc)
        logger.error("Pipeline run failed: %s", exc)
    finally:
        _pipeline["running"] = False


@app.post("/pipeline/trigger", status_code=202)
async def pipeline_trigger(background_tasks: BackgroundTasks) -> dict:
    if _pipeline["running"]:
        raise HTTPException(status_code=409, detail="Pipeline is already running")
    background_tasks.add_task(_run_pipeline_task)
    return {"status": "started"}


@app.get("/pipeline/status")
async def pipeline_status() -> dict:
    return {
        "running": _pipeline["running"],
        "last_run": _pipeline["last_run"],
        "error": _pipeline["error"],
    }


@app.post("/query", response_model=QueryResponse)
async def query(request: QueryRequest) -> QueryResponse:
    pool = await get_pool(DATABASE_URL)
    deps = OrchestratorDeps(pool=pool, openai_api_key=OPENAI_API_KEY)
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
    deps = OrchestratorDeps(pool=pool, openai_api_key=OPENAI_API_KEY)
    return StreamingResponse(
        _sse_stream(request.query, request.history, deps),
        media_type="text/event-stream",
        headers={"X-Accel-Buffering": "no"},
    )


# --- Curated report generation ---

_PLAIN_LANGUAGE_SYSTEM = (
    "You write Microsoft 365 update summaries for business users who are not technical. "
    "Use plain, friendly language. Explain what each change means in practice — what users "
    "will see or be able to do differently. Avoid jargon. "
    "Write a one-sentence intro, then one short paragraph per change. "
    "Do not use bullet points or section headers."
)


async def _generate_curated_report(
    customer: Customer, items: list[RoadmapItem], api_key: str
) -> str:
    """Call the LLM to write a plain-language summary of the selected roadmap items."""
    client = AsyncOpenAI(api_key=api_key)
    items_text = "\n\n".join(
        f"• {item.title}\n  {item.description or ''}\n"
        f"  Status: {item.status or '—'} | Phase: {item.release_phase or '—'}"
        for item in items
    )
    response = await client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": _PLAIN_LANGUAGE_SYSTEM},
            {
                "role": "user",
                "content": (
                    f"Customer: {customer.name}\n"
                    f"Products they use: {', '.join(customer.products_used)}\n"
                    f"About them: {customer.description}\n\n"
                    f"Roadmap changes to summarise:\n{items_text}"
                ),
            },
        ],
    )
    return response.choices[0].message.content or ""


# --- Roadmap REST endpoints ---


@app.get("/roadmap", response_model=list[RoadmapItem])
async def roadmap_list(
    q: str | None = Query(default=None, description="Semantic search query"),
    product: str | None = Query(default=None, description="Filter by product (substring)"),
    status: str | None = Query(default=None, description="Filter by status (substring)"),
    release_phase: str | None = Query(
        default=None, description="Filter by release phase (substring)"
    ),
    release_date_from: date | None = Query(default=None, description="Earliest release date"),
    release_date_to: date | None = Query(default=None, description="Latest release date"),
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
        date_from=release_date_from,
        date_to=release_date_to,
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


# --- Customer document endpoints ---


@app.get("/customers/{name}/documents", response_model=list[CustomerDocument])
async def customers_documents_list(name: str) -> list[CustomerDocument]:
    pool = await get_pool(DATABASE_URL)
    customer = await get_customer(pool, name)
    if customer is None or customer.id is None:
        raise HTTPException(status_code=404, detail=f"Customer '{name}' not found")
    return await list_customer_documents(pool, customer.id)


@app.post("/customers/{name}/documents", response_model=CustomerDocument, status_code=201)
async def customers_documents_create(name: str, body: CustomerDocumentCreate) -> CustomerDocument:
    pool = await get_pool(DATABASE_URL)
    customer = await get_customer(pool, name)
    if customer is None or customer.id is None:
        raise HTTPException(status_code=404, detail=f"Customer '{name}' not found")
    text = f"Title: {body.title}\n\n{body.content}"
    embedding = await embed_query(text, OPENAI_API_KEY)
    return await insert_customer_document(pool, customer.id, body.title, body.content, embedding)


@app.patch(
    "/customers/{name}/documents/{doc_id}",
    response_model=CustomerDocument,
)
async def customers_documents_update(
    name: str, doc_id: int, body: CustomerDocumentUpdate
) -> CustomerDocument:
    pool = await get_pool(DATABASE_URL)
    customer = await get_customer(pool, name)
    if customer is None or customer.id is None:
        raise HTTPException(status_code=404, detail=f"Customer '{name}' not found")
    embedding: list[float] | None = None
    if body.content is not None:
        title_for_embed = body.title or ""
        text = f"Title: {title_for_embed}\n\n{body.content}"
        embedding = await embed_query(text, OPENAI_API_KEY)
    doc = await update_customer_document(
        pool, doc_id, customer.id, body.title, body.content, embedding
    )
    if doc is None:
        raise HTTPException(status_code=404, detail=f"Document {doc_id} not found")
    return doc


@app.delete("/customers/{name}/documents/{doc_id}", status_code=204)
async def customers_documents_delete(name: str, doc_id: int) -> Response:
    pool = await get_pool(DATABASE_URL)
    customer = await get_customer(pool, name)
    if customer is None or customer.id is None:
        raise HTTPException(status_code=404, detail=f"Customer '{name}' not found")
    deleted = await delete_customer_document(pool, doc_id, customer.id)
    if not deleted:
        raise HTTPException(status_code=404, detail=f"Document {doc_id} not found")
    return Response(status_code=204)


# --- Report endpoints ---


@app.get("/customers/{name}/reports", response_model=list[Report])
async def customers_reports(name: str) -> list[Report]:
    pool = await get_pool(DATABASE_URL)
    customer = await get_customer(pool, name)
    if customer is None or customer.id is None:
        raise HTTPException(status_code=404, detail=f"Customer '{name}' not found")
    return await list_customer_reports(pool, customer.id)


@app.post("/customers/{name}/reports/generate", response_model=ReportPreview)
async def customers_generate_report(name: str, body: GenerateReportRequest) -> ReportPreview:
    pool = await get_pool(DATABASE_URL)
    customer = await get_customer(pool, name)
    if customer is None or customer.id is None:
        raise HTTPException(status_code=404, detail=f"Customer '{name}' not found")
    items = await get_roadmap_items_by_ids(pool, body.item_ids)
    if not items:
        raise HTTPException(status_code=422, detail="None of the provided item IDs exist")
    content = await _generate_curated_report(customer, items, OPENAI_API_KEY)
    title = f"Evergreen Report – {name} – {datetime.now().strftime('%Y-%m-%d')}"
    return ReportPreview(title=title, content=content)


@app.post("/customers/{name}/reports", response_model=Report, status_code=201)
async def customers_save_report(name: str, body: SaveReportRequest) -> Report:
    pool = await get_pool(DATABASE_URL)
    customer = await get_customer(pool, name)
    if customer is None or customer.id is None:
        raise HTTPException(status_code=404, detail=f"Customer '{name}' not found")
    return await insert_report(pool, customer.id, body.title, body.content, body.status)


class UpdateReportRequest(BaseModel):
    title: str | None = None
    content: str | None = None


@app.patch("/reports/{report_id}", response_model=Report)
async def reports_update(report_id: int, body: UpdateReportRequest) -> Report:
    pool = await get_pool(DATABASE_URL)
    report = await update_report(pool, report_id, body.title, body.content)
    if report is None:
        raise HTTPException(status_code=404, detail=f"Report {report_id} not found")
    return report


@app.delete("/reports/{report_id}", status_code=204)
async def reports_delete(report_id: int) -> Response:
    pool = await get_pool(DATABASE_URL)
    deleted = await delete_report(pool, report_id)
    if not deleted:
        raise HTTPException(status_code=404, detail=f"Report {report_id} not found")
    return Response(status_code=204)


@app.patch("/reports/{report_id}/approve", response_model=Report)
async def reports_approve(report_id: int) -> Report:
    pool = await get_pool(DATABASE_URL)
    report = await approve_report(pool, report_id)
    if report is None:
        raise HTTPException(status_code=404, detail=f"Report {report_id} not found")
    return report


@app.get("/customers/{name}/impact", response_model=list[RoadmapSearchResult])
async def customers_impact(
    name: str,
    limit: int = Query(default=10, ge=1, le=50),
    release_date_from: date | None = Query(default=None, description="Earliest release date"),
    release_date_to: date | None = Query(default=None, description="Latest release date"),
) -> list[RoadmapSearchResult]:
    pool = await get_pool(DATABASE_URL)
    customer = await get_customer(pool, name)
    if customer is None:
        raise HTTPException(status_code=404, detail=f"Customer '{name}' not found")
    query_text = " ".join(customer.products_used) or customer.description
    embedding = await embed_query(query_text, OPENAI_API_KEY)
    return await search_roadmap(
        pool, embedding, limit=limit, date_from=release_date_from, date_to=release_date_to
    )


if __name__ == "__main__":
    uvicorn.run("evergreen.agent.main:app", host=HOST, port=PORT, reload=False)
