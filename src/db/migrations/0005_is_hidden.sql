-- Migration: 0005_is_hidden
-- Created: 2026-06-21
-- Description: Add is_hidden column to content_items for two-level visibility.
-- is_hidden = 1 items are excluded from default views but ARE included in AI/RAG
-- context by default. is_private = 1 items are excluded from both default views
-- and AI/RAG (gated on a per-thread / per-send opt-in instead).
-- Existing rows default to is_hidden = 0 (visible), preserving the prior
-- behaviour of "everything is shown by default".

ALTER TABLE content_items ADD COLUMN is_hidden INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_content_is_hidden ON content_items(is_hidden);
