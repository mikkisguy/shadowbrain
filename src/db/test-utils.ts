import Database from "better-sqlite3";
import { unlinkSync, existsSync } from "fs";
import { join } from "path";
import { closeDb, getDbPath, isVecExtensionLoaded } from "./index";
import {
  runMigrations,
  VECTOR_SEARCH_MIGRATION_VERSION,
} from "./migrations/migrate";
import { createAuthedRequest } from "@/lib/auth/test-helpers";
import { SESSION_COOKIE_NAME } from "@/lib/auth/constants";

/**
 * Test helper — wrap a `Request` in a signed session cookie.
 *
 * Auth-required API routes (every route outside `/api/auth/*` and
 * `/login`) check the session in their handler as defense in
 * depth. Tests that call the route function directly (bypassing
 * the proxy) need to add the cookie themselves. This helper
 * signs a cookie using the same SESSION_SECRET the app uses at
 * runtime, so `requireAuthenticated` passes.
 *
 * Usage:
 *
 *     const req = await authedRequest("http://localhost/api/items", {
 *       method: "POST",
 *       headers: { "Content-Type": "application/json" },
 *       body: JSON.stringify({ ... }),
 *     });
 */
export async function authedRequest(
  url: string,
  init: RequestInit = {}
): Promise<Request> {
  return createAuthedRequest({ url, init });
}

/** Shorthand for the most common case: an authed GET with no body. */
export async function authedGet(url: string): Promise<Request> {
  return createAuthedRequest({ url });
}

/** Extract the session cookie value from a Response's `Set-Cookie`
 *  header, when present. Used by tests that need to follow a login
 *  response (e.g. to then call a protected route with the issued
 *  cookie). */
export function extractSessionCookie(res: Response): string | null {
  const setCookie = res.headers.get("set-cookie");
  if (!setCookie) return null;
  // The session cookie is the only one we set on /api/auth/login;
  // match by name to be robust against future Set-Cookie additions.
  for (const part of setCookie.split(/,(?=[^ ])/)) {
    const eq = part.indexOf("=");
    if (eq <= 0) continue;
    const name = part.slice(0, eq).trim();
    if (name === SESSION_COOKIE_NAME) {
      const value =
        part
          .slice(eq + 1)
          .split(";")[0]
          ?.trim() ?? "";
      return value || null;
    }
  }
  return null;
}

const TEST_DB_PATH = getDbPath("test");

const VALID_TABLE_NAME = /^[a-zA-Z0-9_]+$/;

function validateTableName(name: string): void {
  if (!VALID_TABLE_NAME.test(name)) {
    throw new Error(`Invalid table name: ${name}`);
  }
}

function getTestExtensionPath(): string {
  const basePath = join(__dirname, "..", "..", "dist", "extensions", "vec0");
  const suffixes = [".so", ".dylib", ".dll"];
  for (const suffix of suffixes) {
    const path = basePath + suffix;
    if (existsSync(path)) {
      return path;
    }
  }
  return basePath + ".so";
}

/**
 * Creates a fresh test database with all migrations applied.
 * This should be called before each test suite or test file.
 */
export function createTestDb(): Database.Database {
  const db = new Database(TEST_DB_PATH);

  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  // Load sqlite-vec extension if available
  const extensionPath = getTestExtensionPath();
  try {
    db.loadExtension(extensionPath);
    console.log("✓ Loaded sqlite-vec extension for tests");
  } catch {
    console.warn(
      "sqlite-vec extension not available. Vector search functionality will be unavailable."
    );
  }

  // Skip vector search migration if extension is not loaded
  const skipVersions = !isVecExtensionLoaded(db)
    ? [VECTOR_SEARCH_MIGRATION_VERSION]
    : undefined;

  runMigrations(db, { skipVersions });

  return db;
}

/**
 * Resets the test database by removing all data from tables
 * while preserving the schema. Faster than recreating the DB.
 */
export function resetTestDb(db: Database.Database): void {
  const tables = db
    .prepare(
      `
    SELECT name FROM sqlite_master
    WHERE type='table' AND name NOT LIKE 'sqlite_%'
  `
    )
    .all() as Array<{ name: string }>;

  for (const { name } of tables) {
    validateTableName(name);
    if (name !== "schema_migrations") {
      db.exec(`DELETE FROM ${name}`);
    }
  }
}

