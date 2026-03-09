"""Write roadmap items, customer records, and embeddings to PostgreSQL."""

import json
import logging

import asyncpg

from evergreen.shared.models import CustomerDocument, Report, RoadmapItem

logger = logging.getLogger(__name__)


async def get_setting(pool: asyncpg.Pool, key: str) -> str | None:
    """Fetch a setting value by key. Returns None if not set."""
    row = await pool.fetchrow("SELECT value FROM settings WHERE key = $1", key)
    return row["value"] if row else None


async def upsert_setting(pool: asyncpg.Pool, key: str, value: str) -> str:
    """Insert or update a setting. Returns the stored value."""
    row = await pool.fetchrow(
        """
        INSERT INTO settings (key, value) VALUES ($1, $2)
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
        RETURNING value
        """,
        key,
        value,
    )
    return row["value"]


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


# --- Customer documents ---


def _row_to_document(row: asyncpg.Record) -> CustomerDocument:
    return CustomerDocument(
        id=row["id"],
        customer_id=row["customer_id"],
        title=row["title"],
        content=row["content"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


async def list_customer_documents(pool: asyncpg.Pool, customer_id: int) -> list[CustomerDocument]:
    """Return all documents for a customer, newest first."""
    rows = await pool.fetch(
        """
        SELECT id, customer_id, title, content, created_at, updated_at
        FROM customer_documents
        WHERE customer_id = $1
        ORDER BY updated_at DESC
        """,
        customer_id,
    )
    return [_row_to_document(row) for row in rows]


async def insert_customer_document(
    pool: asyncpg.Pool,
    customer_id: int,
    title: str,
    content: str,
    embedding: list[float],
) -> CustomerDocument:
    """Insert a customer document with its embedding. Returns the stored record."""
    row = await pool.fetchrow(
        """
        INSERT INTO customer_documents (customer_id, title, content, embedding)
        VALUES ($1, $2, $3, $4::vector)
        RETURNING id, customer_id, title, content, created_at, updated_at
        """,
        customer_id,
        title,
        content,
        json.dumps(embedding),
    )
    return _row_to_document(row)


async def update_customer_document(
    pool: asyncpg.Pool,
    doc_id: int,
    customer_id: int,
    title: str | None,
    content: str | None,
    embedding: list[float] | None,
) -> CustomerDocument | None:
    """Update title and/or content of a document. Returns None if not found."""
    sets = ["updated_at = CURRENT_TIMESTAMP"]
    params: list[object] = []

    if title is not None:
        params.append(title)
        sets.append(f"title = ${len(params)}")
    if content is not None:
        params.append(content)
        sets.append(f"content = ${len(params)}")
    if embedding is not None:
        params.append(json.dumps(embedding))
        sets.append(f"embedding = ${len(params)}::vector")

    params.extend([doc_id, customer_id])
    id_param = len(params) - 1
    cid_param = len(params)

    row = await pool.fetchrow(
        f"""
        UPDATE customer_documents
        SET {", ".join(sets)}
        WHERE id = ${id_param} AND customer_id = ${cid_param}
        RETURNING id, customer_id, title, content, created_at, updated_at
        """,
        *params,
    )
    return _row_to_document(row) if row else None


async def delete_customer_document(pool: asyncpg.Pool, doc_id: int, customer_id: int) -> bool:
    """Delete a document. Returns True if deleted, False if not found."""
    result = await pool.execute(
        "DELETE FROM customer_documents WHERE id = $1 AND customer_id = $2",
        doc_id,
        customer_id,
    )
    return result == "DELETE 1"


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


# --- Reports ---


def _row_to_report(row: asyncpg.Record) -> Report:
    return Report(
        id=row["id"],
        customer_id=row["customer_id"],
        title=row["title"],
        content=row["content"],
        status=row["status"],
        generated_at=row["generated_at"],
    )


async def insert_report(
    pool: asyncpg.Pool,
    customer_id: int,
    title: str,
    content: str,
    status: str = "draft",
) -> Report:
    """Insert a generated report and return the stored record."""
    row = await pool.fetchrow(
        """
        INSERT INTO reports (customer_id, title, content, status)
        VALUES ($1, $2, $3, $4)
        RETURNING id, customer_id, title, content, status, generated_at
        """,
        customer_id,
        title,
        content,
        status,
    )
    return _row_to_report(row)


async def update_report(
    pool: asyncpg.Pool,
    report_id: int,
    title: str | None,
    content: str | None,
) -> Report | None:
    """Update title and/or content of a report. Returns None if not found."""
    sets: list[str] = []
    params: list[object] = []

    if title is not None:
        params.append(title)
        sets.append(f"title = ${len(params)}")
    if content is not None:
        params.append(content)
        sets.append(f"content = ${len(params)}")

    if not sets:
        row = await pool.fetchrow(
            "SELECT id, customer_id, title, content, status, generated_at"
            " FROM reports WHERE id = $1",
            report_id,
        )
        return _row_to_report(row) if row else None

    params.append(report_id)
    row = await pool.fetchrow(
        f"""
        UPDATE reports SET {", ".join(sets)}
        WHERE id = ${len(params)}
        RETURNING id, customer_id, title, content, status, generated_at
        """,
        *params,
    )
    return _row_to_report(row) if row else None


async def delete_report(pool: asyncpg.Pool, report_id: int) -> bool:
    """Delete a report. Returns True if deleted, False if not found."""
    result = await pool.execute("DELETE FROM reports WHERE id = $1", report_id)
    return result == "DELETE 1"


async def approve_report(pool: asyncpg.Pool, report_id: int) -> Report | None:
    """Set a report's status to approved. Returns None if not found."""
    row = await pool.fetchrow(
        """
        UPDATE reports SET status = 'approved' WHERE id = $1
        RETURNING id, customer_id, title, content, status, generated_at
        """,
        report_id,
    )
    return _row_to_report(row) if row else None


async def list_customer_reports(pool: asyncpg.Pool, customer_id: int) -> list[Report]:
    """Return all reports for a customer, newest first."""
    rows = await pool.fetch(
        """
        SELECT id, customer_id, title, content, status, generated_at
        FROM reports
        WHERE customer_id = $1
        ORDER BY generated_at DESC
        """,
        customer_id,
    )
    return [_row_to_report(row) for row in rows]
