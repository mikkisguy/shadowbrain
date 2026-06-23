import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, writeFile, mkdir, rm, unlink } from "fs/promises";
import { tmpdir } from "os";
import { join, sep } from "path";
import { cleanupTestDb, createTestDb } from "@/db/test-utils";
import { contentItems, contentTags } from "@/db/index";
import {
  generateDocsId,
  categoryTagForRelPath,
  syncDocsDirectory,
  formatDocsSyncResult,
  DOCS_SYNC_SOURCE,
  type DocsSyncResult,
} from "@/lib/docs-sync";

describe("generateDocsId", () => {
  it("is deterministic for the same path", () => {
    expect(generateDocsId("getting-started.md")).toBe(
      generateDocsId("getting-started.md")
    );
  });

  it("differs for different paths", () => {
    expect(generateDocsId("a.md")).not.toBe(generateDocsId("b.md"));
  });

  it("is uuid-shaped with a docs-sync prefix", () => {
    expect(generateDocsId("foo.md")).toMatch(/^docs-sync-[0-9a-f]{32}$/);
  });

  it("does not collide with the markdown importer prefix", () => {
    // A doc and a note that share a relative path must target distinct rows.
    expect(generateDocsId("hello.md")).not.toMatch(/^note-md-/);
  });
});

describe("categoryTagForRelPath", () => {
  it("uses the filename stem for a top-level file", () => {
    expect(categoryTagForRelPath("getting-started.md")).toBe(
      "docs:getting-started"
    );
  });

  it("uses the top-level directory for a nested file", () => {
    expect(categoryTagForRelPath("api/endpoints/auth.md")).toBe("docs:api");
    expect(categoryTagForRelPath("agents/domain.md")).toBe("docs:agents");
  });

  it("handles deeply nested files by the first path segment", () => {
    expect(
      categoryTagForRelPath("superpowers/specs/2026-06-19-design.md")
    ).toBe("docs:superpowers");
  });
});