/**
 * Clears a specific table in the test database.
 */
export function clearTable(db: Database.Database, tableName: string): void {
  validateTableName(tableName);
  db.exec(`DELETE FROM ${tableName}`);
}

/**
 * Drops all tables in the test database.
 * Useful for testing schema migrations.
 */
export function dropAllTables(db: Database.Database): void {
  db.exec("PRAGMA foreign_keys = OFF");

  const tables = db
    .prepare(
      `
    SELECT name FROM sqlite_master
    WHERE type='table' AND name NOT LIKE 'sqlite_%'
  `
    )
    .all() as Array<{ name: string }>;

  for (const { name } of tables) {
    validateTableName(name);
    db.exec(`DROP TABLE IF EXISTS ${name}`);
  }

  db.exec("PRAGMA foreign_keys = ON");
}

/**
 * Closes and deletes the test database file.
 * Call this in afterAll or cleanup hooks.
 */
export function cleanupTestDb(): void {
  // Close any cached test DB connection before deleting files
  closeDb("test");

  const dbPath = TEST_DB_PATH;
  const walPath = dbPath + "-wal";
  const shmPath = dbPath + "-shm";

  if (existsSync(dbPath)) {
    unlinkSync(dbPath);
  }
  if (existsSync(walPath)) {
    unlinkSync(walPath);
  }
  if (existsSync(shmPath)) {
    unlinkSync(shmPath);
  }
}

/**
 * Inserts test data into the test database.
 */
export function seedTestDb(
  db: Database.Database,
  data: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    contentItems?: Array<any>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tags?: Array<any>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    contentTags?: Array<any>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    links?: Array<any>;
  }
): void {
  if (data.contentItems) {
    const insertItem = db.prepare(`
      INSERT INTO content_items (id, type, title, content, source, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    for (const item of data.contentItems) {
      insertItem.run(
        item.id,
        item.type,
        item.title,
        item.content,
        item.source,
        item.created_at,
        item.updated_at
      );
    }
  }

  if (data.tags) {
    const insertTag = db.prepare(
      "INSERT INTO tags (id, name, created_at) VALUES (?, ?, ?)"
    );
    for (const tag of data.tags) {
      insertTag.run(tag.id, tag.name, tag.created_at);
    }
  }

  if (data.contentTags) {
    const insertCT = db.prepare(
      "INSERT INTO content_tags (content_id, tag_id, created_at) VALUES (?, ?, ?)"
    );
    for (const ct of data.contentTags) {
      insertCT.run(ct.content_id, ct.tag_id, ct.created_at);
    }
  }

  if (data.links) {
    const insertLink = db.prepare(`
      INSERT INTO content_links (id, source_id, target_id, link_type, created_at)
      VALUES (?, ?, ?, ?, ?)
    `);
    for (const link of data.links) {
      insertLink.run(
        link.id,
        link.source_id,
        link.target_id,
        link.link_type,
        link.created_at
      );
    }
  }
}

/**
 * Asserts that the test database is empty (except for schema_migrations).
 */
export function assertTestDbEmpty(db: Database.Database): void {
  const tables = db
    .prepare(
      `
    SELECT name FROM sqlite_master
    WHERE type='table' AND name NOT IN ('schema_migrations', 'sqlite_%')
  `
    )
    .all() as Array<{ name: string }>;

  for (const { name } of tables) {
    validateTableName(name);
    const count = db.prepare(`SELECT COUNT(*) as c FROM ${name}`).get() as {
      c: number;
    };
    if (count.c > 0) {
      throw new Error(`Table ${name} is not empty: ${count.c} rows found`);
    }
  }
}

/**
 * Gets a row count for a specific table.
 */
export function getTableRowCount(
  db: Database.Database,
  tableName: string
): number {
  validateTableName(tableName);
  const result = db.prepare(`SELECT COUNT(*) as c FROM ${tableName}`).get() as {
    c: number;
  };
  return result.c;
}
