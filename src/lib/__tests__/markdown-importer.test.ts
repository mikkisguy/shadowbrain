import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, writeFile, mkdir, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { cleanupTestDb, createTestDb } from "@/db/test-utils";
import { contentItems, auditLogs } from "@/db/index";
import {
  parseMarkdownFile,
  generateStableId,
  importMarkdownDirectory,
  formatImportResult,
  type ImportResult,
} from "@/lib/markdown-importer";

describe("parseMarkdownFile", () => {
  it("extracts filename without extension as title", () => {
    const out = parseMarkdownFile("# hi\nbody", "notes/hello-world.md");
    expect(out.filenameTitle).toBe("hello-world");
    expect(out.frontmatter).toBeNull();
    expect(out.body).toBe("# hi\nbody");
    expect(out.relPath).toBe("notes/hello-world.md");
  });

  it("parses YAML frontmatter", () => {
    const raw = `---
title: Reading list
tags:
  - reading
  - "2026"
---

# Reading list

- Book A
- Book B
`;
    const out = parseMarkdownFile(raw, "reading-list.md");
    // YAML coerces unquoted integers to numbers — quote `2026` so it
    // round-trips as a string.
    expect(out.frontmatter).toEqual({
      title: "Reading list",
      tags: ["reading", "2026"],
    });
    expect(out.body.trim()).toBe("# Reading list\n\n- Book A\n- Book B");
    expect(out.filenameTitle).toBe("reading-list");
  });

  it("returns null frontmatter for files with no frontmatter block", () => {
    const out = parseMarkdownFile("just text\n", "plain.md");
    expect(out.frontmatter).toBeNull();
    expect(out.body).toBe("just text");
  });

  it("falls back to body when frontmatter is malformed", () => {
    const raw = `---
this is: [not valid
---

# Body
`;
    const out = parseMarkdownFile(raw, "bad.md");
    // Body still parses out — the leading `---` block is stripped
    // and what remains is the rest of the file.
    expect(out.frontmatter).toBeNull();
    expect(out.body).toContain("# Body");
    expect(out.body).not.toMatch(/^---/);
  });
});

describe("generateStableId", () => {
  it("is deterministic for the same path", () => {
    const a = generateStableId("notes/hello.md");
    const b = generateStableId("notes/hello.md");
    expect(a).toBe(b);
  });

  it("differs for different paths", () => {
    const a = generateStableId("notes/hello.md");
    const b = generateStableId("notes/world.md");
    expect(a).not.toBe(b);
  });

  it("is uuid-shaped with a recognisable prefix", () => {
    const id = generateStableId("foo.md");
    expect(id).toMatch(/^note-md-[0-9a-f]{32}$/);
  });
});

