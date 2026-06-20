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
