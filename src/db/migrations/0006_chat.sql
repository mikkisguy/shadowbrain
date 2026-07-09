-- Chat threads and messages for the chat interface (issue #48).
-- See docs/superpowers/specs/2026-06-19-chat-interface-design.md §Data Model.

CREATE TABLE chat_threads (
  id               TEXT PRIMARY KEY,
  title            TEXT NOT NULL,
  target_provider  TEXT NOT NULL,          -- 'hermes' | 'opencode-go'
  target_model     TEXT NOT NULL,
  grounded         INTEGER NOT NULL DEFAULT 1,  -- RAG on/off
  allow_model_save INTEGER NOT NULL DEFAULT 0,
  include_private_in_ai INTEGER NOT NULL DEFAULT 0,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE chat_messages (
  id               TEXT PRIMARY KEY,
  thread_id        TEXT NOT NULL REFERENCES chat_threads(id) ON DELETE CASCADE,
  role             TEXT NOT NULL,          -- 'user' | 'assistant' | 'system' | 'tool'
  content          TEXT NOT NULL,
  tool_calls       TEXT,                    -- JSON array, nullable
  tool_call_id     TEXT,                    -- nullable
  target_provider  TEXT,
  target_model     TEXT,
  created_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_chat_messages_thread ON chat_messages (thread_id, created_at);
