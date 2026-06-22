import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { authedRequest, cleanupTestDb, createTestDb } from "@/db/test-utils";
import { getDb, contentItems, contentLinks } from "@/db/index";
import { POST } from "@/app/api/links/route";

const NOW = () => new Date().toISOString();

function makeId() {
  return crypto.randomUUID();
}

function makeContentItem(
  overrides: { title?: string; content?: string } = {}
): string {
  const db = getDb();
  const now = NOW();
  const id = makeId();
  contentItems.create(db, {
    id,
    type: "note",
    title: overrides.title ?? "test item",
    content: overrides.content ?? "test content",
    source: "manual",
    created_at: now,
    updated_at: now,
  });
  return id;
}

async function postLink(body: Record<string, unknown>) {
  return POST(
    await authedRequest("http://localhost/api/links", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  );
}

describe("/api/links", () => {
  beforeEach(() => {
    cleanupTestDb();
    createTestDb().close();
  });

  afterEach(() => {
    cleanupTestDb();
  });

  it("creates a bidirectional link and returns 201 with the forward row", async () => {
    const a = makeContentItem();
    const b = makeContentItem();

    const res = await postLink({
      source_id: a,
      target_id: b,
      link_type: "references",
    });
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.source_id).toBe(a);
    expect(json.target_id).toBe(b);
    expect(json.link_type).toBe("references");
    expect(typeof json.id).toBe("string");
    expect(typeof json.created_at).toBe("string");

    // Both directions are persisted.
    const db = getDb();
    const outboundFromA = contentLinks.findBySource(db, a);
    const outboundFromB = contentLinks.findBySource(db, b);
    expect(outboundFromA).toHaveLength(1);
    expect(outboundFromA[0].target_id).toBe(b);
    expect(outboundFromB).toHaveLength(1);
    expect(outboundFromB[0].target_id).toBe(a);
  });

  it("stores the optional context on both rows", async () => {
    const a = makeContentItem();
    const b = makeContentItem();

    const res = await postLink({
      source_id: a,
      target_id: b,
      link_type: "related-to",
      context: "see also: same author",
    });
    expect(res.status).toBe(201);

    const db = getDb();
    const outbound = contentLinks.findBySource(db, a);
    const reverse = contentLinks.findBySource(db, b);
    expect(outbound[0].context).toBe("see also: same author");
    expect(reverse[0].context).toBe("see also: same author");
  });

  it("defaults link_type to 'references' when omitted", async () => {
    const a = makeContentItem();
    const b = makeContentItem();

    const res = await postLink({ source_id: a, target_id: b });
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.link_type).toBe("references");
  });

  it("accepts every link type listed in the issue's acceptance criteria", async () => {
    const types = [
      "references",
      "contradicts",
      "questions",
      "answers",
      "depends-on",
      "related-to",
      "involves",
      "bookmarked_for",
      "happened_during",
    ];
    const db = getDb();
    for (const t of types) {
      const a = makeContentItem();
      const b = makeContentItem();
      const res = await postLink({ source_id: a, target_id: b, link_type: t });
      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.link_type).toBe(t);
    }
    // Sanity: each pair wrote two rows, so 18 link rows total.
    const linkCount = (
      db.prepare("SELECT COUNT(*) as c FROM content_links").get() as {
        c: number;
      }
    ).c;
    expect(linkCount).toBe(types.length * 2);
  });

  it("rejects unknown link types with 400", async () => {
    const a = makeContentItem();
    const b = makeContentItem();
    const res = await postLink({
      source_id: a,
      target_id: b,
      link_type: "made-up-type",
    });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 400 when source_id does not exist", async () => {
    const b = makeContentItem();
    const res = await postLink({
      source_id: makeId(),
      target_id: b,
      link_type: "references",
    });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 400 when target_id does not exist", async () => {
    const a = makeContentItem();
    const res = await postLink({
      source_id: a,
      target_id: makeId(),
      link_type: "references",
    });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 400 when source_id and target_id are the same item", async () => {
    const a = makeContentItem();
    const res = await postLink({
      source_id: a,
      target_id: a,
      link_type: "references",
    });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 409 when the same link is created again (same direction)", async () => {
    const a = makeContentItem();
    const b = makeContentItem();
    const first = await postLink({
      source_id: a,
      target_id: b,
      link_type: "references",
    });
    expect(first.status).toBe(201);

    const dup = await postLink({
      source_id: a,
      target_id: b,
      link_type: "references",
    });
    expect(dup.status).toBe(409);
    const json = await dup.json();
    expect(json.error.code).toBe("CONFLICT");

    // No new rows were inserted on the rejected attempt.
    const db = getDb();
    const linkCount = (
      db.prepare("SELECT COUNT(*) as c FROM content_links").get() as {
        c: number;
      }
    ).c;
    expect(linkCount).toBe(2);
  });

  it("returns 409 when the same link is created in the reverse direction", async () => {
    const a = makeContentItem();
    const b = makeContentItem();
    const first = await postLink({
      source_id: a,
      target_id: b,
      link_type: "references",
    });
    expect(first.status).toBe(201);

    // The schema stores bidirectional links as two rows, so the
    // duplicate check must treat (a, b, type) and (b, a, type) as the
    // same link — otherwise a reverse request would succeed and
    // duplicate the forward row.
    const reverse = await postLink({
      source_id: b,
      target_id: a,
      link_type: "references",
    });
    expect(reverse.status).toBe(409);
    const json = await reverse.json();
    expect(json.error.code).toBe("CONFLICT");
  });

  it("allows two links of different types between the same items", async () => {
    const a = makeContentItem();
    const b = makeContentItem();
    const refs = await postLink({
      source_id: a,
      target_id: b,
      link_type: "references",
    });
    const contra = await postLink({
      source_id: a,
      target_id: b,
      link_type: "contradicts",
    });
    expect(refs.status).toBe(201);
    expect(contra.status).toBe(201);
  });

  it("creates a link with type 'involves' (content-pairing)", async () => {
    const a = makeContentItem();
    const b = makeContentItem();
    const res = await postLink({
      source_id: a,
      target_id: b,
      link_type: "involves",
    });
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.link_type).toBe("involves");
  });

  it("creates a link with type 'happened_during' (content-pairing)", async () => {
    const a = makeContentItem();
    const b = makeContentItem();
    const res = await postLink({
      source_id: a,
      target_id: b,
      link_type: "happened_during",
    });
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.link_type).toBe("happened_during");
  });

  it("returns 400 for invalid JSON body", async () => {
    const res = await POST(
      await authedRequest("http://localhost/api/links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{invalid-json",
      })
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.code).toBe("VALIDATION_ERROR");
  });

  it("writes an audit log row on successful create", async () => {
    const a = makeContentItem();
    const b = makeContentItem();
    const db = getDb();
    const before = (
      db.prepare("SELECT COUNT(*) as c FROM audit_logs").get() as { c: number }
    ).c;

    const res = await postLink({
      source_id: a,
      target_id: b,
      link_type: "answers",
    });
    expect(res.status).toBe(201);

    const after = (
      db.prepare("SELECT COUNT(*) as c FROM audit_logs").get() as { c: number }
    ).c;
    expect(after).toBe(before + 1);

    const row = db
      .prepare("SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 1")
      .get() as {
      action: string;
      entity_type: string;
      metadata: string;
    };
    expect(row.action).toBe("content_link.create");
    expect(row.entity_type).toBe("content_link");
    const meta = JSON.parse(row.metadata);
    expect(meta.source_id).toBe(a);
    expect(meta.target_id).toBe(b);
    expect(meta.link_type).toBe("answers");
  });

  it("does not write an audit log or partial rows when the duplicate check fails", async () => {
    const a = makeContentItem();
    const b = makeContentItem();
    await postLink({ source_id: a, target_id: b, link_type: "references" });

    const db = getDb();
    const linkCountBefore = (
      db.prepare("SELECT COUNT(*) as c FROM content_links").get() as {
        c: number;
      }
    ).c;
    const auditBefore = (
      db.prepare("SELECT COUNT(*) as c FROM audit_logs").get() as { c: number }
    ).c;

    const dup = await postLink({
      source_id: a,
      target_id: b,
      link_type: "references",
    });
    expect(dup.status).toBe(409);

    expect(
      (
        db.prepare("SELECT COUNT(*) as c FROM content_links").get() as {
          c: number;
        }
      ).c
    ).toBe(linkCountBefore);
    expect(
      (
        db.prepare("SELECT COUNT(*) as c FROM audit_logs").get() as {
          c: number;
        }
      ).c
    ).toBe(auditBefore);
  });
});
