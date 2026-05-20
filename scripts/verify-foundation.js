/* eslint-disable @typescript-eslint/no-require-imports */
const Database = require("better-sqlite3");
const { readFileSync, readdirSync, existsSync, unlinkSync } = require("fs");
const { join, resolve } = require("path");
const os = require("os");
const crypto = require("crypto");

const PROJECT_ROOT = resolve(__dirname, "..");
const MIGRATIONS_DIR = join(PROJECT_ROOT, "src", "db", "migrations");
const VECTOR_SEARCH_MIGRATION_VERSION = 3;

function getExtensionPath() {
  const basePaths = [
    join(PROJECT_ROOT, "dist", "extensions", "vec0"),
    "./dist/extensions/vec0",
    "/app/dist/extensions/vec0",
  ];
  const suffixes = [".so", ".dylib", ".dll"];
  for (const basePath of basePaths) {
    for (const suffix of suffixes) {
      const fullPath = basePath + suffix;
      if (existsSync(fullPath)) {
        return fullPath;
      }
    }
  }
  return null;
}

function loadVecExtension(db) {
  const extensionPath = getExtensionPath();
  if (!extensionPath) {
    console.warn("sqlite-vec extension not found. Vector checks skipped.");
    return false;
  }
  try {
    db.loadExtension(extensionPath);
    console.log(`✓ Loaded sqlite-vec extension from: ${extensionPath}`);
    return true;
  } catch (err) {
    console.warn(`Failed to load sqlite-vec from ${extensionPath}:`, err);
    return false;
  }
}

function isVecExtensionLoaded(db) {
  try {
    const result = db
      .prepare("SELECT name FROM pragma_module_list WHERE name = 'vec0'")
      .get();
    return result?.name === "vec0";
  } catch {
    return false;
  }
}

function runMigrations(db, skipVersions) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const currentVersion = db
    .prepare("SELECT MAX(version) as v FROM schema_migrations")
    .get();
  const currentVersionNumber = currentVersion?.v ?? 0;

  const skipSet = new Set(skipVersions ?? []);

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const pendingMigrations = [];

  for (const filename of files) {
    const number = parseInt(filename.split("_")[0], 10);
    if (Number.isNaN(number)) {
      throw new Error(
        `Invalid migration filename: ${filename} (must start with a number)`
      );
    }
    if (number > currentVersionNumber && !skipSet.has(number)) {
      const sql = readFileSync(join(MIGRATIONS_DIR, filename), "utf-8");
      pendingMigrations.push({ filename, number, sql });
    }
  }

  if (pendingMigrations.length === 0) {
    console.log("No pending migrations.");
    return;
  }

  console.log(`Running ${pendingMigrations.length} migration(s)...`);
  for (const migration of pendingMigrations.sort(
    (a, b) => a.number - b.number
  )) {
    console.log(`  Applying ${migration.filename}...`);
    db.transaction(() => {
      db.exec(migration.sql);
      db.prepare("INSERT INTO schema_migrations (version) VALUES (?)").run(
        migration.number
      );
    })();
    console.log(`  ✓ ${migration.filename} applied.`);
  }
  console.log("Migrations complete.");
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function main() {
  const dbPath = join(
    os.tmpdir(),
    `shadowbrain-foundation-${process.pid}-${Date.now()}.db`
  );
  const db = new Database(dbPath);
  let shouldCleanup = true;

  try {
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");

    loadVecExtension(db);
    const skipVersions = !isVecExtensionLoaded(db)
      ? [VECTOR_SEARCH_MIGRATION_VERSION]
      : undefined;

    runMigrations(db, skipVersions);

    const emptyCount = db
      .prepare("SELECT COUNT(*) as count FROM content_items")
      .get();
    assert(
      emptyCount?.count === 0,
      `Expected empty content_items, found ${emptyCount?.count}`
    );
    console.log("✓ content_items empty on fresh DB");

    const contentId = crypto.randomUUID();
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO content_items (id, type, title, content, source, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      contentId,
      "note",
      "Foundation Check",
      "foundation check",
      "test",
      now,
      now
    );

    const ftsResults = db
      .prepare(
        "SELECT rowid, bm25(content_items_search) as rank FROM content_items_search WHERE content_items_search MATCH ? ORDER BY rank"
      )
      .all("foundation");
    assert(ftsResults.length > 0, "FTS query returned no results");
    console.log("✓ FTS search returns ranked results");

    if (isVecExtensionLoaded(db)) {
      const vecTable = db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'content_vectors'"
        )
        .get();
      assert(vecTable?.name === "content_vectors", "Vector table missing");

      const rowid = db
        .prepare("SELECT rowid FROM content_items WHERE id = ?")
        .get(contentId)?.rowid;
      assert(rowid, "Missing rowid for inserted content item");

      const embedding = JSON.stringify(Array(384).fill(0.01));
      db.prepare(
        "INSERT INTO content_vectors(rowid, embedding) VALUES (CAST(? AS INTEGER), ?)"
      ).run(rowid, embedding);

      const vecCount = db
        .prepare("SELECT COUNT(*) as count FROM content_vectors")
        .get();
      assert(vecCount?.count >= 1, "Vector table did not accept embeddings");
      console.log("✓ Vector table exists and accepts embeddings");
    } else {
      console.log("- Vector checks skipped (sqlite-vec not loaded)");
    }

    console.log("✓ Foundation verification complete");
  } catch (err) {
    shouldCleanup = false;
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Foundation verification failed: ${message}`);
    process.exit(1);
  } finally {
    db.close();
    if (shouldCleanup) {
      try {
        unlinkSync(dbPath);
      } catch {
        // ignore cleanup failures
      }
    }
  }
}

main();
