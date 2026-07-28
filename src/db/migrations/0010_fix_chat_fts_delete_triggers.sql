-- Fix chat FTS delete/update triggers (issue: DELETE /api/chat/threads/[id] 500).
--
-- Migration 0009 originally used FTS5 INSERT ... VALUES('delete', ...), which
-- raises "SQL logic error" on our SQLite builds. The source file was later
-- patched to DELETE FROM, but CREATE TRIGGER IF NOT EXISTS left already-applied
-- DBs on the broken trigger bodies. Recreate them with the working pattern
-- used by content_items FTS triggers in 0002.

DROP TRIGGER IF EXISTS trg_chat_messages_fts_delete;
DROP TRIGGER IF EXISTS trg_chat_messages_fts_update;

-- Prefer BEFORE DELETE so FTS cleanup runs before FK cascade finishes.
CREATE TRIGGER trg_chat_messages_fts_delete
  BEFORE DELETE ON chat_messages
BEGIN
  DELETE FROM chat_messages_search WHERE rowid = old.rowid;
END;

CREATE TRIGGER trg_chat_messages_fts_update
  AFTER UPDATE ON chat_messages
WHEN old.content IS NOT new.content
BEGIN
  DELETE FROM chat_messages_search WHERE rowid = old.rowid;
  INSERT INTO chat_messages_search (rowid, content)
  VALUES (new.rowid, new.content);
END;
