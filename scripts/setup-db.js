const Database = require('better-sqlite3');
const { readFileSync, readdirSync } = require('fs');
const { join, resolve } = require('path');

// Get the project root directory (parent of scripts/)
const PROJECT_ROOT = resolve(__dirname, '..');
const NODE_ENV = process.env.NODE_ENV || 'development';

// Determine database filename based on environment
const getDbFilename = (env) => {
  const projectName = 'shadowbrain';
  switch (env) {
    case 'test':
      return `${projectName}.test.db`;
    case 'development':
      return `${projectName}.dev.db`;
    case 'production':
    default:
      return `${projectName}.db`;
  }
};

const DB_PATH = join(PROJECT_ROOT, getDbFilename(NODE_ENV));
const MIGRATIONS_DIR = join(PROJECT_ROOT, 'src', 'db', 'migrations');

function runMigrations(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const currentVersion = db
    .prepare('SELECT MAX(version) as v FROM schema_migrations')
    .get();
  const currentVersionNumber = currentVersion?.v ?? 0;

  const files = readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .sort();

  const pendingMigrations = [];

  for (const filename of files) {
    const number = parseInt(filename.split('_')[0], 10);
    if (number > currentVersionNumber) {
      const sql = readFileSync(join(MIGRATIONS_DIR, filename), 'utf-8');
      pendingMigrations.push({ filename, number, sql });
    }
  }

  if (pendingMigrations.length === 0) {
    console.log('No pending migrations.');
  } else {
    console.log(`Running ${pendingMigrations.length} migration(s)...`);

    for (const migration of pendingMigrations.sort((a, b) => a.number - b.number)) {
      console.log(`  Applying ${migration.filename}...`);

      db.transaction(() => {
        db.exec(migration.sql);
        db.prepare('INSERT INTO schema_migrations (version) VALUES (?)').run(migration.number);
      })();

      console.log(`  ✓ ${migration.filename} applied.`);
    }

    console.log('Migrations complete.');
  }
}

function main() {
  console.log(`Setting up ShadowBrain database (${NODE_ENV})...\n`);

  const db = new Database(DB_PATH);

  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  console.log(`✓ Database initialized at: ${getDbFilename(NODE_ENV)}`);
  console.log('✓ WAL mode enabled for concurrent access');
  console.log('✓ Foreign keys enabled');

  runMigrations(db);

  const testResult = db.prepare('SELECT * FROM content_items').all();
  console.log(`\n✓ Verification: SELECT * FROM content_items returned ${testResult.length} rows (expected: 0)`);

  const settingsData = db.prepare('SELECT * FROM settings').all();
  console.log(`\n✓ Default settings loaded:`);
  for (const setting of settingsData) {
    console.log(`  - ${setting.key} = ${setting.value}`);
  }

  db.close();

  console.log('\n✓ Setup complete!');
}

main();
