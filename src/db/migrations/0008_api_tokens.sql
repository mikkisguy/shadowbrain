-- Migration: 0008_api_tokens
-- Created: 2026-07-12
-- Description: Add api_tokens table for bearer-token authentication

CREATE TABLE IF NOT EXISTS api_tokens (
    id            TEXT PRIMARY KEY,
    name          TEXT NOT NULL,
    token_prefix  TEXT NOT NULL,
    token_hash    TEXT NOT NULL,
    created_at    DATETIME NOT NULL,
    last_used_at  DATETIME,
    last_used_ip  TEXT,
    is_revoked    INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_api_tokens_prefix ON api_tokens(token_prefix);
