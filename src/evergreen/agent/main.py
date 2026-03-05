"""Agent service entry point — serves the A2A protocol over HTTP."""

from __future__ import annotations

import logging
import os
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from evergreen.agent.a2a import create_a2a_app
from evergreen.shared.database import close_pool, get_pool

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
logger = logging.getLogger(__name__)

DATABASE_URL = os.environ["DATABASE_URL"]
OPENAI_API_KEY = os.environ["OPENAI_API_KEY"]
HOST = os.getenv("AGENT_HOST", "0.0.0.0")
PORT = int(os.getenv("AGENT_PORT", "8000"))
PUBLIC_HOST = os.getenv("PUBLIC_HOST", "localhost")


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


async def _build_a2a() -> None:
    """Mount the A2A app after the pool is ready."""
    pool = await get_pool(DATABASE_URL)
    a2a = create_a2a_app(pool=pool, openai_api_key=OPENAI_API_KEY, host=PUBLIC_HOST, port=PORT)
    app.mount("/", a2a)


# Mount A2A at startup — pool will be ready since lifespan runs first
app.add_event_handler("startup", _build_a2a)


if __name__ == "__main__":
    uvicorn.run("evergreen.agent.main:app", host=HOST, port=PORT, reload=False)
