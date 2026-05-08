-- Migration: 0001_initial_schema
-- Created: 2026-05-08
-- Description: Create all core tables for ShadowBrain

-- Content Items - The universal table
CREATE TABLE IF NOT EXISTS content_items (
    id          TEXT PRIMARY KEY,
    type        TEXT NOT NULL,
    title       TEXT,
    content     TEXT NOT NULL,
    image_path  TEXT,
    source      TEXT NOT NULL DEFAULT 'manual',
    source_url  TEXT,
    metadata    TEXT,
    is_private  INTEGER NOT NULL DEFAULT 0,
    created_at  DATETIME NOT NULL,
    updated_at  DATETIME NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_content_type ON content_items(type);
CREATE INDEX IF NOT EXISTS idx_content_source ON content_items(source);
CREATE INDEX IF NOT EXISTS idx_content_created ON content_items(created_at);
CREATE INDEX IF NOT EXISTS idx_content_updated ON content_items(updated_at);

-- Content Links - Typed, bidirectional connections
CREATE TABLE IF NOT EXISTS content_links (
    id          TEXT PRIMARY KEY,
    source_id   TEXT NOT NULL,
    target_id   TEXT NOT NULL,
    link_type   TEXT NOT NULL DEFAULT 'reference',
    context     TEXT,
    created_at  DATETIME NOT NULL,
    FOREIGN KEY (source_id) REFERENCES content_items(id) ON DELETE CASCADE,
    FOREIGN KEY (target_id) REFERENCES content_items(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_links_source ON content_links(source_id);
CREATE INDEX IF NOT EXISTS idx_links_target ON content_links(target_id);
CREATE INDEX IF NOT EXISTS idx_links_type ON content_links(link_type);

-- Tags
CREATE TABLE IF NOT EXISTS tags (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL UNIQUE COLLATE NOCASE,
    color       TEXT,
    created_at  DATETIME NOT NULL
);

-- Content Tags junction table
CREATE TABLE IF NOT EXISTS content_tags (
    content_id  TEXT NOT NULL,
    tag_id      TEXT NOT NULL,
    created_at  DATETIME NOT NULL,
    PRIMARY KEY (content_id, tag_id),
    FOREIGN KEY (content_id) REFERENCES content_items(id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_ct_content ON content_tags(content_id);
CREATE INDEX IF NOT EXISTS idx_ct_tag ON content_tags(tag_id);

-- Journal Periods - 4 AM boundary data
-- One-to-one with content_items: each journal entry has at most one period
CREATE TABLE IF NOT EXISTS journal_periods (
    content_id   TEXT PRIMARY KEY,
    period_start DATETIME NOT NULL,
    period_end   DATETIME NOT NULL,
    raw_count    INTEGER NOT NULL,
    model_used   TEXT,
    FOREIGN KEY (content_id) REFERENCES content_items(id) ON DELETE CASCADE
);

-- Settings
CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

-- Default settings
INSERT OR IGNORE INTO settings VALUES ('ai_provider', 'openrouter');
INSERT OR IGNORE INTO settings VALUES ('ai_model', 'mistralai/mistral-7b-instruct');
INSERT OR IGNORE INTO settings VALUES ('embedding_model', 'all-MiniLM-L6-v2');
INSERT OR IGNORE INTO settings VALUES ('version', '1.0.0');
