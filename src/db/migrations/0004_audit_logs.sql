-- Migration: 0004_audit_logs
-- Created: 2026-05-20
-- Description: Add audit_logs table for security and operational auditing

CREATE TABLE IF NOT EXISTS audit_logs (
    id          TEXT PRIMARY KEY,
    actor_id    TEXT,
    actor_type  TEXT,
    action      TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id   TEXT,
    success     INTEGER NOT NULL DEFAULT 1,
    metadata    TEXT,
    ip          TEXT,
    user_agent  TEXT,
    created_at  DATETIME NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);
