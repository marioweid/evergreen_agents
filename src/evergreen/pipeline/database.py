"""Write roadmap items and embeddings to PostgreSQL."""


import json
import logging

import asyncpg

from evergreen.shared.models import RoadmapItem

logger = logging.getLogger(__name__)


async def get_existing_documents(pool: asyncpg.Pool) -> dict[int, str]:
    """Return a mapping of item id → stored document text for all existing rows."""
    rows = await pool.fetch("SELECT id, document FROM roadmap_items")
    return {row["id"]: row["document"] for row in rows}


async def upsert_roadmap_items(
    pool: asyncpg.Pool,
    items: list[RoadmapItem],
    embeddings: list[list[float]],
    documents: list[str],
) -> int:
    """Upsert roadmap items with embeddings. Returns number of rows upserted."""
    rows = [
        (
            item.id,
            item.title,
            item.description,
            item.status,
            item.release_date,
            json.dumps(item.products),
            json.dumps(item.platforms),
            json.dumps(item.cloud_instances),
            item.release_phase,
            doc,
            json.dumps(embedding),
        )
        for item, embedding, doc in zip(items, embeddings, documents, strict=False)
    ]

    query = """
        INSERT INTO roadmap_items (
            id, title, description, status, release_date,
            products, platforms, cloud_instances, release_phase,
            document, embedding
        ) VALUES (
            $1, $2, $3, $4, $5,
            $6::jsonb, $7::jsonb, $8::jsonb, $9,
            $10, $11::vector
        )
        ON CONFLICT (id) DO UPDATE SET
            title         = EXCLUDED.title,
            description   = EXCLUDED.description,
            status        = EXCLUDED.status,
            release_date  = EXCLUDED.release_date,
            products      = EXCLUDED.products,
            platforms     = EXCLUDED.platforms,
            cloud_instances = EXCLUDED.cloud_instances,
            release_phase = EXCLUDED.release_phase,
            document      = EXCLUDED.document,
            embedding     = EXCLUDED.embedding,
            updated_at    = CURRENT_TIMESTAMP
    """

    async with pool.acquire() as conn:
        await conn.executemany(query, rows)

    logger.info("Upserted %d roadmap items", len(rows))
    return len(rows)
