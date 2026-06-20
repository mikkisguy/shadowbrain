import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  authedGet,
  authedRequest,
  cleanupTestDb,
  createTestDb,
} from "@/db/test-utils";
import { GET } from "@/app/api/search/route";
import { POST } from "@/app/api/items/route";
import { getDb, contentTags, tags } from "@/db/index";

const NOW = () => new Date().toISOString();

interface SeedResult {
  noteId: string;
  bookmarkId: string;
  otherNoteId: string;
}

async function seedItems(): Promise<SeedResult> {
  const noteRes = await POST(
    await authedRequest("http://localhost/api/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "note",
        title: "docker notes",
        content: "docker compose for local dev environments",
        source: "manual",
      }),
    })
  );
  const note = await noteRes.json();

  const bmRes = await POST(
    await authedRequest("http://localhost/api/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "bookmark",
        title: "docker hub",
        content: "docker hub is a container registry",
        source: "manual",
      }),
    })
  );
  const bookmark = await bmRes.json();

  const otherRes = await POST(
    await authedRequest("http://localhost/api/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "note",
        title: "cooking tips",
        content: "knife skills for the home cook",
        source: "manual",
      }),
    })
  );
  const other = await otherRes.json();

  // Tags aren't exposed via an API yet (phase 1.8). Use the cached DB
  // connection that the route itself uses so we don't open a second
  // file-level connection on the test DB.
  const db = getDb();
  const now = NOW();
  const infraTagId = crypto.randomUUID();
  const devTagId = crypto.randomUUID();
  tags.create(db, { id: infraTagId, name: "infra", created_at: now });
  tags.create(db, { id: devTagId, name: "dev", created_at: now });
  contentTags.addTag(db, note.id, infraTagId, now);
  contentTags.addTag(db, other.id, devTagId, now);

  return {
    noteId: note.id,
    bookmarkId: bookmark.id,
    otherNoteId: other.id,
  };
}

describe("GET /api/search", () => {
  beforeEach(() => {
    cleanupTestDb();
    createTestDb().close();
  });

  afterEach(() => {
    cleanupTestDb();
  });

  it("returns matched results with rank and snippet", async () => {
    const { noteId } = await seedItems();

    const res = await GET(
      await authedGet("http://localhost/api/search?q=docker")
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.query).toBe("docker");
    expect(Array.isArray(json.results)).toBe(true);
    expect(json.results.length).toBeGreaterThan(0);
    expect(json.total).toBeGreaterThan(0);
    expect(json.page).toBe(1);
    expect(json.limit).toBe(20);

    const dockerNote = json.results.find(
      (r: { id: string }) => r.id === noteId
    );
    expect(dockerNote).toBeDefined();
    expect(typeof dockerNote.rank).toBe("number");
    expect(typeof dockerNote.snippet).toBe("string");
    expect(dockerNote.snippet).toContain("<mark>");
  });

  it("returns results in BM25 rank order (best match first)", async () => {
    await seedItems();
    const res = await GET(
      await authedGet("http://localhost/api/search?q=docker")
    );
    const json = await res.json();
    const ranks = json.results.map((r: { rank: number }) => r.rank);
    const sortedAsc = [...ranks].sort((a, b) => a - b);
    expect(ranks).toEqual(sortedAsc);
  });

  it("returns an empty array when nothing matches", async () => {
    await seedItems();
    const res = await GET(
      await authedGet("http://localhost/api/search?q=zzzzzznope")
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.results).toEqual([]);
    expect(json.total).toBe(0);
  });

  it("returns an empty array when DB is empty", async () => {
    const res = await GET(
      await authedGet("http://localhost/api/search?q=anything")
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.results).toEqual([]);
    expect(json.total).toBe(0);
  });

  it("filters by type", async () => {
    const { noteId, bookmarkId } = await seedItems();

    const res = await GET(
      await authedGet("http://localhost/api/search?q=docker&type=note")
    );
    const json = await res.json();
    expect(json.results.length).toBe(1);
    expect(json.results[0].id).toBe(noteId);
    expect(json.results[0].type).toBe("note");

    const bmRes = await GET(
      await authedGet("http://localhost/api/search?q=docker&type=bookmark")
    );
    const bmJson = await bmRes.json();
    expect(bmJson.results.length).toBe(1);
    expect(bmJson.results[0].id).toBe(bookmarkId);
  });

  it("filters by tag", async () => {
    const { noteId } = await seedItems();

    const res = await GET(
      await authedGet("http://localhost/api/search?q=docker&tag=infra")
    );
    const json = await res.json();
    expect(json.results.length).toBe(1);
    expect(json.results[0].id).toBe(noteId);

    const none = await GET(
      await authedGet("http://localhost/api/search?q=docker&tag=nonexistent")
    );
    const noneJson = await none.json();
    expect(noneJson.results).toEqual([]);
  });

  it("combines type and tag filters", async () => {
    await seedItems();
    const res = await GET(
      await authedGet(
        "http://localhost/api/search?q=docker&type=note&tag=infra"
      )
    );
    const json = await res.json();
    expect(json.results.length).toBe(1);
    expect(json.results[0].type).toBe("note");
  });

  it("respects pagination", async () => {
    await seedItems();
    const p1 = await GET(
      await authedGet("http://localhost/api/search?q=docker&page=1&limit=1")
    );
    const p2 = await GET(
      await authedGet("http://localhost/api/search?q=docker&page=2&limit=1")
    );
    const j1 = await p1.json();
    const j2 = await p2.json();
    expect(j1.results.length).toBe(1);
    expect(j2.results.length).toBe(1);
    expect(j1.results[0].id).not.toBe(j2.results[0].id);
    expect(j1.page).toBe(1);
    expect(j1.limit).toBe(1);
  });

  it("handles special characters safely (quotes, asterisks)", async () => {
    await POST(
      await authedRequest("http://localhost/api/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "note",
          title: "no match here",
          content: "no matchable content for the special-character test",
          source: "manual",
        }),
      })
    );

    // The sanitizer should escape embedded quotes — a malformed FTS query
    // would otherwise throw a syntax error and surface as a 500.
    const res = await GET(
      await authedGet(
        `http://localhost/api/search?q=${encodeURIComponent('test"quote')}`
      )
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(Array.isArray(json.results)).toBe(true);

    // Prefix search: hel* should not blow up.
    const prefixRes = await GET(
      await authedGet("http://localhost/api/search?q=hel*")
    );
    expect(prefixRes.status).toBe(200);
  });

  it("returns 400 when q is missing", async () => {
    const res = await GET(await authedGet("http://localhost/api/search"));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 400 when q is empty/whitespace", async () => {
    const res = await GET(
      await authedGet("http://localhost/api/search?q=%20%20%20")
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 400 when q is too long", async () => {
    const longQ = "a".repeat(257);
    const res = await GET(
      await authedGet(`http://localhost/api/search?q=${longQ}`)
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.code).toBe("VALIDATION_ERROR");
  });
});
