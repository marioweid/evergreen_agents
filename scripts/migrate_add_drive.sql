-- Migration: add Google Drive support to customers table and add customer_documents table
-- Run once against your database: psql $DATABASE_URL -f scripts/migrate_add_drive.sql

-- Track which Drive folder each customer comes from
ALTER TABLE customers ADD COLUMN IF NOT EXISTS drive_folder_id TEXT;

-- Partial unique index: enforce uniqueness for Drive-sourced customers, allow NULL for manual ones
CREATE UNIQUE INDEX IF NOT EXISTS customers_drive_folder_id_key
    ON customers (drive_folder_id)
    WHERE drive_folder_id IS NOT NULL;

-- Store customer documents (meeting notes, etc.) fetched from Drive
CREATE TABLE IF NOT EXISTS customer_documents (
    id              SERIAL PRIMARY KEY,
    customer_id     INTEGER NOT NULL REFERENCES customers (id) ON DELETE CASCADE,
    drive_file_id   TEXT UNIQUE NOT NULL,
    title           TEXT NOT NULL,
    content         TEXT NOT NULL,
    embedding       vector(1536),
    drive_modified_at TEXT NOT NULL,  -- raw RFC3339 from Drive for delta detection
    synced_at       TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS customer_documents_customer_id_idx
    ON customer_documents (customer_id);

CREATE INDEX IF NOT EXISTS customer_documents_embedding_idx
    ON customer_documents USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 10);
