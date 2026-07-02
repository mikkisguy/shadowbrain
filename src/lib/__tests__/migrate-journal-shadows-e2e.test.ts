import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, mkdir, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join, dirname } from "path";
import { spawnSync } from "child_process";
import Database from "better-sqlite3";
import { getDbPath, getDb, closeDb } from "@/db/index";
import { existsSync, unlinkSync } from "fs";

/**
 * End-to-end test for `scripts/migrate-journal-shadows.ts`.
 *
 * Spawns the script as a subprocess against a tiny, in-memory-shape
 * legacy DB (1 journal entry + 2 raw entries + 1 note + 2 settings)
 * and asserts the dest DB is populated correctly. This is the only
 * test that exercises the I/O glue (transaction, audit log,
 * blocklist, FK constraints) — the 25 mapper unit tests cover the
 * pure mapping logic.
 *
 * The test uses the project's test DB (NODE_ENV=test, set in
 * vitest.config.ts) as the dest, and resets it to a known state
 * between runs.
 *
 * This test also validates image file copying and content links creation.
 */
const PROJECT_ROOT = join(__dirname, "..", "..", "..");
const SCRIPT = join(PROJECT_ROOT, "scripts", "migrate-journal-shadows.ts");
const TSX = join(PROJECT_ROOT, "node_modules", ".bin", "tsx");

function cleanTestDb(): void {
  // The test DB is created by `getDb()` when the script runs, so we
  // just need to remove it (and any -wal / -shm sidecars) before the
  // run so the script gets a clean schema.
  const path = getDbPath("test");
  for (const suffix of ["", "-shm", "-wal"]) {
    const p = path + suffix;
    if (existsSync(p)) {
      try {
        unlinkSync(p);
      } catch {
        // Ignore — file may be locked by another worker.
      }
    }
  }
}

interface LegacyFixture {
  sourcePath: string;
  imagesDir: string;
}

async function writeLegacyFixture(workdir: string): Promise<LegacyFixture> {
  const sourcePath = join(workdir, "journal.db");
  const imagesDir = join(workdir, "images");
  const db = new Database(sourcePath);
  db.pragma("journal_mode = WAL");
  // Mirror the journal-shadows schema (May 2026 snapshot).
  db.exec(`
    CREATE TABLE journal_entries (
      id TEXT PRIMARY KEY,
      date DATE NOT NULL,
      content TEXT NOT NULL,
      period_start DATETIME,
      period_end DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      title TEXT
    );
    CREATE TABLE raw_entries (
      id TEXT PRIMARY KEY,
      content TEXT NOT NULL,
      type TEXT NOT NULL,
      image_path TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE note_names (
      path TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  // 1 journal entry (period 2026-01-01 04:00 to 21:00 UTC).
  db.prepare(
    `INSERT INTO journal_entries (id, date, content, period_start, period_end, created_at, updated_at, title)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    "je-1",
    "2026-01-01",
    "First journal entry",
    "2026-01-01 04:00:00",
    "2026-01-01 21:00:00",
    "2026-01-01 21:00:00",
    "2026-01-01 21:00:00",
    "Hello, 2026"
  );

  // 2 raw entries inside the journal's period.
  db.prepare(
    `INSERT INTO raw_entries (id, content, type, image_path, created_at)
     VALUES (?, ?, ?, ?, ?)`
  ).run("r1", "Morning text", "text", null, "2026-01-01 10:00:00");
  db.prepare(
    `INSERT INTO raw_entries (id, content, type, image_path, created_at)
     VALUES (?, ?, ?, ?, ?)`
  ).run("r2", "", "image", "2026-01/abc.webp", "2026-01-01 12:00:00");

  // 1 note.
  db.prepare(
    `INSERT INTO note_names (path, display_name, created_at, updated_at)
     VALUES (?, ?, ?, ?)`
  ).run(
    "notes/2026-reading-list.md",
    "2026 Reading List",
    "2026-01-02 09:00:00",
    "2026-01-02 09:00:00"
  );

  // 1 keepable setting (a key NOT in the dest seed, so the INSERT
  // OR IGNORE actually inserts) + 1 blocklisted secret + 1 setting
  // whose key collides with a seed row (the new `createOrIgnore`
  // contract must NOT clobber the dest's existing value).
  db.prepare(`INSERT INTO settings (key, value) VALUES (?, ?)`).run(
    "legacy_test_marker",
    "from-journal-shadows"
  );
  db.prepare(`INSERT INTO settings (key, value) VALUES (?, ?)`).run(
    "ai_model",
    "qwen/qwen3-SHOULD-NOT-OVERWRITE-SEED"
  );
  db.prepare(`INSERT INTO settings (key, value) VALUES (?, ?)`).run(
    "openrouter_api_key",
    "sk-or-SECRET-SHOULD-NOT-LEAK"
  );

  db.close();

  // Create legacy images dir with a dummy image file.
  await mkdir(join(imagesDir, "2026-01"), { recursive: true });
  await writeFile(join(imagesDir, "2026-01", "abc.webp"), "dummy-image-bytes");

  return { sourcePath, imagesDir };
}

