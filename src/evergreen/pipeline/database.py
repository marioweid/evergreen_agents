"""Write roadmap items, customer records, and embeddings to PostgreSQL."""

import json
import logging

import asyncpg

from evergreen.shared.models import Report, RoadmapItem

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


async def upsert_customer_from_drive(
    pool: asyncpg.Pool,
    folder_id: str,
    name: str,
    description: str,
    products_used: list[str],
    priority: str,
    notes: str | None,
) -> int:
    """Upsert a customer sourced from Google Drive. Returns the customer id."""
    row = await pool.fetchrow(
        """
        INSERT INTO customers (name, drive_folder_id, description, products_used, priority, notes)
        VALUES ($1, $2, $3, $4::jsonb, $5, $6)
        ON CONFLICT (drive_folder_id) WHERE drive_folder_id IS NOT NULL DO UPDATE SET
            name          = EXCLUDED.name,
            description   = EXCLUDED.description,
            products_used = EXCLUDED.products_used,
            priority      = EXCLUDED.priority,
            notes         = EXCLUDED.notes,
            updated_at    = CURRENT_TIMESTAMP
        WHERE
            customers.description   IS DISTINCT FROM EXCLUDED.description OR
            customers.products_used IS DISTINCT FROM EXCLUDED.products_used OR
            customers.priority      IS DISTINCT FROM EXCLUDED.priority      OR
            customers.notes         IS DISTINCT FROM EXCLUDED.notes
        RETURNING id
        """,
        name,
        folder_id,
        description,
        json.dumps(products_used),
        priority,
        notes,
    )
    if row is None:
        # Nothing changed — fetch the existing id
        row = await pool.fetchrow("SELECT id FROM customers WHERE drive_folder_id = $1", folder_id)
    return row["id"]


async def get_customer_doc_modified_times(pool: asyncpg.Pool, customer_id: int) -> dict[str, str]:
    """Return {drive_file_id: drive_modified_at} for all stored docs of a customer."""
    rows = await pool.fetch(
        "SELECT drive_file_id, drive_modified_at FROM customer_documents WHERE customer_id = $1",
        customer_id,
    )
    return {row["drive_file_id"]: row["drive_modified_at"] for row in rows}


async def upsert_customer_documents(
    pool: asyncpg.Pool,
    customer_id: int,
    docs: list[tuple[str, str, str, str, list[float]]],
) -> int:
    """Upsert customer documents with embeddings.

    docs: list of (drive_file_id, title, content, drive_modified_at, embedding)
    Returns count upserted.
    """
    query = """
        INSERT INTO customer_documents
            (customer_id, drive_file_id, title, content, drive_modified_at, embedding)
        VALUES ($1, $2, $3, $4, $5, $6::vector)
        ON CONFLICT (drive_file_id) DO UPDATE SET
            title             = EXCLUDED.title,
            content           = EXCLUDED.content,
            drive_modified_at = EXCLUDED.drive_modified_at,
            embedding         = EXCLUDED.embedding,
            synced_at         = CURRENT_TIMESTAMP
    """
    rows = [
        (customer_id, file_id, title, content, modified_at, json.dumps(emb))
        for file_id, title, content, modified_at, emb in docs
    ]
    async with pool.acquire() as conn:
        await conn.executemany(query, rows)
    logger.info("Upserted %d customer documents for customer_id=%d", len(rows), customer_id)
    return len(rows)


async def insert_report(
    pool: asyncpg.Pool,
    customer_id: int,
    title: str,
    content: str,
    drive_file_id: str | None,
) -> Report:
    """Insert a generated report and return the stored record."""
    row = await pool.fetchrow(
        """
        INSERT INTO reports (customer_id, title, content, drive_file_id)
        VALUES ($1, $2, $3, $4)
        RETURNING id, customer_id, title, content, drive_file_id, generated_at
        """,
        customer_id,
        title,
        content,
        drive_file_id,
    )
    return Report(
        id=row["id"],
        customer_id=row["customer_id"],
        title=row["title"],
        content=row["content"],
        drive_file_id=row["drive_file_id"],
        generated_at=row["generated_at"],
    )


async def list_customer_reports(pool: asyncpg.Pool, customer_id: int) -> list[Report]:
    """Return all reports for a customer, newest first."""
    rows = await pool.fetch(
        """
        SELECT id, customer_id, title, content, drive_file_id, generated_at
        FROM reports
        WHERE customer_id = $1
        ORDER BY generated_at DESC
        """,
        customer_id,
    )
    return [
        Report(
            id=row["id"],
            customer_id=row["customer_id"],
            title=row["title"],
            content=row["content"],
            drive_file_id=row["drive_file_id"],
            generated_at=row["generated_at"],
        )
        for row in rows
    ]


async def search_customer_documents(
    pool: asyncpg.Pool,
    customer_id: int,
    embedding: list[float],
    limit: int = 5,
) -> list[dict]:
    """Vector search over customer documents. Returns list of {title, content, similarity}."""
    rows = await pool.fetch(
        """
        SELECT title, content, 1 - (embedding <=> $2::vector) AS similarity
        FROM customer_documents
        WHERE customer_id = $1
        ORDER BY embedding <=> $2::vector
        LIMIT $3
        """,
        customer_id,
        json.dumps(embedding),
        limit,
    )
    return [
        {"title": row["title"], "content": row["content"], "similarity": float(row["similarity"])}
        for row in rows
    ]
