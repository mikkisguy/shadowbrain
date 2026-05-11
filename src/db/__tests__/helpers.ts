import Database from "better-sqlite3";
import { join } from "path";
import { runMigrations } from "../migrations";

export function getTestExtensionPath(): string {
  return (
    process.env.SQLITE_VEC_EXTENSION_PATH ||
    join(__dirname, "..", "..", "..", "dist", "extensions", "vec0.so")
  );
}

export function createTestDb(options?: {
  requireVecExtension?: boolean;
}): Database.Database {
  const db = new Database(":memory:");
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  const extensionPath = getTestExtensionPath();
  let extensionLoaded = false;

  try {
    db.loadExtension(extensionPath);
    extensionLoaded = true;
    console.log("✓ Loaded sqlite-vec extension for tests");
  } catch (err) {
    if (options?.requireVecExtension) {
      throw new Error(
        `Failed to load required sqlite-vec extension from ${extensionPath}: ${err}`
      );
    }
    console.warn(
      "sqlite-vec extension not available. Vector search tests will be skipped."
    );
  }

  // If the vec0 extension is not loaded, mark the vector search migration
  // as applied so runMigrations does not crash on the CREATE VIRTUAL TABLE.
  if (!extensionLoaded) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    db.prepare(
      "INSERT OR IGNORE INTO schema_migrations (version) VALUES (?)"
    ).run(3);
  }

  runMigrations(db);
  return db;
}
