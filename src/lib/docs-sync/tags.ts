/**
 * Tag helpers for the docs sync system.
 *
 * Every synced doc gets three tags:
 * - `project:shadowbrain` — groups all ShadowBrain content.
 * - `docs` — marks it as documentation.
 * - A path-derived category tag (e.g. `docs:api`, `docs:getting-started`).
 *
 * @module
 */
import { randomUUID } from "crypto";
import type Database from "better-sqlite3";
import { contentTags, tags } from "@/db/index";

/** Tag applied to every doc — groups all ShadowBrain content. */
const PROJECT_TAG = "project:shadowbrain";

/** Tag applied to every doc — marks it as documentation. */
const DOCS_TAG = "docs";

/**
 * Derive the category tag for a doc from its path relative to the sync
 * root.
 *
 * - A file in a subdirectory takes the top-level directory as its
 *   category: `api/endpoints/auth.md` → `docs:api`.
 * - A file at the root takes its filename stem: `getting-started.md` →
 *   `docs:getting-started`.
 *
 * The relative path uses forward slashes regardless of platform.
 */
export function categoryTagForRelPath(relPath: string): string {
  const parts = relPath.split("/");
  if (parts.length > 1) {
    return `docs:${parts[0]}`;
  }
  const stem = parts[0].replace(/\.[^.]+$/, "");
  return `docs:${stem}`;
}

/**
 * Find a tag by name (case-insensitive), creating it if absent. Returns
 * the tag id. Safe to call repeatedly — the second call hits the existing
 * row and does not insert.
 */
function ensureTag(db: Database.Database, name: string, now: string): string {
  const existing = tags.findByName(db, name);
  if (existing) return existing.id;
  const id = randomUUID();
  tags.create(db, { id, name, created_at: now });
  return id;
}

/**
 * Ensure the project, docs, and category tags are all linked to a content
 * item. Uses `INSERT OR IGNORE` so it is idempotent and self-healing: a
 * manually removed tag association is restored on the next sync.
 */
export function ensureDocTags(
  db: Database.Database,
  contentId: string,
  relPath: string,
  now: string
): void {
  const tagNames = [PROJECT_TAG, DOCS_TAG, categoryTagForRelPath(relPath)];
  for (const name of tagNames) {
    const tagId = ensureTag(db, name, now);
    contentTags.addTag(db, contentId, tagId, now);
  }
}
