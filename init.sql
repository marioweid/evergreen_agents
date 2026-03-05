CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS customers (
    id           SERIAL PRIMARY KEY,
    name         TEXT NOT NULL UNIQUE,
    description  TEXT NOT NULL,
    products_used JSONB NOT NULL DEFAULT '[]',
    priority     TEXT NOT NULL DEFAULT 'medium',
    notes        TEXT,
    created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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

-- Created after initial data load for performance
-- CREATE INDEX IF NOT EXISTS roadmap_embedding_idx
--     ON roadmap_items USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
