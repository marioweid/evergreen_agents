"""Pipeline entry point — fetches M365 roadmap items on a schedule."""

from __future__ import annotations

import asyncio
import logging
import os

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

from evergreen.pipeline.database import upsert_roadmap_items
from evergreen.pipeline.embedder import build_document, embed_texts
from evergreen.pipeline.fetcher import fetch_roadmap_items
from evergreen.shared.database import close_pool, get_pool

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
logger = logging.getLogger(__name__)

DATABASE_URL = os.environ["DATABASE_URL"]
OPENAI_API_KEY = os.environ["OPENAI_API_KEY"]
# Cron expression, default: every Sunday at 02:00
PIPELINE_CRON = os.getenv("PIPELINE_CRON", "0 2 * * 0")
# Run once immediately on startup before waiting for the schedule
RUN_ON_STARTUP = os.getenv("RUN_ON_STARTUP", "true").lower() == "true"

_EMBED_BATCH_SIZE = 100


async def run_ingestion() -> None:
    """Fetch roadmap, embed, and upsert to DB."""
    logger.info("Starting M365 roadmap ingestion")
    pool = await get_pool(DATABASE_URL)

    items = await fetch_roadmap_items()
    logger.info("Fetched %d roadmap items", len(items))

    documents = [build_document(i.title, i.description, i.products) for i in items]

    all_embeddings: list[list[float]] = []
    for start in range(0, len(items), _EMBED_BATCH_SIZE):
        batch_docs = documents[start : start + _EMBED_BATCH_SIZE]
        batch_embeddings = await embed_texts(batch_docs, OPENAI_API_KEY)
        all_embeddings.extend(batch_embeddings)
        logger.info("Embedded batch %d/%d", start + len(batch_docs), len(items))

    count = await upsert_roadmap_items(pool, items, all_embeddings, documents)
    logger.info("Ingestion complete — %d items upserted", count)


async def main() -> None:
    scheduler = AsyncIOScheduler()
    trigger = CronTrigger.from_crontab(PIPELINE_CRON)
    scheduler.add_job(run_ingestion, trigger, id="ingestion", max_instances=1, coalesce=True)
    scheduler.start()
    logger.info("Scheduler started with cron: %s", PIPELINE_CRON)

    if RUN_ON_STARTUP:
        await run_ingestion()

    try:
        await asyncio.Event().wait()
    finally:
        scheduler.shutdown()
        await close_pool()


if __name__ == "__main__":
    asyncio.run(main())
