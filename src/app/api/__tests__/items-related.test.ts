import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { authedRequest, cleanupTestDb, createTestDb } from "@/db/test-utils";
import { getDb, contentItems, contentLinks } from "@/db/index";
import { GET } from "@/app/api/items/[id]/related/route";

const NOW = () => new Date().toISOString();

function makeId(): string {
  return crypto.randomUUID();
}

function createItem(
  overrides: {
    id?: string;
    type?: string;
    title?: string;
    content?: string;
    metadata?: string | null;
    is_hidden?: number;
    is_private?: number;
  } = {}
): string {
  const db = getDb();
  const id = overrides.id ?? makeId();
  contentItems.create(db, {
    id,
    type: overrides.type ?? "note",
    title: overrides.title ?? null,
    content: overrides.content ?? "content-" + id,
    metadata: overrides.metadata ?? null,
    is_hidden: overrides.is_hidden ?? 0,
    is_private: overrides.is_private ?? 0,
    created_at: NOW(),
    updated_at: NOW(),
  });
  return id;
}

function createLink(
  sourceId: string,
  targetId: string,
  linkType: string
): void {
  const db = getDb();
  contentLinks.create(db, {
    id: makeId(),
    source_id: sourceId,
    target_id: targetId,
    link_type: linkType,
    created_at: NOW(),
  });
}

function anonRequest(url: string): Request {
  return new Request(url);
}

