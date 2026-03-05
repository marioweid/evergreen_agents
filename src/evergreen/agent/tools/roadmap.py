"""Tools for searching and querying the M365 roadmap."""

from __future__ import annotations

import json

import asyncpg

from evergreen.shared.models import RoadmapItem, RoadmapSearchResult


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
        RoadmapSearchResult(
            item=RoadmapItem(
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
            ),
            similarity=float(row["similarity"]),
        )
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
    return [
        RoadmapItem(
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
        for row in rows
    ]
