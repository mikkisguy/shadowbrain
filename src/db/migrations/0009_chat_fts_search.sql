-- FTS5 virtual table for searching chat_messages (issue #170).
-- Indexes message content so the search endpoint can return matching
-- threads with a snippet of the first matching message.

CREATE VIRTUAL TABLE IF NOT EXISTS chat_messages_search USING fts5(
  content,
  tokenize = "porter unicode61"
);

-- Trigger: INSERT into chat_messages → populate FTS index.
CREATE TRIGGER IF NOT EXISTS trg_chat_messages_fts_insert
  AFTER INSERT ON chat_messages
BEGIN
  INSERT INTO chat_messages_search (rowid, content)
  VALUES (new.rowid, new.content);
END;

-- Trigger: DELETE from chat_messages → remove from FTS index.
CREATE TRIGGER IF NOT EXISTS trg_chat_messages_fts_delete
  AFTER DELETE ON chat_messages
BEGIN
  DELETE FROM chat_messages_search WHERE rowid = old.rowid;
END;

-- Seed FTS index with existing chat_messages (triggers only fire on new changes).
INSERT INTO chat_messages_search (rowid, content)
SELECT rowid, content FROM chat_messages;

-- Trigger: UPDATE chat_messages.content → update FTS index.
CREATE TRIGGER IF NOT EXISTS trg_chat_messages_fts_update
  AFTER UPDATE ON chat_messages
WHEN old.content IS NOT new.content
BEGIN
  DELETE FROM chat_messages_search WHERE rowid = old.rowid;
  INSERT INTO chat_messages_search (rowid, content)
  VALUES (new.rowid, new.content);
END;