describe("/api/items/[id]/related", () => {
  beforeEach(() => {
    cleanupTestDb();
    createTestDb().close();
  });

  afterEach(() => {
    cleanupTestDb();
  });

  it("returns 401 to unauthenticated requests", async () => {
    const projectId = createItem({ type: "project", title: "P" });
    const res = await GET(
      anonRequest(`http://localhost/api/items/${projectId}/related`),
      { params: Promise.resolve({ id: projectId }) }
    );
    expect(res.status).toBe(401);
  });

  it("returns 404 when the item does not exist", async () => {
    const res = await GET(
      await authedRequest("http://localhost/api/items/missing/related"),
      { params: Promise.resolve({ id: "missing" }) }
    );
    expect(res.status).toBe(404);
  });

  it("returns 400 when the item exists but is not a project", async () => {
    const noteId = createItem({ type: "note", title: "Just a note" });
    const res = await GET(
      await authedRequest(`http://localhost/api/items/${noteId}/related`),
      { params: Promise.resolve({ id: noteId }) }
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.code).toBe("BAD_REQUEST");
  });

  it("returns 404 when the project is hidden and caller did not opt in", async () => {
    const projectId = createItem({
      type: "project",
      title: "Hidden Project",
      is_hidden: 1,
    });
    const res = await GET(
      await authedRequest(`http://localhost/api/items/${projectId}/related`),
      { params: Promise.resolve({ id: projectId }) }
    );
    expect(res.status).toBe(404);
  });

  it("returns 404 when the project is private and caller did not opt in", async () => {
    const projectId = createItem({
      type: "project",
      title: "Private Project",
      is_private: 1,
    });
    const res = await GET(
      await authedRequest(`http://localhost/api/items/${projectId}/related`),
      { params: Promise.resolve({ id: projectId }) }
    );
    expect(res.status).toBe(404);
  });

  it("returns nested tasks with event parent hint and orphans with parent null", async () => {
    const projectId = createItem({ type: "project", title: "My Project" });
    const eventId = createItem({
      type: "event",
      title: "Sprint 1",
      metadata: JSON.stringify({
        start_date: "2025-01-01",
        duration: 60,
        custom_field: "preserved",
      }),
    });
    const nestedTaskId = createItem({
      type: "task",
      title: "Nested Task",
      metadata: JSON.stringify({ status: "todo", custom_field: "preserved" }),
    });
    const orphanTaskId = createItem({
      type: "task",
      title: "Orphan Task",
    });

    // Event -> Project
    createLink(eventId, projectId, "happened_during");
    // Task -> Event
    createLink(nestedTaskId, eventId, "happened_during");
    // Task -> Project (orphan)
    createLink(orphanTaskId, projectId, "happened_during");

    const res = await GET(
      await authedRequest(`http://localhost/api/items/${projectId}/related`),
      { params: Promise.resolve({ id: projectId }) }
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.project.id).toBe(projectId);
    expect(json.project.title).toBe("My Project");

    // Should include: event, nested task, orphan task
    expect(json.items.length).toBe(3);

    // Event has no parent
    const eventItem = json.items.find((i: { id: string }) => i.id === eventId);
    expect(eventItem).toBeDefined();
    expect(eventItem.type).toBe("event");
    expect(eventItem.parent).toBeNull();
    expect(eventItem.dates.start_date).toBe("2025-01-01");
    expect(typeof eventItem.updated_at).toBe("string");
    expect(eventItem.metadata).toBe(
      JSON.stringify({
        start_date: "2025-01-01",
        duration: 60,
        custom_field: "preserved",
      })
    );
    expect(eventItem.updated_at.length).toBeGreaterThan(0);

    // Nested task has event parent hint
    const nested = json.items.find(
      (i: { id: string }) => i.id === nestedTaskId
    );
    expect(nested).toBeDefined();
    expect(nested.type).toBe("task");
    expect(nested.status).toBe("todo");
    expect(nested.parent).toEqual({
      id: eventId,
      title: "Sprint 1",
      type: "event",
    });
    expect(nested.link_type).toBe("happened_during");
    expect(nested.metadata).toBe(
      JSON.stringify({ status: "todo", custom_field: "preserved" })
    );

    // Orphan task has null parent
    const orphan = json.items.find(
      (i: { id: string }) => i.id === orphanTaskId
    );
    expect(orphan).toBeDefined();
    expect(orphan.type).toBe("task");
    expect(orphan.parent).toBeNull();
  });

  it("deduplicates tasks that are both direct and nested, preferring event parent", async () => {
    const projectId = createItem({ type: "project", title: "P" });
    const eventId = createItem({ type: "event", title: "Sprint 2" });
    const taskId = createItem({ type: "task", title: "Both Task" });

    // Task links directly to project
    createLink(taskId, projectId, "happened_during");
    // Task links to event
    createLink(taskId, eventId, "happened_during");
    // Event links to project
    createLink(eventId, projectId, "happened_during");

    const res = await GET(
      await authedRequest(`http://localhost/api/items/${projectId}/related`),
      { params: Promise.resolve({ id: projectId }) }
    );
    expect(res.status).toBe(200);
    const json = await res.json();

    // Should have exactly one task entry (deduped), with event parent
    const tasks = json.items.filter((i: { type: string }) => i.type === "task");
    expect(tasks.length).toBe(1);
    expect(tasks[0].id).toBe(taskId);
    expect(tasks[0].parent).toEqual({
      id: eventId,
      title: "Sprint 2",
      type: "event",
    });
  });

  it("includes bookmarks, notes, and people as related items", async () => {
    const projectId = createItem({ type: "project", title: "P" });
    const noteId = createItem({ type: "note", title: "Note" });
    const personId = createItem({ type: "person", title: "Person" });
    const bookmarkId = createItem({ type: "bookmark", title: "Bookmark" });

    createLink(noteId, projectId, "references");
    createLink(personId, projectId, "involves");
    createLink(bookmarkId, projectId, "bookmarked_for");

    const res = await GET(
      await authedRequest(`http://localhost/api/items/${projectId}/related`),
      { params: Promise.resolve({ id: projectId }) }
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.items.length).toBe(3);

    const note = json.items.find((i: { id: string }) => i.id === noteId);
    expect(note).toBeDefined();
    expect(note.type).toBe("note");
    expect(note.parent).toBeNull();

    const person = json.items.find((i: { id: string }) => i.id === personId);
    expect(person).toBeDefined();
    expect(person.type).toBe("person");
    expect(person.parent).toBeNull();

    const bookmark = json.items.find(
      (i: { id: string }) => i.id === bookmarkId
    );
    expect(bookmark).toBeDefined();
    expect(bookmark.type).toBe("bookmark");
    expect(bookmark.link_type).toBe("bookmarked_for");
    expect(bookmark.parent).toBeNull();
  });

  it("attaches tags from a batched lookup", async () => {
    const db = getDb();
    const projectId = createItem({ type: "project", title: "P" });
    const noteId = createItem({ type: "note", title: "Tagged Note" });

    // Create a tag and associate it
    const tagId = makeId();
    db.prepare("INSERT INTO tags (id, name, created_at) VALUES (?, ?, ?)").run(
      tagId,
      "alpha",
      NOW()
    );
    db.prepare(
      "INSERT INTO content_tags (content_id, tag_id, created_at) VALUES (?, ?, ?)"
    ).run(noteId, tagId, NOW());

    createLink(noteId, projectId, "references");

    const res = await GET(
      await authedRequest(`http://localhost/api/items/${projectId}/related`),
      { params: Promise.resolve({ id: projectId }) }
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    const item = json.items.find((i: { id: string }) => i.id === noteId);
    expect(item).toBeDefined();
    expect(item.tags).toEqual(["alpha"]);
  });

  describe("visibility", () => {
    it("excludes hidden/private children by default", async () => {
      const projectId = createItem({ type: "project", title: "P" });
      const visibleId = createItem({ type: "note", title: "Visible" });
      const hiddenId = createItem({
        type: "note",
        title: "Hidden",
        is_hidden: 1,
      });
      const privateId = createItem({
        type: "note",
        title: "Private",
        is_private: 1,
      });

      createLink(visibleId, projectId, "references");
      createLink(hiddenId, projectId, "references");
      createLink(privateId, projectId, "references");

      const res = await GET(
        await authedRequest(`http://localhost/api/items/${projectId}/related`),
        { params: Promise.resolve({ id: projectId }) }
      );
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.items.length).toBe(1);
      expect(json.items[0].id).toBe(visibleId);
    });

    it("includes hidden children with ?include_hidden=1", async () => {
      const projectId = createItem({ type: "project", title: "P" });
      const hiddenId = createItem({
        type: "note",
        title: "Hidden",
        is_hidden: 1,
      });
      createLink(hiddenId, projectId, "references");

      const res = await GET(
        await authedRequest(
          `http://localhost/api/items/${projectId}/related?include_hidden=1`
        ),
        { params: Promise.resolve({ id: projectId }) }
      );
      expect(res.status).toBe(200);
      const json = await res.json();
      const item = json.items.find((i: { id: string }) => i.id === hiddenId);
      expect(item).toBeDefined();
    });

    it("includes private children with ?include_private=1", async () => {
      const projectId = createItem({ type: "project", title: "P" });
      const privateId = createItem({
        type: "note",
        title: "Private",
        is_private: 1,
      });
      createLink(privateId, projectId, "references");

      const res = await GET(
        await authedRequest(
          `http://localhost/api/items/${projectId}/related?include_private=1`
        ),
        { params: Promise.resolve({ id: projectId }) }
      );
      expect(res.status).toBe(200);
      const json = await res.json();
      const item = json.items.find((i: { id: string }) => i.id === privateId);
      expect(item).toBeDefined();
    });

    it("requires both opt-ins for a both-hidden-and-private child", async () => {
      const projectId = createItem({ type: "project", title: "P" });
      const bothId = createItem({
        type: "note",
        title: "Both",
        is_hidden: 1,
        is_private: 1,
      });
      createLink(bothId, projectId, "references");

      const none = await GET(
        await authedRequest(`http://localhost/api/items/${projectId}/related`),
        { params: Promise.resolve({ id: projectId }) }
      );
      expect(
        (await none.json()).items.find((i: { id: string }) => i.id === bothId)
      ).toBeUndefined();

      const onlyHidden = await GET(
        await authedRequest(
          `http://localhost/api/items/${projectId}/related?include_hidden=1`
        ),
        { params: Promise.resolve({ id: projectId }) }
      );
      expect(
        (await onlyHidden.json()).items.find(
          (i: { id: string }) => i.id === bothId
        )
      ).toBeUndefined();

      const onlyPrivate = await GET(
        await authedRequest(
          `http://localhost/api/items/${projectId}/related?include_private=1`
        ),
        { params: Promise.resolve({ id: projectId }) }
      );
      expect(
        (await onlyPrivate.json()).items.find(
          (i: { id: string }) => i.id === bothId
        )
      ).toBeUndefined();

      const both = await GET(
        await authedRequest(
          `http://localhost/api/items/${projectId}/related?include_hidden=1&include_private=1`
        ),
        { params: Promise.resolve({ id: projectId }) }
      );
      expect(both.status).toBe(200);
      expect(
        (await both.json()).items.find((i: { id: string }) => i.id === bothId)
      ).toBeDefined();
    });

    it("includes private nested tasks when opt-in is passed", async () => {
      const projectId = createItem({ type: "project", title: "P" });
      const eventId = createItem({ type: "event", title: "Event" });
      const privateTaskId = createItem({
        type: "task",
        title: "Private Nested Task",
        is_private: 1,
      });

      createLink(eventId, projectId, "happened_during");
      createLink(privateTaskId, eventId, "happened_during");

      const defaultRes = await GET(
        await authedRequest(`http://localhost/api/items/${projectId}/related`),
        { params: Promise.resolve({ id: projectId }) }
      );
      expect(
        (await defaultRes.json()).items.find(
          (i: { id: string }) => i.id === privateTaskId
        )
      ).toBeUndefined();

      const optedRes = await GET(
        await authedRequest(
          `http://localhost/api/items/${projectId}/related?include_private=1`
        ),
        { params: Promise.resolve({ id: projectId }) }
      );
      expect(optedRes.status).toBe(200);
      const task = (await optedRes.json()).items.find(
        (i: { id: string }) => i.id === privateTaskId
      );
      expect(task).toBeDefined();
      expect(task.parent).toEqual({
        id: eventId,
        title: "Event",
        type: "event",
      });
    });

    it("includes hidden nested tasks when opt-in is passed", async () => {
      const projectId = createItem({ type: "project", title: "P" });
      const eventId = createItem({
        type: "event",
        title: "Event",
      });
      const hiddenTaskId = createItem({
        type: "task",
        title: "Hidden Nested Task",
        is_hidden: 1,
      });

      createLink(eventId, projectId, "happened_during");
      createLink(hiddenTaskId, eventId, "happened_during");

      // Without opt-in — hidden task excluded
      const defaultRes = await GET(
        await authedRequest(`http://localhost/api/items/${projectId}/related`),
        { params: Promise.resolve({ id: projectId }) }
      );
      expect(defaultRes.status).toBe(200);
      const defaultJson = await defaultRes.json();
      expect(
        defaultJson.items.find((i: { id: string }) => i.id === hiddenTaskId)
      ).toBeUndefined();

      // With opt-in — hidden task included
      const optedRes = await GET(
        await authedRequest(
          `http://localhost/api/items/${projectId}/related?include_hidden=1`
        ),
        { params: Promise.resolve({ id: projectId }) }
      );
      expect(optedRes.status).toBe(200);
      const optedJson = await optedRes.json();
      const task = optedJson.items.find(
        (i: { id: string }) => i.id === hiddenTaskId
      );
      expect(task).toBeDefined();
      expect(task.parent).toEqual({
        id: eventId,
        title: "Event",
        type: "event",
      });
    });
  });
});
