import Database from 'better-sqlite3';
import { join } from 'path';
import { unlinkSync, existsSync, readFileSync, readdirSync } from 'fs';
import { getDbPath } from './index';

const TEST_DB_PATH = getDbPath('test');

/**
 * Creates a fresh test database with all migrations applied.
 * This should be called before each test suite or test file.
 */
export function createTestDb(): Database.Database {
  const db = new Database(TEST_DB_PATH);

  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // Run migrations
  const migrationsDir = join(__dirname, 'migrations');
  const files = readdirSync(migrationsDir)
    .filter((f: string) => f.endsWith('.sql'))
    .sort();

  // Create schema_migrations table
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Apply all migrations
  for (const filename of files) {
    const sql = readFileSync(join(migrationsDir, filename), 'utf-8');
    const number = parseInt(filename.split('_')[0], 10);

    db.transaction(() => {
      db.exec(sql);
      db.prepare('INSERT INTO schema_migrations (version) VALUES (?)').run(number);
    })();
  }

  return db;
}

/**
 * Resets the test database by removing all data from tables
 * while preserving the schema. Faster than recreating the DB.
 */
export function resetTestDb(db: Database.Database): void {
  const tables = db.prepare(`
    SELECT name FROM sqlite_master
    WHERE type='table' AND name NOT LIKE 'sqlite_%'
  `).all() as Array<{ name: string }>;

  for (const { name } of tables) {
    if (name !== 'schema_migrations') {
      db.exec(`DELETE FROM ${name}`);
    }
  }
}

/**
 * Clears a specific table in the test database.
 */
export function clearTable(db: Database.Database, tableName: string): void {
  db.exec(`DELETE FROM ${tableName}`);
}

/**
 * Drops all tables in the test database.
 * Useful for testing schema migrations.
 */
export function dropAllTables(db: Database.Database): void {
  db.exec('PRAGMA foreign_keys = OFF');

  const tables = db.prepare(`
    SELECT name FROM sqlite_master
    WHERE type='table' AND name NOT LIKE 'sqlite_%'
  `).all() as Array<{ name: string }>;

  for (const { name } of tables) {
    db.exec(`DROP TABLE IF EXISTS ${name}`);
  }

  db.exec('PRAGMA foreign_keys = ON');
}

/**
 * Closes and deletes the test database file.
 * Call this in afterAll or cleanup hooks.
 */
export function cleanupTestDb(): void {
  const dbPath = TEST_DB_PATH;
  const walPath = dbPath + '-wal';
  const shmPath = dbPath + '-shm';

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
export function seedTestDb(db: Database.Database, data: {
  contentItems?: Array<any>;
  tags?: Array<any>;
  contentTags?: Array<any>;
  links?: Array<any>;
}): void {
  if (data.contentItems) {
    const insertItem = db.prepare(`
      INSERT INTO content_items (id, type, title, content, source, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    for (const item of data.contentItems) {
      insertItem.run(item.id, item.type, item.title, item.content, item.source, item.created_at, item.updated_at);
    }
  }

  if (data.tags) {
    const insertTag = db.prepare('INSERT INTO tags (id, name, created_at) VALUES (?, ?, ?)');
    for (const tag of data.tags) {
      insertTag.run(tag.id, tag.name, tag.created_at);
    }
  }

  if (data.contentTags) {
    const insertCT = db.prepare('INSERT INTO content_tags (content_id, tag_id, created_at) VALUES (?, ?, ?)');
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
      insertLink.run(link.id, link.source_id, link.target_id, link.link_type, link.created_at);
    }
  }
}

/**
 * Asserts that the test database is empty (except for schema_migrations).
 */
export function assertTestDbEmpty(db: Database.Database): void {
  const tables = db.prepare(`
    SELECT name FROM sqlite_master
    WHERE type='table' AND name NOT IN ('schema_migrations', 'sqlite_%')
  `).all() as Array<{ name: string }>;

  for (const { name } of tables) {
    const count = db.prepare(`SELECT COUNT(*) as c FROM ${name}`).get() as { c: number };
    if (count.c > 0) {
      throw new Error(`Table ${name} is not empty: ${count.c} rows found`);
    }
  }
}

/**
 * Gets a row count for a specific table.
 */
export function getTableRowCount(db: Database.Database, tableName: string): number {
  const result = db.prepare(`SELECT COUNT(*) as c FROM ${tableName}`).get() as { c: number };
  return result.c;
}
