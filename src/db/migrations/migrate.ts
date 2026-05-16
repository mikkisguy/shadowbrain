import Database from "better-sqlite3";
import { readFileSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const MIGRATIONS_DIR = process.env.MIGRATIONS_DIR || __dirname;

export const VECTOR_SEARCH_MIGRATION_VERSION = 3;

interface Migration {
  filename: string;
  number: number;
  sql: string;
}

function getMigrations(): Migration[] {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const migrations: Migration[] = [];

  for (const filename of files) {
    const number = parseInt(filename.split("_")[0], 10);
    if (isNaN(number)) {
      throw new Error(
        `Invalid migration filename: ${filename} (must start with a number)`
      );
    }
    const sql = readFileSync(join(MIGRATIONS_DIR, filename), "utf-8");
    migrations.push({ filename, number, sql });
  }

  return migrations.sort((a, b) => a.number - b.number);
}

export function runMigrations(
  db: Database.Database,
  options?: { skipVersions?: number[] }
): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const currentVersion = db
    .prepare("SELECT MAX(version) as v FROM schema_migrations")
    .get() as { v: number | null };
  const currentVersionNumber = currentVersion?.v ?? 0;

  const skipSet = new Set(options?.skipVersions ?? []);

  const pendingMigrations = getMigrations().filter(
    (m) => m.number > currentVersionNumber && !skipSet.has(m.number)
  );

  if (pendingMigrations.length === 0) {
    console.log("No pending migrations.");
    return;
  }

  console.log(`Running ${pendingMigrations.length} migration(s)...`);

  for (const migration of pendingMigrations) {
    console.log(`  Applying ${migration.filename}...`);

    const transaction = db.transaction(() => {
      db.exec(migration.sql);
      db.prepare("INSERT INTO schema_migrations (version) VALUES (?)").run(
        migration.number
      );
    });

    transaction();
    console.log(`  ✓ ${migration.filename} applied.`);
  }

  console.log("Migrations complete.");
}
