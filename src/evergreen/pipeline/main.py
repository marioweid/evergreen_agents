"""Pipeline entry point — fetches M365 roadmap items on a schedule."""

import asyncio
import logging
import os
from datetime import datetime

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

from evergreen.pipeline.database import (
    get_existing_item_states,
    get_setting,
    record_roadmap_changes,
    upsert_roadmap_items,
)
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

_scheduler: AsyncIOScheduler | None = None
_current_cron: str = PIPELINE_CRON


async def _check_and_reschedule() -> None:
    """Re-read pipeline_cron from DB and reschedule the ingestion job if it changed."""
    global _current_cron
    pool = await get_pool(DATABASE_URL)
    stored = await get_setting(pool, "pipeline_cron")
    new_cron = stored or PIPELINE_CRON
    if new_cron == _current_cron or _scheduler is None:
        return
    try:
        _scheduler.reschedule_job("ingestion", trigger=CronTrigger.from_crontab(new_cron))
        _current_cron = new_cron
        logger.info("Rescheduled ingestion to cron: %s", new_cron)
    except Exception:
        logger.exception("Failed to reschedule ingestion — keeping current cron: %s", _current_cron)


async def run_ingestion() -> None:
    """Fetch roadmap, embed only changed items, and upsert to DB."""
    logger.info("Starting M365 roadmap ingestion")
    pool = await get_pool(DATABASE_URL)

    all_items = await fetch_roadmap_items()
    logger.info("Fetched %d roadmap items", len(all_items))

    existing = await get_existing_item_states(pool)
    sync_id = datetime.now().isoformat()

    change_count = await record_roadmap_changes(pool, all_items, existing, sync_id)
    if change_count:
        logger.info("Recorded %d roadmap changes (sync_id=%s)", change_count, sync_id)

    # Process items that are new or where document, status, or phase changed
    changed_items = []
    changed_docs = []
    for item in all_items:
        doc = build_document(item.title, item.description, item.products)
        old = existing.get(item.id)
        if (
            old is None
            or old["document"] != doc
            or old["status"] != item.status
            or old["release_phase"] != item.release_phase
        ):
            changed_items.append(item)
            changed_docs.append(doc)

    if not changed_items:
        logger.info("Nothing changed — skipping embedding and upsert")
        return

    skipped = len(all_items) - len(changed_items)
    logger.info("%d to embed, %d unchanged skipped", len(changed_items), skipped)

    all_embeddings: list[list[float]] = []
    for start in range(0, len(changed_items), _EMBED_BATCH_SIZE):
        batch_docs = changed_docs[start : start + _EMBED_BATCH_SIZE]
        batch_embeddings = await embed_texts(batch_docs, OPENAI_API_KEY)
        all_embeddings.extend(batch_embeddings)
        logger.info("Embedded batch %d/%d", start + len(batch_docs), len(changed_items))

    count = await upsert_roadmap_items(pool, changed_items, all_embeddings, changed_docs)
    logger.info("Ingestion complete — %d items upserted", count)


async def main() -> None:
    global _scheduler, _current_cron

    pool = await get_pool(DATABASE_URL)
    stored_cron = await get_setting(pool, "pipeline_cron")
    effective_cron = stored_cron or PIPELINE_CRON
    _current_cron = effective_cron

    _scheduler = AsyncIOScheduler()
    _scheduler.add_job(
        run_ingestion,
        CronTrigger.from_crontab(effective_cron),
        id="ingestion",
        max_instances=1,
        coalesce=True,
    )
    _scheduler.add_job(
        _check_and_reschedule,
        "interval",
        minutes=1,
        id="cron_check",
    )
    _scheduler.start()
    logger.info("Scheduler started — roadmap: %s", effective_cron)

    if RUN_ON_STARTUP:
        await run_ingestion()

    try:
        await asyncio.Event().wait()
    finally:
        if _scheduler is not None:
            _scheduler.shutdown()
        await close_pool()


if __name__ == "__main__":
    asyncio.run(main())
