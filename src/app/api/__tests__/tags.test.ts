import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  authedGet,
  authedRequest,
  cleanupTestDb,
  createTestDb,
} from "@/db/test-utils";
import { getDb, contentItems, contentTags, tags } from "@/db/index";
import { GET, POST } from "@/app/api/tags/route";
import { PATCH, DELETE } from "@/app/api/tags/[id]/route";
import { POST as POST_MERGE } from "@/app/api/tags/[id]/merge/route";
import { POST as POST_DELETE_UNUSED } from "@/app/api/tags/delete-unused/route";

const NOW = () => new Date().toISOString();

function makeId() {
  return crypto.randomUUID();
}

function makeContentItem(): string {
  const db = getDb();
  const now = NOW();
  const id = makeId();
  contentItems.create(db, {
    id,
    type: "note",
    title: "test item",
    content: "test content",
    source: "manual",
    created_at: now,
    updated_at: now,
  });
  return id;
}

async function createTag(name: string): Promise<{
  id: string;
  name: string;
  color: string | null;
  created_at: string;
}> {
  const res = await POST(
    await authedRequest("http://localhost/api/tags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    })
  );
  expect(res.status).toBe(201);
  return res.json();
}

describe("/api/tags", () => {
  beforeEach(() => {
    cleanupTestDb();
    createTestDb().close();
  });

  afterEach(() => {
    cleanupTestDb();
  });

  it("returns an empty list when no tags exist", async () => {
    const res = await GET(await authedGet("http://localhost/api/tags"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.tags).toEqual([]);
    expect(json.total).toBe(0);
  });

  it("creates a tag and returns it with 201", async () => {
    const res = await POST(
      await authedRequest("http://localhost/api/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "alpha" }),
      })
    );
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.name).toBe("alpha");
    expect(typeof json.id).toBe("string");
    expect(typeof json.created_at).toBe("string");
  });

  it("lists all tags with usage counts", async () => {
    const a = await createTag("alpha");
    const b = await createTag("beta");

    // alpha: 2 usages on a single item; beta: 1 usage on a separate item.
    const itemA = makeContentItem();
    const itemB = makeContentItem();
    const db = getDb();
    const now = NOW();
    contentTags.addTag(db, itemA, a.id, now);
    contentTags.addTag(db, itemA, a.id, now); // duplicate add is a no-op (INSERT OR IGNORE)
    contentTags.addTag(db, itemB, b.id, now);

    // Add a third tag with zero usages to confirm zero-count tags are
    // included in the listing.
    await createTag("unused");

    const res = await GET(await authedGet("http://localhost/api/tags"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.total).toBe(3);

    const byName = Object.fromEntries(
      (json.tags as Array<{ name: string; count: number }>).map((t) => [
        t.name,
        t.count,
      ])
    );
    expect(byName.alpha).toBe(1);
    expect(byName.beta).toBe(1);
    expect(byName.unused).toBe(0);
  });

  it("rejects duplicate tag names with 409", async () => {
    await createTag("alpha");

    const dup = await POST(
      await authedRequest("http://localhost/api/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "alpha" }),
      })
    );
    expect(dup.status).toBe(409);
    const dupJson = await dup.json();
    expect(dupJson.error.code).toBe("CONFLICT");
  });

  it("treats duplicate names as case-insensitive (COLLATE NOCASE)", async () => {
    await createTag("alpha");

    const dup = await POST(
      await authedRequest("http://localhost/api/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "ALPHA" }),
      })
    );
    expect(dup.status).toBe(409);
  });

  it("rejects tag names with special characters", async () => {
    const res = await POST(
      await authedRequest("http://localhost/api/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "bad/name!" }),
      })
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects tag names longer than 64 characters", async () => {
    const res = await POST(
      await authedRequest("http://localhost/api/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "a".repeat(65) }),
      })
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects empty tag names", async () => {
    const res = await POST(
      await authedRequest("http://localhost/api/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "   " }),
      })
    );
    expect(res.status).toBe(400);
  });

  it("trims surrounding whitespace from tag names", async () => {
    const res = await POST(
      await authedRequest("http://localhost/api/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "  alpha  " }),
      })
    );
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.name).toBe("alpha");
  });

  it("returns 400 for invalid JSON body", async () => {
    const res = await POST(
      await authedRequest("http://localhost/api/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{invalid-json",
      })
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.code).toBe("VALIDATION_ERROR");
  });
});

