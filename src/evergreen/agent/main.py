"""Agent service entry point."""

import logging
import os
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from evergreen.agent.agents.orchestrator import OrchestratorDeps, orchestrator
from evergreen.agent.tools.customer import (
    create_customer,
    delete_customer,
    get_customer,
    list_customers,
    update_customer,
)
from evergreen.shared.database import close_pool, get_pool
from evergreen.shared.models import Customer, CustomerCreate, CustomerUpdate

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
logger = logging.getLogger(__name__)

DATABASE_URL = os.environ["DATABASE_URL"]
OPENAI_API_KEY = os.environ["OPENAI_API_KEY"]
HOST = os.getenv("AGENT_HOST", "0.0.0.0")
PORT = int(os.getenv("AGENT_PORT", "8000"))
GOOGLE_OAUTH_TOKEN_PATH = os.getenv("GOOGLE_OAUTH_TOKEN_PATH", "")


class QueryRequest(BaseModel):
    query: str


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


if __name__ == "__main__":
    uvicorn.run("evergreen.agent.main:app", host=HOST, port=PORT, reload=False)
