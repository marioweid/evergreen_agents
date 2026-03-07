"""Pipeline entry point — fetches M365 roadmap items on a schedule."""

import asyncio
import logging
import os

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

from evergreen.pipeline.database import (
    get_customer_doc_modified_times,
    get_existing_documents,
    upsert_customer_documents,
    upsert_customer_from_drive,
    upsert_roadmap_items,
)
from evergreen.pipeline.embedder import build_document, embed_texts
from evergreen.pipeline.fetcher import fetch_roadmap_items
from evergreen.pipeline.google_drive import (
    BattleCard,
    fetch_customer_folders,
    parse_battle_card,
    write_report_to_drive,
)
from evergreen.shared.database import close_pool, get_pool

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
logger = logging.getLogger(__name__)

DATABASE_URL = os.environ["DATABASE_URL"]
OPENAI_API_KEY = os.environ["OPENAI_API_KEY"]
# Cron expression, default: every Sunday at 02:00
PIPELINE_CRON = os.getenv("PIPELINE_CRON", "0 2 * * 0")
# Drive sync cron, default: every day at 03:00
DRIVE_SYNC_CRON = os.getenv("DRIVE_SYNC_CRON", "0 3 * * *")
# Run once immediately on startup before waiting for the schedule
RUN_ON_STARTUP = os.getenv("RUN_ON_STARTUP", "true").lower() == "true"
# Google Drive settings (optional — Drive sync is skipped if not configured)
GOOGLE_SA_KEY_PATH = os.getenv("GOOGLE_SA_KEY_PATH", "sa_drive_agent.json")
GOOGLE_DRIVE_CUSTOMERS_FOLDER_ID = os.getenv("GOOGLE_DRIVE_CUSTOMER_FOLDER_ID", "")
# OAuth token for writing reports back to Drive (optional — skipped if not set)
GOOGLE_OAUTH_TOKEN_PATH = os.getenv("GOOGLE_OAUTH_TOKEN_PATH", "")

_EMBED_BATCH_SIZE = 100


async def run_ingestion() -> None:
    """Fetch roadmap, embed only changed items, and upsert to DB."""
    logger.info("Starting M365 roadmap ingestion")
    pool = await get_pool(DATABASE_URL)

    all_items = await fetch_roadmap_items()
    logger.info("Fetched %d roadmap items", len(all_items))

    existing_docs = await get_existing_documents(pool)

    # Only process items that are new or whose content has changed
    changed_items = []
    changed_docs = []
    for item in all_items:
        doc = build_document(item.title, item.description, item.products)
        if existing_docs.get(item.id) != doc:
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


async def run_drive_sync() -> None:
    """Sync customer data from Google Drive: upsert customers and embed their documents."""
    if not GOOGLE_DRIVE_CUSTOMERS_FOLDER_ID:
        logger.info("GOOGLE_DRIVE_CUSTOMERS_FOLDER_ID not set — skipping Drive sync")
        return

    logger.info("Starting Google Drive customer sync")
    pool = await get_pool(DATABASE_URL)

    folders = await fetch_customer_folders(GOOGLE_SA_KEY_PATH, GOOGLE_DRIVE_CUSTOMERS_FOLDER_ID)
    logger.info("Found %d customer folders in Drive", len(folders))

    for folder in folders:
        parsed = (
            parse_battle_card(folder.battle_card.content)
            if folder.battle_card
            else BattleCard(products_used=[], priority="medium", description="", notes=None)
        )
        customer_id = await upsert_customer_from_drive(
            pool,
            folder_id=folder.folder_id,
            name=folder.name,
            description=parsed.description,
            products_used=parsed.products_used,
            priority=parsed.priority,
            notes=parsed.notes,
        )
        logger.info("Upserted customer '%s' (id=%d)", folder.name, customer_id)

        if not folder.documents:
            continue

        stored_times = await get_customer_doc_modified_times(pool, customer_id)
        changed_docs = [
            doc for doc in folder.documents if stored_times.get(doc.file_id) != doc.modified_at
        ]

        if not changed_docs:
            logger.info("No changed documents for '%s'", folder.name)
            continue

        logger.info("%d changed documents to embed for '%s'", len(changed_docs), folder.name)
        texts = [f"Title: {d.title}\n\n{d.content}" for d in changed_docs]
        embeddings = await embed_texts(texts, OPENAI_API_KEY)

        doc_rows = [
            (d.file_id, d.title, d.content, d.modified_at, emb)
            for d, emb in zip(changed_docs, embeddings, strict=True)
        ]
        await upsert_customer_documents(pool, customer_id, doc_rows)

    logger.info("Drive sync complete")


async def write_customer_report_to_drive(
    customer_name: str, folder_id: str, title: str, content: str
) -> None:
    """Write a generated report to the customer's Drive folder using OAuth credentials."""
    if not GOOGLE_OAUTH_TOKEN_PATH:
        logger.info("GOOGLE_OAUTH_TOKEN_PATH not set — skipping Drive report upload")
        return
    file_id = await write_report_to_drive(GOOGLE_OAUTH_TOKEN_PATH, folder_id, title, content)
    logger.info("Uploaded report '%s' for '%s' (file_id=%s)", title, customer_name, file_id)


async def main() -> None:
    scheduler = AsyncIOScheduler()
    scheduler.add_job(
        run_ingestion,
        CronTrigger.from_crontab(PIPELINE_CRON),
        id="ingestion",
        max_instances=1,
        coalesce=True,
    )
    scheduler.add_job(
        run_drive_sync,
        CronTrigger.from_crontab(DRIVE_SYNC_CRON),
        id="drive_sync",
        max_instances=1,
        coalesce=True,
    )
    scheduler.start()
    logger.info("Scheduler started — roadmap: %s, drive: %s", PIPELINE_CRON, DRIVE_SYNC_CRON)

    if RUN_ON_STARTUP:
        await run_ingestion()
        await run_drive_sync()

    try:
        await asyncio.Event().wait()
    finally:
        scheduler.shutdown()
        await close_pool()


if __name__ == "__main__":
    asyncio.run(main())