describe("/api/tags/[id]", () => {
  beforeEach(() => {
    cleanupTestDb();
    createTestDb().close();
  });

  afterEach(() => {
    cleanupTestDb();
  });

  it("renames a tag", async () => {
    const created = await createTag("alpha");

    const res = await PATCH(
      await authedRequest(`http://localhost/api/tags/${created.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "alphabet" }),
      }),
      { params: Promise.resolve({ id: created.id }) }
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.name).toBe("alphabet");
    expect(json.id).toBe(created.id);
  });

  it("allows a case-only rename (changes display case, no 409)", async () => {
    const created = await createTag("alpha");

    const res = await PATCH(
      await authedRequest(`http://localhost/api/tags/${created.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "ALPHA" }),
      }),
      { params: Promise.resolve({ id: created.id }) }
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    // The stored name reflects the new case — this is a real rename
    // (display case changes), not a no-op.
    expect(json.name).toBe("ALPHA");
  });

  it("treats a rename to the exact same name (same case) as a no-op", async () => {
    const created = await createTag("alpha");
    const db = getDb();
    const beforeAuditCount = (
      db.prepare("SELECT COUNT(*) as c FROM audit_logs").get() as { c: number }
    ).c;

    const res = await PATCH(
      await authedRequest(`http://localhost/api/tags/${created.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "alpha" }),
      }),
      { params: Promise.resolve({ id: created.id }) }
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.name).toBe("alpha");
    // The exact-string-equal path is a true no-op — no audit log row.
    const afterAuditCount = (
      db.prepare("SELECT COUNT(*) as c FROM audit_logs").get() as { c: number }
    ).c;
    expect(afterAuditCount).toBe(beforeAuditCount);
  });

  it("returns 404 when renaming a non-existent tag", async () => {
    const id = makeId();
    const res = await PATCH(
      await authedRequest(`http://localhost/api/tags/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "beta" }),
      }),
      { params: Promise.resolve({ id }) }
    );
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error.code).toBe("NOT_FOUND");
  });

  it("returns 409 when renaming to a name already used by another tag", async () => {
    const alpha = await createTag("alpha");
    await createTag("beta");

    const res = await PATCH(
      await authedRequest(`http://localhost/api/tags/${alpha.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "beta" }),
      }),
      { params: Promise.resolve({ id: alpha.id }) }
    );
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error.code).toBe("CONFLICT");
  });

  it("returns 400 for invalid name on rename", async () => {
    const created = await createTag("alpha");
    const res = await PATCH(
      await authedRequest(`http://localhost/api/tags/${created.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "bad/name" }),
      }),
      { params: Promise.resolve({ id: created.id }) }
    );
    expect(res.status).toBe(400);
  });

  it("deletes a tag and cascades to remove it from content_tags", async () => {
    const created = await createTag("alpha");
    const itemId = makeContentItem();
    const db = getDb();
    const now = NOW();
    contentTags.addTag(db, itemId, created.id, now);

    // Sanity: tag is attached.
    expect(
      (contentTags.findByContent(db, itemId) as Array<{ id: string }>).some(
        (t) => t.id === created.id
      )
    ).toBe(true);

    const res = await DELETE(
      await authedRequest(`http://localhost/api/tags/${created.id}`),
      {
        params: Promise.resolve({ id: created.id }),
      }
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.id).toBe(created.id);

    // Tag is gone.
    expect(tags.findById(db, created.id)).toBeUndefined();
    // Cascade: the content_tags row was removed automatically.
    expect(contentTags.findByContent(db, itemId)).toEqual([]);
  });

  it("returns 404 when deleting a non-existent tag", async () => {
    const id = makeId();
    const res = await DELETE(
      await authedRequest(`http://localhost/api/tags/${id}`),
      {
        params: Promise.resolve({ id }),
      }
    );
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error.code).toBe("NOT_FOUND");
  });

  it("returns 400 for invalid JSON on PATCH", async () => {
    const created = await createTag("alpha");
    const res = await PATCH(
      await authedRequest(`http://localhost/api/tags/${created.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: "{invalid-json",
      }),
      { params: Promise.resolve({ id: created.id }) }
    );
    expect(res.status).toBe(400);
  });
});

describe("POST /api/tags/[id]/merge", () => {
  beforeEach(() => {
    cleanupTestDb();
    createTestDb().close();
  });

  afterEach(() => {
    cleanupTestDb();
  });

  it("re-points content_tags from source to target and deletes the source", async () => {
    const source = await createTag("alpha");
    const target = await createTag("beta");
    const itemA = makeContentItem();
    const itemB = makeContentItem();
    const db = getDb();
    const now = NOW();
    contentTags.addTag(db, itemA, source.id, now);
    contentTags.addTag(db, itemB, source.id, now);

    const res = await POST_MERGE(
      await authedRequest(`http://localhost/api/tags/${source.id}/merge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetId: target.id }),
      }),
      { params: Promise.resolve({ id: source.id }) }
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.id).toBe(target.id);
    expect(json.name).toBe("beta");
    expect(json.count).toBe(2);

    expect(tags.findById(db, source.id)).toBeUndefined();
    const itemATags = contentTags.findByContent(db, itemA) as Array<{
      id: string;
    }>;
    const itemBTags = contentTags.findByContent(db, itemB) as Array<{
      id: string;
    }>;
    expect(itemATags).toHaveLength(1);
    expect(itemATags[0].id).toBe(target.id);
    expect(itemBTags).toHaveLength(1);
    expect(itemBTags[0].id).toBe(target.id);
  });

  it("dedupes when the target already tags an item", async () => {
    const source = await createTag("alpha");
    const target = await createTag("beta");
    const itemId = makeContentItem();
    const db = getDb();
    const now = NOW();
    contentTags.addTag(db, itemId, source.id, now);
    contentTags.addTag(db, itemId, target.id, now);

    const res = await POST_MERGE(
      await authedRequest(`http://localhost/api/tags/${source.id}/merge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetId: target.id }),
      }),
      { params: Promise.resolve({ id: source.id }) }
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.count).toBe(1);
    expect(contentTags.findByContent(db, itemId)).toHaveLength(1);
  });

  it("returns 400 when merging a tag into itself", async () => {
    const source = await createTag("alpha");
    const res = await POST_MERGE(
      await authedRequest(`http://localhost/api/tags/${source.id}/merge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetId: source.id }),
      }),
      { params: Promise.resolve({ id: source.id }) }
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 404 when the source tag is missing", async () => {
    const target = await createTag("beta");
    const missingId = makeId();
    const res = await POST_MERGE(
      await authedRequest(`http://localhost/api/tags/${missingId}/merge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetId: target.id }),
      }),
      { params: Promise.resolve({ id: missingId }) }
    );
    expect(res.status).toBe(404);
  });

  it("returns 404 when the target tag is missing", async () => {
    const source = await createTag("alpha");
    const missingId = makeId();
    const res = await POST_MERGE(
      await authedRequest(`http://localhost/api/tags/${source.id}/merge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetId: missingId }),
      }),
      { params: Promise.resolve({ id: source.id }) }
    );
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error.code).toBe("NOT_FOUND");
  });

  it("writes a tag.merge audit log row", async () => {
    const source = await createTag("alpha");
    const target = await createTag("beta");
    const itemId = makeContentItem();
    const db = getDb();
    contentTags.addTag(db, itemId, source.id, NOW());

    const res = await POST_MERGE(
      await authedRequest(`http://localhost/api/tags/${source.id}/merge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetId: target.id }),
      }),
      { params: Promise.resolve({ id: source.id }) }
    );
    expect(res.status).toBe(200);

    const audit = db
      .prepare(
        "SELECT action, metadata FROM audit_logs WHERE action = 'tag.merge' ORDER BY created_at DESC LIMIT 1"
      )
      .get() as { action: string; metadata: string };
    expect(audit.action).toBe("tag.merge");
    const metadata = JSON.parse(audit.metadata) as {
      source: string;
      target: string;
      affected: number;
    };
    expect(metadata.source).toBe("alpha");
    expect(metadata.target).toBe("beta");
    expect(metadata.affected).toBe(1);
  });
});

describe("POST /api/tags/delete-unused", () => {
  beforeEach(() => {
    cleanupTestDb();
    createTestDb().close();
  });

  afterEach(() => {
    cleanupTestDb();
  });

  it("deletes every tag with zero usages", async () => {
    const used = await createTag("alpha");
    await createTag("unused-a");
    await createTag("unused-b");
    const db = getDb();
    contentTags.addTag(db, makeContentItem(), used.id, NOW());

    const res = await POST_DELETE_UNUSED(
      await authedRequest("http://localhost/api/tags/delete-unused", {
        method: "POST",
      })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.deleted).toBe(2);

    const remaining = tags.findAll(db).map((row) => row.name);
    expect(remaining).toEqual(["alpha"]);
  });

  it("writes a tag.delete audit row per removed tag", async () => {
    await createTag("unused");
    const db = getDb();
    const before = (
      db.prepare("SELECT COUNT(*) as c FROM audit_logs").get() as { c: number }
    ).c;

    const res = await POST_DELETE_UNUSED(
      await authedRequest("http://localhost/api/tags/delete-unused", {
        method: "POST",
      })
    );
    expect(res.status).toBe(200);

    const after = (
      db.prepare("SELECT COUNT(*) as c FROM audit_logs").get() as { c: number }
    ).c;
    expect(after - before).toBe(1);

    const audit = db
      .prepare(
        "SELECT action, metadata FROM audit_logs WHERE action = 'tag.delete' ORDER BY created_at DESC LIMIT 1"
      )
      .get() as { action: string; metadata: string };
    expect(audit.action).toBe("tag.delete");
    expect(JSON.parse(audit.metadata)).toMatchObject({
      name: "unused",
      bulk: true,
    });
  });

  it("returns deleted: 0 when every tag is in use", async () => {
    const used = await createTag("alpha");
    const db = getDb();
    contentTags.addTag(db, makeContentItem(), used.id, NOW());

    const res = await POST_DELETE_UNUSED(
      await authedRequest("http://localhost/api/tags/delete-unused", {
        method: "POST",
      })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.deleted).toBe(0);
    expect(tags.findAll(db)).toHaveLength(1);
  });
});