describe("syncDocsDirectory", () => {
  let workdir: string;

  beforeEach(async () => {
    cleanupTestDb();
    workdir = await mkdtemp(join(tmpdir(), "sb-docs-sync-"));
  });

  afterEach(async () => {
    cleanupTestDb();
    await rm(workdir, { recursive: true, force: true });
  });

  it("imports every .md file as a docs-sync note with the right fields", async () => {
    // Use a "docs" subdir so the file_path metadata reads docs/...
    // (mirrors real usage where the sync root is named "docs").
    const docsDir = join(workdir, "docs");
    await mkdir(docsDir);
    await writeFile(
      join(docsDir, "getting-started.md"),
      "---\ntitle: Getting Started\n---\n\n# Getting Started\nbody\n"
    );
    await writeFile(join(docsDir, "deployment.md"), "# Deployment\nbody\n");

    const db = createTestDb();
    try {
      const result = await syncDocsDirectory(db, docsDir);
      expect(result.total).toBe(2);
      expect(result.created).toBe(2);
      expect(result.failed).toBe(0);

      const all = contentItems.findAll(db, { type: "note" });
      expect(all).toHaveLength(2);
      for (const item of all) {
        expect(item.source).toBe(DOCS_SYNC_SOURCE);
      }

      const gs = all.find((i) => i.title === "getting-started")!;
      expect(gs).toBeDefined();
      // Content preserves the full markdown including frontmatter.
      expect(gs.content).toContain("---");
      expect(gs.content).toContain("title: Getting Started");
      expect(gs.content).toContain("# Getting Started");
      // Metadata carries the file path.
      const meta = JSON.parse(gs.metadata!);
      expect(meta.file_path).toBe("docs/getting-started.md");
    } finally {
      db.close();
    }
  });

  it("uses the directory basename in file_path, not the absolute dir", async () => {
    // The workdir basename is NOT "docs" — verify the metadata uses it.
    await writeFile(join(workdir, "note.md"), "body\n");
    const db = createTestDb();
    try {
      await syncDocsDirectory(db, workdir);
      const item = contentItems.findAll(db, { type: "note" })[0];
      const meta = JSON.parse(item.metadata!);
      // Should be <basename>/note.md — proves it uses basename(root).
      expect(meta.file_path).toBe(`${workdir.split(sep).pop()}/note.md`);
    } finally {
      db.close();
    }
  });

  it("tags every doc with project, docs, and category tags", async () => {
    await mkdir(join(workdir, "api"));
    await writeFile(join(workdir, "getting-started.md"), "gs\n");
    await writeFile(join(workdir, "api", "openapi.md"), "api\n");

    const db = createTestDb();
    try {
      await syncDocsDirectory(db, workdir);

      const gsId = generateDocsId("getting-started.md");
      const apiId = generateDocsId("api/openapi.md");

      const gsTags = contentTags
        .findByContent(db, gsId)
        .map((t) => t.name)
        .sort();
      expect(gsTags).toEqual([
        "docs",
        "docs:getting-started",
        "project:shadowbrain",
      ]);

      const apiTags = contentTags
        .findByContent(db, apiId)
        .map((t) => t.name)
        .sort();
      expect(apiTags).toEqual(["docs", "docs:api", "project:shadowbrain"]);
    } finally {
      db.close();
    }
  });

  it("is idempotent — re-running on unchanged files is a no-op", async () => {
    await writeFile(join(workdir, "alpha.md"), "alpha\n");

    const db = createTestDb();
    try {
      const first = await syncDocsDirectory(db, workdir);
      expect(first.created).toBe(1);
      expect(first.skipped).toBe(0);

      const second = await syncDocsDirectory(db, workdir);
      expect(second.created).toBe(0);
      expect(second.updated).toBe(0);
      expect(second.skipped).toBe(1);
      expect(second.deleted).toBe(0);

      const all = contentItems.findAll(db, { type: "note" });
      expect(all).toHaveLength(1);
    } finally {
      db.close();
    }
  });

  it("updates content when a file changes between runs", async () => {
    const path = join(workdir, "alpha.md");
    await writeFile(path, "first\n");

    const db = createTestDb();
    try {
      await syncDocsDirectory(db, workdir);
      const before = contentItems.findAll(db, { type: "note" })[0];
      expect(before.content).toBe("first\n");

      await writeFile(path, "second\n");
      const second = await syncDocsDirectory(db, workdir);
      expect(second.updated).toBe(1);
      expect(second.skipped).toBe(0);

      const after = contentItems.findAll(db, { type: "note" })[0];
      expect(after.id).toBe(before.id);
      expect(after.content).toBe("second\n");
    } finally {
      db.close();
    }
  });

  it("self-heals removed tag associations on an unchanged file", async () => {
    await writeFile(join(workdir, "alpha.md"), "alpha\n");
    const db = createTestDb();
    try {
      await syncDocsDirectory(db, workdir);
      const id = generateDocsId("alpha.md");

      // Manually strip all tag associations from the synced doc.
      const initialTags = contentTags.findByContent(db, id);
      expect(initialTags.length).toBeGreaterThan(0);
      db.prepare("DELETE FROM content_tags WHERE content_id = ?").run(id);
      expect(contentTags.findByContent(db, id)).toHaveLength(0);

      // Re-sync without changing the file — tags must be restored even
      // though the content is unchanged (skipped).
      const second = await syncDocsDirectory(db, workdir);
      expect(second.skipped).toBe(1);
      expect(second.updated).toBe(0);
      const restored = contentTags
        .findByContent(db, id)
        .map((t) => t.name)
        .sort();
      // Assert identity, not just count — a regression that restored the
      // wrong tags would pass a length-only check.
      expect(restored).toEqual(["docs", "docs:alpha", "project:shadowbrain"]);
    } finally {
      db.close();
    }
  });

  it("re-syncs a previously hidden/private doc without crashing (issue #54 regression)", async () => {
    // The read helpers hide rows whose visibility flag is set by default.
    // The syncer is a system-level operation, not a browse view — it must
    // still see hidden / private docs so a re-sync updates them in place
    // instead of falling through to contentItems.create (PRIMARY KEY crash).
    const path = join(workdir, "alpha.md");
    await writeFile(path, "v1\n");

    const db = createTestDb();
    try {
      await syncDocsDirectory(db, workdir);
      const id = generateDocsId("alpha.md");
      // Flag the synced doc as both hidden AND private — strictest case.
      db.prepare(
        "UPDATE content_items SET is_hidden = 1, is_private = 1 WHERE id = ?"
      ).run(id);

      // Default-visibility findById must NOT find it (sanity check).
      expect(contentItems.findById(db, id)).toBeNull();
      expect(
        contentItems.findById(db, id, {
          includeHidden: true,
          includePrivate: true,
        })?.id
      ).toBe(id);

      // Re-sync with a changed file — must update, not throw, and the
      // visibility flags must be preserved (the syncer does not touch them).
      await writeFile(path, "v2\n");
      const second = await syncDocsDirectory(db, workdir);
      expect(second.failed).toBe(0);
      expect(second.updated).toBe(1);

      const after = contentItems.findById(db, id, {
        includeHidden: true,
        includePrivate: true,
      });
      expect(after?.content).toBe("v2\n");
      expect(after?.is_hidden).toBe(1);
      expect(after?.is_private).toBe(1);
    } finally {
      db.close();
    }
  });

  it("re-writes unchanged files when skipUnchanged=false (--force)", async () => {
    await writeFile(join(workdir, "alpha.md"), "alpha\n");
    const db = createTestDb();
    try {
      await syncDocsDirectory(db, workdir);
      const second = await syncDocsDirectory(db, workdir, {
        skipUnchanged: false,
      });
      expect(second.skipped).toBe(0);
      expect(second.updated).toBe(1);
    } finally {
      db.close();
    }
  });

  it("does not write anything in dry-run mode", async () => {
    await writeFile(join(workdir, "alpha.md"), "alpha\n");
    await writeFile(join(workdir, "beta.md"), "beta\n");

    const db = createTestDb();
    try {
      const result = await syncDocsDirectory(db, workdir, { dryRun: true });
      expect(result.dryRun).toBe(true);
      expect(result.created).toBe(2);
      // Nothing was actually written.
      expect(contentItems.findAll(db, { type: "note" })).toHaveLength(0);
      expect(db.prepare("SELECT COUNT(*) as c FROM tags").get()).toEqual({
        c: 0,
      });
    } finally {
      db.close();
    }
  });

  it("reports would-update in dry-run when content differs", async () => {
    const path = join(workdir, "alpha.md");
    await writeFile(path, "first\n");
    const db = createTestDb();
    try {
      await syncDocsDirectory(db, workdir); // real import
      await writeFile(path, "second\n");
      const dry = await syncDocsDirectory(db, workdir, { dryRun: true });
      expect(dry.created).toBe(0);
      expect(dry.updated).toBe(1);
      expect(dry.skipped).toBe(0);
      // Still unchanged in the DB (dry-run wrote nothing).
      expect(contentItems.findAll(db, { type: "note" })[0].content).toBe(
        "first\n"
      );
    } finally {
      db.close();
    }
  });

  it("reports would-delete in dry-run for pruned files", async () => {
    const path = join(workdir, "alpha.md");
    await writeFile(path, "alpha\n");
    const db = createTestDb();
    try {
      await syncDocsDirectory(db, workdir); // real import
      await unlink(path); // remove from disk

      const dry = await syncDocsDirectory(db, workdir, { dryRun: true });
      expect(dry.deleted).toBe(1);
      // Dry-run did not delete — row still present.
      expect(contentItems.findAll(db, { type: "note" })).toHaveLength(1);
    } finally {
      db.close();
    }
  });

  it("prunes content_items whose source files have been deleted", async () => {
    const alphaPath = join(workdir, "alpha.md");
    const betaPath = join(workdir, "beta.md");
    await writeFile(alphaPath, "alpha\n");
    await writeFile(betaPath, "beta\n");

    const db = createTestDb();
    try {
      await syncDocsDirectory(db, workdir);
      expect(contentItems.findAll(db, { type: "note" })).toHaveLength(2);

      await unlink(alphaPath);
      const second = await syncDocsDirectory(db, workdir);
      expect(second.deleted).toBe(1);
      expect(second.created).toBe(0);

      const remaining = contentItems.findAll(db, { type: "note" });
      expect(remaining).toHaveLength(1);
      expect(remaining[0].title).toBe("beta");
    } finally {
      db.close();
    }
  });

  it("only prunes docs-sync rows, not other sources", async () => {
    await writeFile(join(workdir, "alpha.md"), "alpha\n");
    const db = createTestDb();
    try {
      await syncDocsDirectory(db, workdir);
      // Insert an unrelated note with a different source.
      contentItems.create(db, {
        id: "manual-note-1",
        type: "note",
        title: "manual",
        content: "hi",
        source: "manual",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      await syncDocsDirectory(db, workdir);
      const all = contentItems.findAll(db, { type: "note" });
      // Both the docs-sync row and the manual row survive.
      expect(all).toHaveLength(2);
      expect(all.some((i) => i.source === "manual")).toBe(true);
    } finally {
      db.close();
    }
  });

  it("walks subdirectories and skips hidden files", async () => {
    await mkdir(join(workdir, "api"));
    await writeFile(join(workdir, "api", "deep.md"), "deep\n");
    await writeFile(join(workdir, ".hidden.md"), "hidden\n");
    await writeFile(join(workdir, "top.md"), "top\n");

    const db = createTestDb();
    try {
      const result = await syncDocsDirectory(db, workdir);
      expect(result.total).toBe(2);
      const titles = contentItems
        .findAll(db, { type: "note" })
        .map((i) => i.title)
        .sort();
      expect(titles).toEqual(["deep", "top"]);
    } finally {
      db.close();
    }
  });

  it("returns a failure result for a missing directory", async () => {
    const db = createTestDb();
    try {
      const result = await syncDocsDirectory(
        db,
        join(workdir, "does-not-exist")
      );
      expect(result.total).toBe(0);
      expect(result.failed).toBe(1);
      expect(result.failures[0].relPath).toContain("does-not-exist");
    } finally {
      db.close();
    }
  });

  it("writes an audit_log entry per created / updated / pruned doc", async () => {
    const alphaPath = join(workdir, "alpha.md");
    await writeFile(alphaPath, "v1\n");
    const db = createTestDb();
    try {
      await syncDocsDirectory(db, workdir);
      const createLogs = db
        .prepare(
          "SELECT metadata FROM audit_logs WHERE action = 'content_item.import'"
        )
        .all() as Array<{ metadata: string | null }>;
      expect(createLogs).toHaveLength(1);
      expect(JSON.parse(createLogs[0].metadata!).source).toBe(DOCS_SYNC_SOURCE);

      // Update path → audit op "update".
      await writeFile(alphaPath, "v2\n");
      await syncDocsDirectory(db, workdir);
      const updateLogs = db
        .prepare(
          "SELECT metadata FROM audit_logs WHERE action = 'content_item.import'"
        )
        .all() as Array<{ metadata: string | null }>;
      const ops = updateLogs.map((l) => JSON.parse(l.metadata!).op);
      expect(ops).toContain("create");
      expect(ops).toContain("update");

      // Prune path → audit action "content_item.delete".
      await unlink(alphaPath);
      await syncDocsDirectory(db, workdir);
      const deleteLogs = db
        .prepare(
          "SELECT action, metadata FROM audit_logs WHERE action = 'content_item.delete'"
        )
        .all() as Array<{ action: string; metadata: string | null }>;
      expect(deleteLogs).toHaveLength(1);
      const pruneMeta = JSON.parse(deleteLogs[0].metadata!);
      expect(pruneMeta.source).toBe(DOCS_SYNC_SOURCE);
      expect(pruneMeta.op).toBe("prune");
      // The prune audit log records the file path so the trail can answer
      // "what was deleted?" (the id alone is an opaque hash).
      expect(pruneMeta.file_path).toContain("alpha.md");
    } finally {
      db.close();
    }
  });

  it("does not double-count docs-sync rows when other sources exist", async () => {
    await writeFile(join(workdir, "alpha.md"), "alpha\n");
    const db = createTestDb();
    try {
      await syncDocsDirectory(db, workdir);
      // Add a manual note that shares nothing with docs.
      contentItems.create(db, {
        id: "manual-1",
        type: "note",
        title: "manual",
        content: "x",
        source: "manual",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      // Re-sync — the manual note must not be counted as a deletion.
      const result = await syncDocsDirectory(db, workdir);
      expect(result.deleted).toBe(0);
      expect(result.skipped).toBe(1);
    } finally {
      db.close();
    }
  });
});

describe("formatDocsSyncResult", () => {
  it("renders a multi-line summary", () => {
    const r: DocsSyncResult = {
      total: 5,
      created: 3,
      updated: 1,
      skipped: 1,
      deleted: 0,
      failed: 0,
      failures: [],
      directory: "/repo/docs",
      dryRun: false,
    };
    const out = formatDocsSyncResult(r);
    expect(out).toContain("discovered: 5");
    expect(out).toContain("created:    3");
    expect(out).toContain("deleted:    0");
  });

  it("marks the output as a dry run when applicable", () => {
    const r: DocsSyncResult = {
      total: 1,
      created: 1,
      updated: 0,
      skipped: 0,
      deleted: 0,
      failed: 0,
      failures: [],
      directory: "/repo/docs",
      dryRun: true,
    };
    expect(formatDocsSyncResult(r)).toContain("(dry run)");
  });

  it("lists failure details when present", () => {
    const r: DocsSyncResult = {
      total: 2,
      created: 1,
      updated: 0,
      skipped: 0,
      deleted: 0,
      failed: 1,
      failures: [{ relPath: "broken.md", reason: "read error" }],
      directory: "/repo/docs",
      dryRun: false,
    };
    const out = formatDocsSyncResult(r);
    expect(out).toContain("broken.md");
    expect(out).toContain("read error");
  });
});
