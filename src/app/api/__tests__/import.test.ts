import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  authedGet,
  authedRequest,
  cleanupTestDb,
  createTestDb,
} from "@/db/test-utils";
import { getDb, contentItems, contentLinks, contentTags } from "@/db/index";
import { POST } from "@/app/api/import/route";
import { GET as GET_SCHEMA } from "@/app/api/import/schema/route";
import { GET as GET_TEMPLATE } from "@/app/api/import/template/route";

const EXPORTED_AT = "2025-01-01T00:00:00.000Z";

function makeItem(
  id: string,
  overrides: { type?: string; title?: string; content?: string } = {}
) {
  return {
    id,
    type: overrides.type ?? "note",
    title: overrides.title ?? id,
    content: overrides.content ?? `${id} content`,
    image_path: null,
    source: "manual",
    source_url: null,
    metadata: null,
    is_private: 0 as const,
    is_hidden: 0 as const,
    created_at: EXPORTED_AT,
    updated_at: EXPORTED_AT,
  };
}

function makeEnvelope(
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    format: "shadowbrain-export",
    version: 1,
    exported_at: EXPORTED_AT,
    items: [],
    tags: [],
    item_tags: [],
    links: [],
    journal_periods: [],
    ...overrides,
  };
}

async function postImport(data: unknown, mode = "merge") {
  return POST(
    await authedRequest("http://localhost/api/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode, data }),
    })
  );
}

describe("/api/import", () => {
  beforeEach(() => {
    cleanupTestDb();
    createTestDb().close();
  });

  afterEach(() => {
    cleanupTestDb();
    vi.restoreAllMocks();
  });

  it("downloads the JSON Schema for the export envelope", async () => {
    const res = await GET_SCHEMA(
      await authedGet("http://localhost/api/import/schema")
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain(
      "application/schema+json"
    );
    expect(res.headers.get("Content-Disposition")).toContain(
      "shadowbrain-export.schema.json"
    );
    const schema = await res.json();
    expect(schema.properties.format.const).toBe("shadowbrain-export");
    expect(schema.properties.version.const).toBe(1);
  });

  it("downloads a valid import template", async () => {
    const res = await GET_TEMPLATE(
      await authedGet("http://localhost/api/import/template")
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("application/json");
    expect(res.headers.get("Content-Disposition")).toContain(
      "shadowbrain-import-template.json"
    );
    const template = await res.json();
    expect(template.format).toBe("shadowbrain-export");
    expect(template.version).toBe(1);
    expect(template.items.length).toBeGreaterThan(0);
  });

  it("rejects schema/template downloads when unauthenticated", async () => {
    const schema = await GET_SCHEMA(
      new Request("http://localhost/api/import/schema")
    );
    const template = await GET_TEMPLATE(
      new Request("http://localhost/api/import/template")
    );
    expect(schema.status).toBe(401);
    expect(template.status).toBe(401);
  });

  it("returns 401 when unauthenticated", async () => {
    const res = await POST(
      new Request("http://localhost/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "merge", data: makeEnvelope() }),
      })
    );

    expect(res.status).toBe(401);
  });

  it("returns 400 when mode is not merge", async () => {
    const res = await postImport(makeEnvelope(), "replace");

    expect(res.status).toBe(400);
  });

  it("returns 400 when data is missing or the envelope is invalid", async () => {
    const missingData = await POST(
      await authedRequest("http://localhost/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "merge" }),
      })
    );
    expect(missingData.status).toBe(400);

    const invalidEnvelope = await postImport({ format: "not-shadowbrain" });
    expect(invalidEnvelope.status).toBe(400);
    const json = await invalidEnvelope.json();
    expect(json.error.details.issues).toEqual(expect.any(Array));
    expect(json.error.details.issues.length).toBeGreaterThan(0);
  });

  it("accepts a raw exported envelope without a data wrapper", async () => {
    const envelope = makeEnvelope({
      items: [makeItem("raw-1", { title: "Raw", content: "posted directly" })],
    });

    const res = await POST(
      await authedRequest("http://localhost/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(envelope),
      })
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.created.items).toBe(1);
    expect(
      contentItems
        .findAll(getDb())
        .some((item) => item.content === "posted directly")
    ).toBe(true);
  });

  it("merges items, tags, and a bidirectional link", async () => {
    const data = makeEnvelope({
      items: [
        makeItem("project-1", { type: "project", title: "Project" }),
        makeItem("note-1", { title: "Note", content: "A note" }),
      ],
      tags: [
        {
          id: "tag-1",
          name: "important",
          color: "#ff0000",
          created_at: EXPORTED_AT,
        },
      ],
      item_tags: [
        { content_id: "note-1", tag_id: "tag-1", created_at: EXPORTED_AT },
      ],
      links: [
        {
          id: "link-1",
          source_id: "project-1",
          target_id: "note-1",
          link_type: "references",
          context: "project note",
          created_at: EXPORTED_AT,
        },
      ],
    });

    const res = await postImport(data);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.created).toEqual({
      items: 2,
      tags: 1,
      item_tags: 1,
      links: 1,
      journal_periods: 0,
    });

    const db = getDb();
    const importedItems = contentItems.findAll(db);
    expect(importedItems).toHaveLength(2);
    const project = importedItems.find(
      (item) => item.content === "project-1 content"
    );
    const note = importedItems.find((item) => item.content === "A note");
    expect(project).toBeDefined();
    expect(note).toBeDefined();
    expect(project!.id).not.toBe("project-1");
    expect(note!.id).not.toBe("note-1");
    expect(contentTags.findByContent(db, note!.id)).toMatchObject([
      { name: "important", color: "#ff0000" },
    ]);
    expect(contentLinks.findAll(db)).toHaveLength(2);
    expect(contentLinks.findBySource(db, project!.id)).toMatchObject([
      {
        target_id: note!.id,
        link_type: "references",
        context: "project note",
      },
    ]);
    expect(contentLinks.findBySource(db, note!.id)).toMatchObject([
      {
        target_id: project!.id,
        link_type: "references",
        context: "project note",
      },
    ]);
  });

  it("does not mutate a pre-existing item that shares an exported id", async () => {
    const db = getDb();
    contentItems.create(db, {
      id: "keep-me",
      type: "note",
      title: "Original title",
      content: "Original content",
      source: "manual",
      created_at: EXPORTED_AT,
      updated_at: EXPORTED_AT,
    });

    const res = await postImport(
      makeEnvelope({
        items: [
          makeItem("keep-me", {
            title: "Imported title",
            content: "Imported content",
          }),
        ],
      })
    );

    expect(res.status).toBe(200);
    const existing = contentItems.findById(db, "keep-me");
    expect(existing?.title).toBe("Original title");
    expect(existing?.content).toBe("Original content");
    expect(contentItems.findAll(db)).toHaveLength(2);
  });

  it("does not write items when validation fails", async () => {
    const db = getDb();
    const countBefore = contentItems.findAll(db).length;
    const res = await postImport(
      makeEnvelope({
        items: [makeItem("item-1")],
        links: [
          {
            id: "link-1",
            source_id: "missing-item",
            target_id: "item-1",
            link_type: "references",
            context: null,
            created_at: EXPORTED_AT,
          },
        ],
      })
    );

    expect(res.status).toBe(400);
    expect(contentItems.findAll(db)).toHaveLength(countBefore);
  });
});
