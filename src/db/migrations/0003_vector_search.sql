-- Migration: 0003_vector_search
-- Created: 2026-05-11
-- Description: Add sqlite-vec vector table for embeddings

-- Create vec0 virtual table for vector similarity search
-- Stores float32 embeddings (384 dimensions) for content_items
-- If the vec0 extension is not loaded, the application skips this migration
-- gracefully so startup does not crash.
CREATE VIRTUAL TABLE IF NOT EXISTS content_vectors USING vec0(
    embedding float[384]
);
