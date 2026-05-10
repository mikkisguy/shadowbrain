-- Migration: 0002_fts_search
-- Created: 2026-05-09
-- Description: Add FTS5 virtual table with triggers to auto-index content_items

-- Create FTS5 virtual table for full-text search
CREATE VIRTUAL TABLE IF NOT EXISTS content_items_search USING fts5(
    title,
    content,
    content=content_items,
    content_rowid=rowid
);

-- Backfill existing content_items into the FTS index
-- Note: For tables with >100k rows, consider running this in a controlled environment
-- or with WAL mode enabled to avoid long transactions
INSERT INTO content_items_search(rowid, title, content)
SELECT rowid, title, content FROM content_items;

-- Trigger: Insert new content items into FTS index
CREATE TRIGGER IF NOT EXISTS content_items_ai AFTER INSERT ON content_items BEGIN
    INSERT INTO content_items_search(rowid, title, content)
    VALUES (new.rowid, new.title, new.content);
END;

-- Trigger: Remove deleted content items from FTS index
CREATE TRIGGER IF NOT EXISTS content_items_ad AFTER DELETE ON content_items BEGIN
    INSERT INTO content_items_search(content_items_search, rowid, title, content)
    VALUES('delete', old.rowid, old.title, old.content);
END;

-- Trigger: Update FTS index when title or content changes
CREATE TRIGGER IF NOT EXISTS content_items_au AFTER UPDATE OF title, content ON content_items BEGIN
    INSERT INTO content_items_search(content_items_search, rowid, title, content)
    VALUES('delete', old.rowid, old.title, old.content);
    INSERT INTO content_items_search(rowid, title, content)
    VALUES (new.rowid, new.title, new.content);
END;
