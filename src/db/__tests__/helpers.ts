import Database from "better-sqlite3";
import { join } from "path";
import { existsSync } from "fs";
import { runMigrations, VECTOR_SEARCH_MIGRATION_VERSION } from "../migrations";

export function getTestExtensionPath(): string {
  const basePath =
    process.env.SQLITE_VEC_EXTENSION_PATH ||
    join(__dirname, "..", "..", "..", "dist", "extensions", "vec0");

  // Try platform-specific suffixes
  const suffixes = [".so", ".dylib", ".dll"];
  for (const suffix of suffixes) {
    const path = basePath + suffix;
    if (existsSync(path)) {
      return path;
    }
  }

  // Fall back to .so as the most likely default
  return basePath + ".so";
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

  // If the vec0 extension is not loaded, skip the vector search migration
  // so runMigrations does not crash on the CREATE VIRTUAL TABLE.
  const skipVersions = !extensionLoaded
    ? [VECTOR_SEARCH_MIGRATION_VERSION]
    : undefined;

  runMigrations(db, { skipVersions });
  return db;
}
