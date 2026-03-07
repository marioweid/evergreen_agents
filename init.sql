CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS customers (
    id             SERIAL PRIMARY KEY,
    name           TEXT NOT NULL UNIQUE,
    description    TEXT NOT NULL,
    products_used  JSONB NOT NULL DEFAULT '[]',
    priority       TEXT NOT NULL DEFAULT 'medium',
    notes          TEXT,
    drive_folder_id TEXT,
    created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS roadmap_items (
    id              INTEGER PRIMARY KEY,
    title           TEXT NOT NULL,
    description     TEXT,
    status          TEXT,
    release_date    TEXT,
    products        JSONB NOT NULL DEFAULT '[]',
    platforms       JSONB NOT NULL DEFAULT '[]',
    cloud_instances JSONB NOT NULL DEFAULT '[]',
    release_phase   TEXT,
    document        TEXT NOT NULL,
    -- OpenAI text-embedding-3-small: 1536 dimensions
    embedding       vector(1536),
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS customer_documents (
    id               SERIAL PRIMARY KEY,
    customer_id      INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    drive_file_id    TEXT NOT NULL UNIQUE,
    title            TEXT NOT NULL,
    content          TEXT NOT NULL,
    drive_modified_at TEXT NOT NULL,
    -- OpenAI text-embedding-3-small: 1536 dimensions
    embedding        vector(1536),
    synced_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS reports (
    id            SERIAL PRIMARY KEY,
    customer_id   INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    title         TEXT NOT NULL,
    content       TEXT NOT NULL,
    drive_file_id TEXT,
    generated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Partial unique index required by ON CONFLICT (drive_folder_id) WHERE drive_folder_id IS NOT NULL
-- in upsert_customer_from_drive. A plain UNIQUE constraint does not satisfy this ON CONFLICT form.
CREATE UNIQUE INDEX IF NOT EXISTS customers_drive_folder_id_idx
    ON customers(drive_folder_id) WHERE drive_folder_id IS NOT NULL;

-- Created after initial data load for performance
-- CREATE INDEX IF NOT EXISTS roadmap_embedding_idx
--     ON roadmap_items USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
