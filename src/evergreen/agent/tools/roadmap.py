"""Tools for searching and querying the M365 roadmap."""


import json

import asyncpg

from evergreen.shared.models import RoadmapFilters, RoadmapItem, RoadmapSearchResult


def _row_to_item(row: asyncpg.Record) -> RoadmapItem:
    return RoadmapItem(
        id=row["id"],
        title=row["title"],
        description=row["description"],
        status=row["status"],
        release_date=row["release_date"],
        products=json.loads(row["products"] or "[]"),
        platforms=json.loads(row["platforms"] or "[]"),
        cloud_instances=json.loads(row["cloud_instances"] or "[]"),
        release_phase=row["release_phase"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


async def search_roadmap(
    pool: asyncpg.Pool,
    query_embedding: list[float],
    limit: int = 10,
) -> list[RoadmapSearchResult]:
    """Vector similarity search over roadmap items."""
    rows = await pool.fetch(
        """
        SELECT id, title, description, status, release_date,
               products, platforms, cloud_instances, release_phase,
               created_at, updated_at,
               1 - (embedding <=> $1::vector) AS similarity
        FROM roadmap_items
        ORDER BY embedding <=> $1::vector
        LIMIT $2
        """,
        json.dumps(query_embedding),
        limit,
    )
    return [
        RoadmapSearchResult(item=_row_to_item(row), similarity=float(row["similarity"]))
        for row in rows
    ]


async def get_roadmap_item(pool: asyncpg.Pool, item_id: int) -> RoadmapItem | None:
    """Fetch a single roadmap item by ID."""
    row = await pool.fetchrow(
        """
        SELECT id, title, description, status, release_date,
               products, platforms, cloud_instances, release_phase,
               created_at, updated_at
        FROM roadmap_items WHERE id = $1
        """,
        item_id,
    )
    if row is None:
        return None
    return _row_to_item(row)


async def list_recent_roadmap_items(
    pool: asyncpg.Pool,
    product_filter: str | None = None,
    limit: int = 20,
) -> list[RoadmapItem]:
    """List recently updated roadmap items, optionally filtered by product."""
    if product_filter:
        rows = await pool.fetch(
            """
            SELECT id, title, description, status, release_date,
                   products, platforms, cloud_instances, release_phase,
                   created_at, updated_at
            FROM roadmap_items
            WHERE products::text ILIKE $1
            ORDER BY updated_at DESC
            LIMIT $2
            """,
            f"%{product_filter}%",
            limit,
        )
    else:
        rows = await pool.fetch(
            """
            SELECT id, title, description, status, release_date,
                   products, platforms, cloud_instances, release_phase,
                   created_at, updated_at
            FROM roadmap_items
            ORDER BY updated_at DESC
            LIMIT $1
            """,
            limit,
        )
    return [_row_to_item(row) for row in rows]


async def get_roadmap_filters(pool: asyncpg.Pool) -> RoadmapFilters:
    """Return distinct products, statuses, and release phases present in the roadmap."""
    products_rows = await pool.fetch(
        """
        SELECT DISTINCT jsonb_array_elements_text(products) AS value
        FROM roadmap_items
        WHERE products != '[]'
        ORDER BY 1
        """
    )
    status_rows = await pool.fetch(
        "SELECT DISTINCT status AS value FROM roadmap_items WHERE status IS NOT NULL ORDER BY 1"
    )
    phase_rows = await pool.fetch(
        """
        SELECT DISTINCT release_phase AS value
        FROM roadmap_items
        WHERE release_phase IS NOT NULL
        ORDER BY 1
        """
    )
    return RoadmapFilters(
        products=[r["value"] for r in products_rows],
        statuses=[r["value"] for r in status_rows],
        release_phases=[r["value"] for r in phase_rows],
    )


async def browse_roadmap(
    pool: asyncpg.Pool,
    embedding: list[float] | None = None,
    product: str | None = None,
    status: str | None = None,
    release_phase: str | None = None,
    limit: int = 50,
) -> list[RoadmapItem]:
    """List or search roadmap items with optional filters.

    When embedding is provided the results are ordered by vector similarity.
    Otherwise results are ordered by updated_at DESC.
    All text filters use case-insensitive substring matching.
    """
    conditions: list[str] = []
    params: list[object] = []
    embedding_param = ""

    if embedding is not None:
        params.append(json.dumps(embedding))
        embedding_param = f"${len(params)}"

    if product:
        params.append(f"%{product}%")
        conditions.append(f"products::text ILIKE ${len(params)}")

    if status:
        params.append(f"%{status}%")
        conditions.append(f"status ILIKE ${len(params)}")

    if release_phase:
        params.append(f"%{release_phase}%")
        conditions.append(f"release_phase ILIKE ${len(params)}")

    params.append(limit)
    limit_param = f"${len(params)}"

    where = f"WHERE {' AND '.join(conditions)}" if conditions else ""

    if embedding is not None:
        query = f"""
            SELECT id, title, description, status, release_date,
                   products, platforms, cloud_instances, release_phase,
                   created_at, updated_at
            FROM roadmap_items
            {where}
            ORDER BY embedding <=> {embedding_param}::vector
            LIMIT {limit_param}
        """
    else:
        query = f"""
            SELECT id, title, description, status, release_date,
                   products, platforms, cloud_instances, release_phase,
                   created_at, updated_at
            FROM roadmap_items
            {where}
            ORDER BY updated_at DESC
            LIMIT {limit_param}
        """

    rows = await pool.fetch(query, *params)
    return [_row_to_item(row) for row in rows]
