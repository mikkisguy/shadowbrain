const { unlinkSync, existsSync } = require('fs');
const { join, resolve } = require('path');

const PROJECT_ROOT = resolve(__dirname, '..');
const TEST_DB_FILES = [
  'shadowbrain.test.db',
  'shadowbrain.test.db-wal',
  'shadowbrain.test.db-shm',
].map(f => join(PROJECT_ROOT, f));

function cleanupTestDb() {
  let removed = 0;
  for (const file of TEST_DB_FILES) {
    if (existsSync(file)) {
      unlinkSync(file);
      removed++;
      console.log(`  Removed: ${file}`);
    }
  }
  return removed;
}

console.log('Cleaning up test database files...\n');

const removed = cleanupTestDb();

if (removed === 0) {
  console.log('No test database files found.');
} else {
  console.log(`\n✓ Removed ${removed} test database file(s).`);
}