function runScript(sourcePath: string): {
  stdout: string;
  stderr: string;
  status: number;
} {
  const result = spawnSync(
    TSX,
    [SCRIPT, "--source", sourcePath, "--validate"],
    {
      cwd: PROJECT_ROOT,
      env: {
        ...process.env,
        // Force the test DB path regardless of the parent's NODE_ENV.
        NODE_ENV: "test",
        // Avoid loading .env in the subprocess (it's not relevant
        // for this test and we don't want the parent's data dir
        // leaking in).
      },
      encoding: "utf-8",
    }
  );
  return {
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    status: result.status ?? -1,
  };
}

describe("migrate-journal-shadows E2E", () => {
  let workdir: string;

  beforeEach(async () => {
    workdir = await mkdtemp(join(tmpdir(), "sb-mig-"));
    cleanTestDb();
  });

  afterEach(async () => {
    cleanTestDb();
    await rm(workdir, { recursive: true, force: true });
  });

  it("imports a tiny legacy DB and validates successfully", async () => {
    const { sourcePath } = await writeLegacyFixture(workdir);
    const { stdout, stderr, status } = runScript(sourcePath);

    // The script must exit cleanly (0) — both the import and the
    // post-import validation should pass.
    expect(stderr).not.toContain("Migration failed");
    expect(status).toBe(0);
    expect(stdout).toMatch(/journal items inserted:.*1 \/ 1/);
    expect(stdout).toMatch(/journal periods inserted:.*1/);
    expect(stdout).toMatch(/raw items inserted:.*2 \/ 2/);
    expect(stdout).toMatch(/note items inserted:.*1 \/ 1/);
    // 2 keepable (legacy_test_marker + ai_model) + 1 blocklisted
    // (openrouter_api_key).
    expect(stdout).toMatch(/settings kept:.*2/);
    expect(stdout).toMatch(/settings dropped.*1/);
    expect(stdout).toMatch(/Validation: OK/);
  });

  it("never writes the blocklisted secret and respects the createOrIgnore contract on settings", async () => {
    const { sourcePath } = await writeLegacyFixture(workdir);
    runScript(sourcePath);

    const dest = new Database(getDbPath("test"), { readonly: true });
    try {
      const all = dest
        .prepare("SELECT key, value FROM settings")
        .all() as Array<{ key: string; value: string }>;
      const blob = JSON.stringify(all);
      // The blocklisted secret must not leak.
      expect(blob).not.toContain("SECRET-SHOULD-NOT-LEAK");
      expect(blob).not.toContain("SHOULD-NOT-OVERWRITE-SEED");
      expect(all.find((r) => r.key === "openrouter_api_key")).toBeUndefined();
      // The unique, non-seeded key from the legacy DB was inserted.
      const marker = all.find((r) => r.key === "legacy_test_marker");
      expect(marker?.value).toBe("from-journal-shadows");
      // The seed value for `ai_model` was preserved (createOrIgnore
      // leaves the existing dest row alone on a key collision).
      const aiModel = all.find((r) => r.key === "ai_model");
      expect(aiModel?.value).toBe("mistralai/mistral-7b-instruct");
    } finally {
      dest.close();
    }
  });

  it("is idempotent: a second run inserts 0 rows", async () => {
    const { sourcePath } = await writeLegacyFixture(workdir);

    const first = runScript(sourcePath);
    expect(first.status).toBe(0);

    const second = runScript(sourcePath);
    expect(second.status).toBe(0);
    // Re-runs must not duplicate rows — the second pass inserts 0
    // of every kind (the script reports "X / N" so X=0 is the
    // idempotency signature).
    expect(second.stdout).toMatch(/journal items inserted:.*0 \/ 1/);
    expect(second.stdout).toMatch(/raw items inserted:.*0 \/ 2/);
    expect(second.stdout).toMatch(/note items inserted:.*0 \/ 1/);
    // Validation must still pass on the second run.
    expect(second.stdout).toMatch(/Validation: OK/);
  });

  it("copies image files and creates content links between journal and raw entries", async () => {
    const { sourcePath, imagesDir } = await writeLegacyFixture(workdir);

    // Set DATA_DIR to a temp dir so getImagesDir() resolves under it.
    const dataDir = join(workdir, "data");
    await mkdir(dataDir, { recursive: true });

    const result = runScriptWithEnv(sourcePath, {
      ...process.env,
      DATA_DIR: dataDir,
      NODE_ENV: "test",
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/journal items inserted:.*1 \/ 1/);
    expect(result.stdout).toMatch(/raw items inserted:.*2 \/ 2/);
    expect(result.stdout).toMatch(/content links inserted:.*4/); // 2 raws × bidirectional
    expect(result.stdout).toMatch(/Images: copied 1, skipped 0/);

    // Verify dest images dir contains the copied file.
    const destImagesDir = join(dataDir, "images");
    const destImagePath = join(destImagesDir, "2026-01", "abc.webp");
    expect(existsSync(destImagePath)).toBe(true);

    // Verify content_links table has 4 rows. The script ran with
    // DATA_DIR=dataDir, so its DB lives under the temp dir — not at
    // the default getDbPath("test"). Resolve the same filename the
    // script wrote (mirrors getDbPath's test-env suffix) under the
    // overridden data dir.
    const workerId = process.env.VITEST_POOL_ID;
    const suffix = workerId ? `.test.${workerId}` : ".test";
    const destDbPath = join(dataDir, `shadowbrain${suffix}.db`);
    const dest = new Database(destDbPath, { readonly: true });
    try {
      const linkCount = (
        dest.prepare("SELECT COUNT(*) AS c FROM content_links").get() as {
          c: number;
        }
      ).c;
      expect(linkCount).toBe(4);

      // Verify links are bidirectional references.
      const links = dest.prepare("SELECT * FROM content_links").all() as Array<{
        id: string;
        source_id: string;
        target_id: string;
        link_type: string;
      }>;

      expect(links.every((l) => l.link_type === "references")).toBe(true);

      // Journal → raw links
      const journalToRaw = links.filter((l) => l.source_id === "je-1");
      expect(journalToRaw).toHaveLength(2);
      expect(journalToRaw.map((l) => l.target_id)).toEqual(
        expect.arrayContaining(["r1", "r2"])
      );

      // Raw → journal links
      const rawToJournal = links.filter((l) => l.target_id === "je-1");
      expect(rawToJournal).toHaveLength(2);
      expect(rawToJournal.map((l) => l.source_id)).toEqual(
        expect.arrayContaining(["r1", "r2"])
      );
    } finally {
      dest.close();
    }
  });

  it("is idempotent for images and links on second run", async () => {
    const { sourcePath, imagesDir } = await writeLegacyFixture(workdir);

    // Set DATA_DIR to a temp dir so getImagesDir() resolves under it.
    const dataDir = join(workdir, "data");
    await mkdir(dataDir, { recursive: true });

    const first = runScriptWithEnv(sourcePath, {
      ...process.env,
      DATA_DIR: dataDir,
      NODE_ENV: "test",
    });
    expect(first.status).toBe(0);
    expect(first.stdout).toMatch(/content links inserted:.*4/);
    expect(first.stdout).toMatch(/Images: copied 1, skipped 0/);

    const second = runScriptWithEnv(sourcePath, {
      ...process.env,
      DATA_DIR: dataDir,
      NODE_ENV: "test",
    });
    expect(second.status).toBe(0);
    // No new links or images should be inserted/copied.
    expect(second.stdout).toMatch(/content links inserted:.*0/);
    expect(second.stdout).toMatch(/Images: copied 0, skipped 1/); // Image already exists, so skipped
  });
});

function runScriptWithEnv(
  sourcePath: string,
  envOverrides: Record<string, string>
): {
  stdout: string;
  stderr: string;
  status: number;
} {
  const result = spawnSync(
    TSX,
    [SCRIPT, "--source", sourcePath, "--validate"],
    {
      cwd: PROJECT_ROOT,
      env: {
        ...process.env,
        ...envOverrides,
      },
      encoding: "utf-8",
    }
  );
  return {
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    status: result.status ?? -1,
  };
}