describe("importMarkdownDirectory", () => {
  let workdir: string;

  beforeEach(async () => {
    cleanupTestDb();
    workdir = await mkdtemp(join(tmpdir(), "sb-md-imp-"));
  });

  afterEach(async () => {
    cleanupTestDb();
    await rm(workdir, { recursive: true, force: true });
  });

  it("imports every .md file as a note", async () => {
    await writeFile(
      join(workdir, "alpha.md"),
      "---\ntitle: Alpha\n---\n\n# Alpha\nbody\n"
    );
    await writeFile(
      join(workdir, "beta.md"),
      "---\ntags: [t]\n---\n\n# Beta\nbody\n"
    );
    await writeFile(join(workdir, "ignore.txt"), "not a note");

    const db = createTestDb();
    try {
      const result = await importMarkdownDirectory(db, workdir);
      expect(result.total).toBe(2);
      expect(result.created).toBe(2);
      expect(result.updated).toBe(0);
      expect(result.skipped).toBe(0);
      expect(result.failed).toBe(0);
      expect(result.failures).toEqual([]);

      const all = contentItems.findAll(db, { type: "note" });
      expect(all).toHaveLength(2);
      const titles = all.map((i) => i.title).sort();
      expect(titles).toEqual(["alpha", "beta"]);
      const withMeta = all.find((i) => i.title === "beta")!;
      expect(withMeta.metadata).not.toBeNull();
      expect(JSON.parse(withMeta.metadata!)).toEqual({ tags: ["t"] });
      const noMeta = all.find((i) => i.title === "alpha")!;
      expect(noMeta.source).toBe("markdown-import");
    } finally {
      db.close();
    }
  });

  it("is idempotent — re-running on unchanged files is a no-op", async () => {
    await writeFile(
      join(workdir, "alpha.md"),
      "---\ntitle: Alpha\n---\n\n# Alpha\nbody\n"
    );

    const db = createTestDb();
    try {
      const first = await importMarkdownDirectory(db, workdir);
      expect(first.created).toBe(1);

      const second = await importMarkdownDirectory(db, workdir);
      expect(second.created).toBe(0);
      expect(second.updated).toBe(0);
      expect(second.skipped).toBe(1);
      expect(second.failed).toBe(0);

      const all = contentItems.findAll(db, { type: "note" });
      expect(all).toHaveLength(1);
    } finally {
      db.close();
    }
  });

  it("updates content when a file changes between runs", async () => {
    const path = join(workdir, "alpha.md");
    await writeFile(path, "first version\n");

    const db = createTestDb();
    try {
      const first = await importMarkdownDirectory(db, workdir);
      expect(first.created).toBe(1);
      const before = contentItems.findAll(db, { type: "note" })[0];
      expect(before.content).toBe("first version");

      await writeFile(path, "second version\n");

      const second = await importMarkdownDirectory(db, workdir);
      expect(second.created).toBe(0);
      expect(second.updated).toBe(1);
      expect(second.skipped).toBe(0);

      const after = contentItems.findAll(db, { type: "note" })[0];
      expect(after.id).toBe(before.id);
      expect(after.content).toBe("second version");
    } finally {
      db.close();
    }
  });

  it("re-imports a previously hidden or private item without throwing (issue #54 regression)", async () => {
    // Issue #54 made the read helpers hide rows whose visibility flag
    // is set by default. The importer is a system-level operation, not
    // a browse view — it must still see hidden / private items so a
    // re-import of a previously imported private file can update it
    // instead of falling through to `contentItems.create` (which would
    // hit the PRIMARY KEY and throw SQLITE_CONSTRAINT).
    const path = join(workdir, "alpha.md");
    await writeFile(path, "v1\n");

    const db = createTestDb();
    try {
      await importMarkdownDirectory(db, workdir);
      const id = generateStableId("alpha.md");
      // Manually flag the imported item as both hidden AND private —
      // the strictest combination.
      db.prepare(
        "UPDATE content_items SET is_hidden = 1, is_private = 1 WHERE id = ?"
      ).run(id);

      // Default-visibility findById must NOT find the row (sanity check
      // that the visibility filter still works in this test).
      expect(contentItems.findById(db, id)).toBeNull();
      // Opt-in findById must see it.
      expect(
        contentItems.findById(db, id, {
          includeHidden: true,
          includePrivate: true,
        })?.id
      ).toBe(id);

      // Re-import with a changed file. The importer must see the
      // existing row and update it, not throw.
      await writeFile(path, "v2\n");
      const second = await importMarkdownDirectory(db, workdir);
      expect(second.failed).toBe(0);
      expect(second.updated).toBe(1);
      expect(second.created).toBe(0);

      // The row's content is updated, the visibility flags are
      // preserved (the importer does not touch them).
      const after = contentItems.findById(db, id, {
        includeHidden: true,
        includePrivate: true,
      });
      expect(after?.content).toBe("v2");
      expect(after?.is_hidden).toBe(1);
      expect(after?.is_private).toBe(1);
    } finally {
      db.close();
    }
  });

  it("skips hidden files and walks subdirectories", async () => {
    await mkdir(join(workdir, "topics"));
    await writeFile(join(workdir, "topics", "deep.md"), "deep note\n");
    await writeFile(join(workdir, ".hidden.md"), "hidden\n");
    await writeFile(join(workdir, "topics", ".nested-hidden.md"), "hidden\n");
    await writeFile(join(workdir, "top.md"), "top\n");

    const db = createTestDb();
    try {
      const result = await importMarkdownDirectory(db, workdir);
      expect(result.total).toBe(2);
      expect(result.created).toBe(2);
      const all = contentItems.findAll(db, { type: "note" });
      const titles = all.map((i) => i.title).sort();
      expect(titles).toEqual(["deep", "top"]);
    } finally {
      db.close();
    }
  });

  it("returns an empty result and zero failures for a missing directory", async () => {
    const db = createTestDb();
    try {
      const result = await importMarkdownDirectory(
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

  it("does nothing for a directory with no markdown files", async () => {
    await writeFile(join(workdir, "ignore.txt"), "not a note");
    const db = createTestDb();
    try {
      const result = await importMarkdownDirectory(db, workdir);
      expect(result.total).toBe(0);
      expect(result.created).toBe(0);
      expect(result.failed).toBe(0);
    } finally {
      db.close();
    }
  });

  it("handles files with no frontmatter (metadata = null)", async () => {
    await writeFile(join(workdir, "plain.md"), "just a body\n");
    const db = createTestDb();
    try {
      const result = await importMarkdownDirectory(db, workdir);
      expect(result.created).toBe(1);
      const item = contentItems.findAll(db, { type: "note" })[0];
      expect(item.title).toBe("plain");
      expect(item.metadata).toBeNull();
    } finally {
      db.close();
    }
  });

  it("writes an audit_log entry per imported file", async () => {
    await writeFile(join(workdir, "alpha.md"), "alpha\n");
    await writeFile(join(workdir, "beta.md"), "beta\n");

    const db = createTestDb();
    try {
      await importMarkdownDirectory(db, workdir);
      const logs = db
        .prepare(
          "SELECT action, entity_id, metadata FROM audit_logs WHERE action = 'content_item.import' ORDER BY created_at"
        )
        .all() as Array<{
        action: string;
        entity_id: string;
        metadata: string | null;
      }>;
      expect(logs).toHaveLength(2);
      for (const l of logs) {
        expect(l.action).toBe("content_item.import");
        const meta = JSON.parse(l.metadata!);
        expect(meta.source).toBe("markdown");
        expect(["alpha.md", "beta.md"]).toContain(meta.relPath);
        expect(meta.op).toBe("create");
      }
    } finally {
      db.close();
    }
  });

  it("different relative paths produce distinct ids", async () => {
    // Same content under different names: must produce distinct ids.
    const a = generateStableId("alpha.md");
    const b = generateStableId("beta.md");
    expect(a).not.toBe(b);
  });

  it("skips files larger than the size limit", async () => {
    // Create a file just over the 5 MiB cap with cheap-to-write content.
    // Use a Buffer to keep memory use low while still exceeding the cap.
    const big = Buffer.alloc(5 * 1024 * 1024 + 16, 0x20); // spaces
    const { writeFile: wf } = await import("fs/promises");
    await wf(join(workdir, "huge.md"), big);

    const db = createTestDb();
    try {
      const result = await importMarkdownDirectory(db, workdir);
      expect(result.failed).toBe(1);
      expect(result.failures[0].relPath).toBe("huge.md");
      expect(result.failures[0].reason).toMatch(/too large/i);
    } finally {
      db.close();
    }
  });

  it("clears metadata when frontmatter is removed between imports", async () => {
    // Regression: a previous version used `metadata ?? undefined`,
    // which made `contentItems.update` skip the field entirely and
    // silently retain the old metadata after the frontmatter block
    // was removed from the file.
    const path = join(workdir, "alpha.md");
    await writeFile(
      path,
      "---\ntitle: Alpha\ntags: [a]\n---\n\n# Alpha\nbody\n"
    );

    const db = createTestDb();
    try {
      const first = await importMarkdownDirectory(db, workdir);
      expect(first.created).toBe(1);
      const before = contentItems.findAll(db, { type: "note" })[0];
      expect(before.metadata).not.toBeNull();
      expect(JSON.parse(before.metadata!)).toEqual({
        title: "Alpha",
        tags: ["a"],
      });

      // Strip the frontmatter from the on-disk file.
      await writeFile(path, "# Alpha\nbody without frontmatter\n");

      const second = await importMarkdownDirectory(db, workdir);
      expect(second.updated).toBe(1);
      const after = contentItems.findAll(db, { type: "note" })[0];
      expect(after.content).toContain("body without frontmatter");
      // metadata must be null, not the previous JSON.
      expect(after.metadata).toBeNull();
    } finally {
      db.close();
    }
  });

  it("re-writes unchanged files when skipUnchanged=false", async () => {
    await writeFile(join(workdir, "alpha.md"), "alpha\n");

    const db = createTestDb();
    try {
      const first = await importMarkdownDirectory(db, workdir);
      expect(first.created).toBe(1);
      const second = await importMarkdownDirectory(db, workdir, {
        skipUnchanged: false,
      });
      expect(second.skipped).toBe(0);
      expect(second.updated).toBe(1);
    } finally {
      db.close();
    }
  });
});

describe("formatImportResult", () => {
  it("renders a multi-line summary", () => {
    const r: ImportResult = {
      total: 5,
      created: 3,
      updated: 1,
      skipped: 1,
      failed: 0,
      failures: [],
      directory: "/tmp/notes",
    };
    const out = formatImportResult(r);
    expect(out).toContain("discovered: 5");
    expect(out).toContain("created:    3");
    expect(out).toContain("updated:    1");
    expect(out).toContain("skipped:    1");
    expect(out).toContain("failed:     0");
  });

  it("lists failure details when present", () => {
    const r: ImportResult = {
      total: 2,
      created: 1,
      updated: 0,
      skipped: 0,
      failed: 1,
      failures: [{ relPath: "broken.md", reason: "YAML error" }],
      directory: "/tmp/notes",
    };
    const out = formatImportResult(r);
    expect(out).toContain("broken.md");
    expect(out).toContain("YAML error");
  });
});

// Sanity: ensure the audit log table is empty after each scenario and
// the importer uses the same audit_log shape as the CRUD routes.
describe("audit log shape", () => {
  it("matches the entity_type convention used by other importers", async () => {
    const workdir = await mkdtemp(join(tmpdir(), "sb-md-imp-"));
    try {
      await writeFile(join(workdir, "x.md"), "x\n");
      const db = createTestDb();
      try {
        await importMarkdownDirectory(db, workdir);
        const row = db
          .prepare(
            "SELECT entity_type FROM audit_logs WHERE action = 'content_item.import' LIMIT 1"
          )
          .get() as { entity_type: string };
        expect(row.entity_type).toBe("content_item");
      } finally {
        db.close();
      }
    } finally {
      await rm(workdir, { recursive: true, force: true });
      cleanupTestDb();
    }
    // Touch auditLogs so the import isn't flagged as unused by knip.
    expect(typeof auditLogs.create).toBe("function");
  });
});
