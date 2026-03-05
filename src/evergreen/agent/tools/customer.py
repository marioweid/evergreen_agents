"""Tools for customer CRUD operations."""


import json

import asyncpg

from evergreen.shared.models import Customer, CustomerCreate, CustomerUpdate


async def list_customers(pool: asyncpg.Pool) -> list[Customer]:
    """Return all customers."""
    rows = await pool.fetch("SELECT * FROM customers ORDER BY name")
    return [_row_to_customer(r) for r in rows]


async def get_customer(pool: asyncpg.Pool, name: str) -> Customer | None:
    """Fetch a customer by name (case-insensitive)."""
    row = await pool.fetchrow("SELECT * FROM customers WHERE LOWER(name) = LOWER($1)", name)
    return _row_to_customer(row) if row else None


async def create_customer(pool: asyncpg.Pool, data: CustomerCreate) -> Customer:
    """Insert a new customer and return the created record."""
    row = await pool.fetchrow(
        """
        INSERT INTO customers (name, description, products_used, priority, notes)
        VALUES ($1, $2, $3::jsonb, $4, $5)
        RETURNING *
        """,
        data.name,
        data.description,
        json.dumps(data.products_used),
        data.priority,
        data.notes,
    )
    return _row_to_customer(row)


async def update_customer(pool: asyncpg.Pool, name: str, data: CustomerUpdate) -> Customer | None:
    """Update fields on an existing customer. Returns None if not found."""
    existing = await get_customer(pool, name)
    if existing is None:
        return None

    updated = existing.model_copy(
        update={k: v for k, v in data.model_dump().items() if v is not None}
    )
    row = await pool.fetchrow(
        """
        UPDATE customers
        SET description = $2, products_used = $3::jsonb,
            priority = $4, notes = $5, updated_at = CURRENT_TIMESTAMP
        WHERE LOWER(name) = LOWER($1)
        RETURNING *
        """,
        name,
        updated.description,
        json.dumps(updated.products_used),
        updated.priority,
        updated.notes,
    )
    return _row_to_customer(row) if row else None


async def delete_customer(pool: asyncpg.Pool, name: str) -> bool:
    """Delete a customer by name. Returns True if deleted."""
    result = await pool.execute("DELETE FROM customers WHERE LOWER(name) = LOWER($1)", name)
    return result == "DELETE 1"


def _row_to_customer(row: asyncpg.Record) -> Customer:
    return Customer(
        id=row["id"],
        name=row["name"],
        description=row["description"],
        products_used=json.loads(row["products_used"] or "[]"),
        priority=row["priority"],
        notes=row["notes"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )
