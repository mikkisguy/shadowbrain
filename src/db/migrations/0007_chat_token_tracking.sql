-- Add token tracking columns to chat_messages (issue #169).
-- See docs/superpowers/specs/2026-06-19-chat-interface-design.md §Data Model.

ALTER TABLE chat_messages ADD COLUMN prompt_tokens INTEGER;
ALTER TABLE chat_messages ADD COLUMN completion_tokens INTEGER;
