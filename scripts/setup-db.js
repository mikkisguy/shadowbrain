/* eslint-disable @typescript-eslint/no-require-imports */
const Database = require("better-sqlite3");
const { readFileSync, readdirSync, existsSync } = require("fs");
const { join, resolve } = require("path");

// Get the project root directory (parent of scripts/)
const PROJECT_ROOT = resolve(__dirname, "..");
const NODE_ENV = process.env.NODE_ENV || "development";
const VECTOR_SEARCH_MIGRATION_VERSION = 3;

// Determine database filename based on environment
const getDbFilename = (env) => {
  const projectName = "shadowbrain";
  switch (env) {
    case "test":
      return `${projectName}.test.db`;
    case "development":
      return `${projectName}.dev.db`;
    case "production":
    default:
      return `${projectName}.db`;
  }
};

const DB_PATH = join(PROJECT_ROOT, getDbFilename(NODE_ENV));
const MIGRATIONS_DIR = join(PROJECT_ROOT, "src", "db", "migrations");

function getExtensionPath() {
  const basePath = join(PROJECT_ROOT, "dist", "extensions", "vec0");
  const suffixes = [".so", ".dylib", ".dll"];
  for (const suffix of suffixes) {
    const path = basePath + suffix;
    if (existsSync(path)) {
      return path;
    }
  }
  return basePath + ".so";
}

function loadVecExtension(db) {
  const extensionPath = getExtensionPath();
  if (!existsSync(extensionPath)) {
    console.warn(
      `sqlite-vec extension not found at ${extensionPath}. Vector search will be unavailable.`
    );
    return;
  }
  try {
    db.loadExtension(extensionPath);
    console.log(`✓ Loaded sqlite-vec extension from: ${extensionPath}`);
  } catch (err) {
    console.warn(
      `Failed to load sqlite-vec from ${extensionPath}:`,
      err.message
    );
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
    if (isNaN(number)) {
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
  } else {
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
}

function main() {
  console.log(`Setting up ShadowBrain database (${NODE_ENV})...\n`);

  const db = new Database(DB_PATH);

  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  console.log(`✓ Database initialized at: ${getDbFilename(NODE_ENV)}`);
  console.log("✓ WAL mode enabled for concurrent access");
  console.log("✓ Foreign keys enabled");

  // Load sqlite-vec extension if available
  loadVecExtension(db);

  // Skip vector search migration if extension is not loaded
  const skipVersions = !isVecExtensionLoaded(db)
    ? [VECTOR_SEARCH_MIGRATION_VERSION]
    : undefined;

  runMigrations(db, skipVersions);

  try {
    const testResult = db.prepare("SELECT * FROM content_items").all();
    console.log(
      `\n✓ Verification: SELECT * FROM content_items returned ${testResult.length} rows (expected: 0)`
    );
  } catch (err) {
    console.log(
      `\n⚠ Verification query failed (content_items may not exist yet): ${err.message}`
    );
  }

  try {
    const settingsData = db.prepare("SELECT * FROM settings").all();
    console.log(`\n✓ Default settings loaded:`);
    for (const setting of settingsData) {
      console.log(`  - ${setting.key} = ${setting.value}`);
    }
  } catch (err) {
    console.log(
      `\n⚠ Verification query failed (settings may not exist yet): ${err.message}`
    );
  }

  db.close();

  console.log("\n✓ Setup complete!");
}

main();
