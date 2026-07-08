import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { authedRequest, cleanupTestDb, createTestDb } from "@/db/test-utils";
import { getDb, contentItems, contentLinks } from "@/db/index";
import { POST } from "@/app/api/links/route";
import { DELETE } from "@/app/api/links/[id]/route";

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

async function deleteLink(id: string) {
  return DELETE(
    await authedRequest(`http://localhost/api/links/${id}`, {
      method: "DELETE",
    }),
    { params: Promise.resolve({ id }) }
  );
}

describe("/api/links/[id] DELETE", () => {
  beforeEach(() => {
    cleanupTestDb();
    createTestDb().close();
  });

  afterEach(() => {
    cleanupTestDb();
  });

  it("deletes a link and its reverse row, returns 200", async () => {
    const a = makeContentItem();
    const b = makeContentItem();

    const createRes = await postLink({
      source_id: a,
      target_id: b,
      link_type: "references",
    });
    expect(createRes.status).toBe(201);
    const created = await createRes.json();
    const linkId = created.id;

    const db = getDb();
    const beforeCount = (
      db.prepare("SELECT COUNT(*) as c FROM content_links").get() as {
        c: number;
      }
    ).c;
    expect(beforeCount).toBe(2); // forward + reverse

    const deleteRes = await deleteLink(linkId);
    expect(deleteRes.status).toBe(200);
    const deleted = await deleteRes.json();
    expect(deleted.id).toBe(linkId);

    const afterCount = (
      db.prepare("SELECT COUNT(*) as c FROM content_links").get() as {
        c: number;
      }
    ).c;
    expect(afterCount).toBe(0); // both rows removed
  });

  it("returns 404 when the link does not exist", async () => {
    const res = await deleteLink(makeId());
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error.code).toBe("NOT_FOUND");
  });

  it("writes an audit log row on successful delete", async () => {
    const a = makeContentItem();
    const b = makeContentItem();

    const createRes = await postLink({
      source_id: a,
      target_id: b,
      link_type: "related-to",
    });
    const created = await createRes.json();

    const db = getDb();
    const auditBefore = (
      db.prepare("SELECT COUNT(*) as c FROM audit_logs").get() as { c: number }
    ).c;

    const deleteRes = await deleteLink(created.id);
    expect(deleteRes.status).toBe(200);

    const auditAfter = (
      db.prepare("SELECT COUNT(*) as c FROM audit_logs").get() as { c: number }
    ).c;
    expect(auditAfter).toBe(auditBefore + 1);

    const row = db
      .prepare("SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 1")
      .get() as {
      action: string;
      entity_type: string;
      metadata: string;
    };
    expect(row.action).toBe("content_link.delete");
    expect(row.entity_type).toBe("content_link");
    const meta = JSON.parse(row.metadata);
    expect(meta.source_id).toBe(a);
    expect(meta.target_id).toBe(b);
    expect(meta.link_type).toBe("related-to");
  });

  it("deleting one direction removes both rows", async () => {
    const a = makeContentItem();
    const b = makeContentItem();

    const createRes = await postLink({
      source_id: a,
      target_id: b,
      link_type: "depends-on",
    });
    const created = await createRes.json();

    const db = getDb();
    const outboundFromA = contentLinks.findBySource(db, a);
    const outboundFromB = contentLinks.findBySource(db, b);
    expect(outboundFromA).toHaveLength(1);
    expect(outboundFromB).toHaveLength(1);

    const deleteRes = await deleteLink(created.id);
    expect(deleteRes.status).toBe(200);

    const afterA = contentLinks.findBySource(db, a);
    const afterB = contentLinks.findBySource(db, b);
    expect(afterA).toHaveLength(0);
    expect(afterB).toHaveLength(0);
  });

  it("allows creating a new link after deleting the old one", async () => {
    const a = makeContentItem();
    const b = makeContentItem();

    const first = await postLink({
      source_id: a,
      target_id: b,
      link_type: "references",
    });
    expect(first.status).toBe(201);
    const created = await first.json();

    const deleteRes = await deleteLink(created.id);
    expect(deleteRes.status).toBe(200);

    // Should be able to create the same link again after deletion.
    const second = await postLink({
      source_id: a,
      target_id: b,
      link_type: "references",
    });
    expect(second.status).toBe(201);
  });
});
