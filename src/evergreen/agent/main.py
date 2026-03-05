"""Agent service entry point."""

import logging
import os
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from evergreen.agent.agents.orchestrator import OrchestratorDeps, orchestrator
from evergreen.shared.database import close_pool, get_pool

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
logger = logging.getLogger(__name__)

DATABASE_URL = os.environ["DATABASE_URL"]
OPENAI_API_KEY = os.environ["OPENAI_API_KEY"]
HOST = os.getenv("AGENT_HOST", "0.0.0.0")
PORT = int(os.getenv("AGENT_PORT", "8000"))


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
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


@app.get("/health")
async def health() -> dict:
    return {"status": "ok"}


@app.post("/query", response_model=QueryResponse)
async def query(request: QueryRequest) -> QueryResponse:
    pool = await get_pool(DATABASE_URL)
    deps = OrchestratorDeps(pool=pool, openai_api_key=OPENAI_API_KEY)
    result = await orchestrator.run(request.query, deps=deps)
    return QueryResponse(answer=result.output)


if __name__ == "__main__":
    uvicorn.run("evergreen.agent.main:app", host=HOST, port=PORT, reload=False)
