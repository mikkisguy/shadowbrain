/* eslint-disable @typescript-eslint/no-require-imports */
const { unlinkSync, existsSync, readdirSync } = require("fs");
const { join, resolve } = require("path");

const PROJECT_ROOT = resolve(__dirname, "..");
const DATA_DIR = join(PROJECT_ROOT, "data");

// Test DB files use a per-vitest-worker suffix (e.g. shadowbrain.test.1.db)
// so concurrent test files don't trample each other's on-disk state.
// Match the legacy unsuffixed name too, in case any old files are still
// around from before the per-worker change.
const TEST_DB_PATTERN = /^shadowbrain\.test(\.[^/]+)?\.db(-wal|-shm)?$/;

function cleanupTestDb() {
  if (!existsSync(DATA_DIR)) {
    return 0;
  }
  const files = readdirSync(DATA_DIR).filter((f) => TEST_DB_PATTERN.test(f));
  let removed = 0;
  for (const file of files) {
    unlinkSync(join(DATA_DIR, file));
    removed++;
    console.log(`  Removed: ${join("data", file)}`);
  }
  return removed;
}

console.log("Cleaning up test database files...\n");

const removed = cleanupTestDb();

if (removed === 0) {
  console.log("No test database files found.");
} else {
  console.log(`\n✓ Removed ${removed} test database file(s).`);
}
