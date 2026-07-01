# Content Item CRUD + Logging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement content item CRUD API endpoints with consistent validation/errors, structured JSON logging, and persistent audit logs.

**Architecture:** Add Next.js App Router route handlers for `/api/items` and `/api/items/[id]`, backed by new DB query helpers and audit log writes. Introduce a small JSON logger wrapper and a reusable API response/error utility.

**Tech Stack:** Next.js App Router, better-sqlite3, Zod, Vitest.

---

## File Structure

- Create: `src/db/migrations/0004_audit_logs.sql`
- Modify: `src/db/index.ts`
- Create: `src/lib/logger.ts`
- Create: `src/lib/api.ts`
- Create: `src/db/__tests__/audit-logs.test.ts`
- Create: `src/lib/__tests__/api.test.ts`
- Create: `src/db/__tests__/content-items.test.ts`
- Create: `src/app/api/items/route.ts`
- Create: `src/app/api/items/[id]/route.ts`
- Create: `src/app/api/__tests__/items.test.ts`

---

### Task 1: Add audit_logs migration + DB helper

**Files:**

- Create: `src/db/migrations/0004_audit_logs.sql`
- Modify: `src/db/index.ts`
- Test: `src/db/__tests__/audit-logs.test.ts`

- [ ] **Step 1: Write failing test for audit log insert**

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestDb, cleanupTestDb } from "../test-utils";
import { auditLogs } from "../index";

describe("auditLogs.create", () => {
  beforeEach(() => {
    cleanupTestDb();
  });

  afterEach(() => {
    cleanupTestDb();
  });

  it("inserts a new audit log row", () => {
    const db = createTestDb();
    const now = "2024-01-01T00:00:00.000Z";
    const result = auditLogs.create(db, {
      id: crypto.randomUUID(),
      actor_id: null,
      actor_type: "system",
      action: "content_item.create",
      entity_type: "content_item",
      entity_id: "abc",
      success: 1,
      metadata: JSON.stringify({ foo: "bar" }),
      ip: "127.0.0.1",
      user_agent: "vitest",
      created_at: now,
    });

    expect(result.changes).toBe(1);
    const row = db
      .prepare("SELECT action, entity_id, success FROM audit_logs WHERE id = ?")
      .get(result.lastInsertRowid) as
      { action: string; entity_id: string; success: number } | undefined;

    expect(row?.action).toBe("content_item.create");
    expect(row?.entity_id).toBe("abc");
    expect(row?.success).toBe(1);
    db.close();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/db/__tests__/audit-logs.test.ts`
Expected: FAIL with "no such table: audit_logs" or missing export.

- [ ] **Step 3: Add audit_logs migration**

```sql
-- Migration: 0004_audit_logs
-- Created: 2026-05-20
-- Description: Add audit_logs table for security and operational auditing

CREATE TABLE IF NOT EXISTS audit_logs (
    id          TEXT PRIMARY KEY,
    actor_id    TEXT,
    actor_type  TEXT,
    action      TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id   TEXT,
    success     INTEGER NOT NULL DEFAULT 1,
    metadata    TEXT,
    ip          TEXT,
    user_agent  TEXT,
    created_at  DATETIME NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);
```

- [ ] **Step 4: Implement auditLogs helper in DB layer**

```ts
export interface AuditLog {
  id: string;
  actor_id: string | null;
  actor_type: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  success: number;
  metadata: string | null;
  ip: string | null;
  user_agent: string | null;
  created_at: string;
}

export const auditLogs = {
  create: (
    db: Database.Database,
    log: {
      id: string;
      actor_id?: string | null;
      actor_type?: string | null;
      action: string;
      entity_type: string;
      entity_id?: string | null;
      success?: number;
      metadata?: string | null;
      ip?: string | null;
      user_agent?: string | null;
      created_at: string;
    }
  ) => {
    const stmt = db.prepare(`
      INSERT INTO audit_logs (
        id, actor_id, actor_type, action, entity_type, entity_id,
        success, metadata, ip, user_agent, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    return stmt.run(
      log.id,
      log.actor_id ?? null,
      log.actor_type ?? null,
      log.action,
      log.entity_type,
      log.entity_id ?? null,
      log.success ?? 1,
      log.metadata ?? null,
      log.ip ?? null,
      log.user_agent ?? null,
      log.created_at
    );
  },
};
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm test src/db/__tests__/audit-logs.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/db/migrations/0004_audit_logs.sql src/db/index.ts src/db/__tests__/audit-logs.test.ts
git commit -m "feat(db): add audit logs table and helper"
```

---

### Task 2: Add API utilities + JSON logger

**Files:**

- Create: `src/lib/logger.ts`
- Create: `src/lib/api.ts`
- Test: `src/lib/__tests__/api.test.ts`

- [ ] **Step 1: Write failing tests for pagination + error shape**

```ts
import { describe, it, expect } from "vitest";
import { parsePagination, errorResponse } from "../api";

describe("parsePagination", () => {
  it("applies defaults and caps max limit", () => {
    const { page, limit, offset } = parsePagination({
      page: "1",
      limit: "500",
    });
    expect(page).toBe(1);
    expect(limit).toBe(100);
    expect(offset).toBe(0);
  });
});

describe("errorResponse", () => {
  it("formats error response without leaking details", async () => {
    const response = errorResponse("VALIDATION_ERROR", "Invalid input", 400, {
      field: "type",
    });
    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json).toEqual({
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid input",
        details: { field: "type" },
      },
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test src/lib/__tests__/api.test.ts`
Expected: FAIL with missing module or exports.

- [ ] **Step 3: Implement JSON logger**

```ts
type LogLevel = "debug" | "info" | "warn" | "error";

const REDACT_KEYS = [
  "authorization",
  "cookie",
  "set-cookie",
  "api-key",
  "apikey",
];

function redactObject(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(redactObject);
  const entries = Object.entries(value as Record<string, unknown>).map(
    ([k, v]) => {
      if (REDACT_KEYS.includes(k.toLowerCase())) {
        return [k, "[REDACTED]"] as const;
      }
      return [k, redactObject(v)] as const;
    }
  );
  return Object.fromEntries(entries);
}

export function log(
  level: LogLevel,
  msg: string,
  meta?: Record<string, unknown>
) {
  const payload = {
    level,
    msg,
    ...redactObject(meta ?? {}),
    timestamp: new Date().toISOString(),
  };
  const line = JSON.stringify(payload);
  if (level === "error") {
    console.error(line);
    return;
  }
  if (level === "warn") {
    console.warn(line);
    return;
  }
  console.log(line);
}
```

- [ ] **Step 4: Implement API helper utilities**

```ts
import { z } from "zod";
import { log } from "./logger";

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 20;

export function parsePagination(params: { page?: string; limit?: string }) {
  const page = Math.max(1, Number(params.page ?? 1) || 1);
  const rawLimit = Number(params.limit ?? DEFAULT_LIMIT) || DEFAULT_LIMIT;
  const limit = Math.min(MAX_LIMIT, Math.max(1, rawLimit));
  const offset = (page - 1) * limit;
  return { page, limit, offset };
}

export function errorResponse(
  code: string,
  message: string,
  status: number,
  details?: Record<string, unknown>
) {
  return Response.json({ error: { code, message, details } }, { status });
}

export function parseJson<T>(schema: z.ZodSchema<T>, body: unknown) {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const details = parsed.error.issues.map((i) => ({
      path: i.path.join("."),
      message: i.message,
    }));
    return { success: false as const, details };
  }
  return { success: true as const, data: parsed.data };
}

export function logServerError(
  error: unknown,
  context: Record<string, unknown>
) {
  const err =
    error instanceof Error
      ? { message: error.message, stack: error.stack }
      : { message: String(error) };
  log("error", "Unhandled server error", { ...context, error: err });
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm test src/lib/__tests__/api.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/lib/logger.ts src/lib/api.ts src/lib/__tests__/api.test.ts
git commit -m "feat(api): add JSON logging and response helpers"
```

---

### Task 3: Extend DB helpers for filters and item detail

**Files:**

- Modify: `src/db/index.ts`
- Test: `src/db/__tests__/content-items.test.ts`

- [ ] **Step 1: Write failing tests for filtered list + item detail**

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestDb, cleanupTestDb, seedTestDb } from "../test-utils";
import { contentItems } from "../index";

describe("contentItems.listWithFilters", () => {
  beforeEach(() => cleanupTestDb());
  afterEach(() => cleanupTestDb());

  it("filters by type and source", () => {
    const db = createTestDb();
    seedTestDb(db, {
      contentItems: [
        {
          id: "1",
          type: "note",
          title: "a",
          content: "x",
          source: "web",
          created_at: "2024-01-01T00:00:00.000Z",
          updated_at: "2024-01-01T00:00:00.000Z",
        },
        {
          id: "2",
          type: "bookmark",
          title: "b",
          content: "y",
          source: "discord",
          created_at: "2024-01-02T00:00:00.000Z",
          updated_at: "2024-01-02T00:00:00.000Z",
        },
      ],
    });

    const result = contentItems.listWithFilters(db, {
      type: "note",
      source: "web",
      limit: 20,
      offset: 0,
    });

    expect(result.total).toBe(1);
    expect(result.items[0].id).toBe("1");
    db.close();
  });
});

describe("contentItems.findWithRelations", () => {
  beforeEach(() => cleanupTestDb());
  afterEach(() => cleanupTestDb());

  it("returns item with tags and links", () => {
    const db = createTestDb();
    seedTestDb(db, {
      contentItems: [
        {
          id: "1",
          type: "note",
          title: "a",
          content: "x",
          source: "web",
          created_at: "2024-01-01T00:00:00.000Z",
          updated_at: "2024-01-01T00:00:00.000Z",
        },
        {
          id: "2",
          type: "note",
          title: "b",
          content: "y",
          source: "web",
          created_at: "2024-01-01T00:00:00.000Z",
          updated_at: "2024-01-01T00:00:00.000Z",
        },
      ],
      tags: [{ id: "t1", name: "tag", created_at: "2024-01-01T00:00:00.000Z" }],
      contentTags: [
        {
          content_id: "1",
          tag_id: "t1",
          created_at: "2024-01-01T00:00:00.000Z",
        },
      ],
      links: [
        {
          id: "l1",
          source_id: "1",
          target_id: "2",
          link_type: "reference",
          created_at: "2024-01-01T00:00:00.000Z",
        },
      ],
    });

    const result = contentItems.findWithRelations(db, "1");
    expect(result?.item.id).toBe("1");
    expect(result?.tags.length).toBe(1);
    expect(result?.links.outbound.length).toBe(1);
    expect(result?.links.inbound.length).toBe(0);
    db.close();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test src/db/__tests__/content-items.test.ts`
Expected: FAIL with missing exports.

- [ ] **Step 3: Implement listWithFilters + findWithRelations**

```ts
export const contentItems = {
  ...contentItems,
  listWithFilters: (
    db: Database.Database,
    options: {
      type?: string;
      tag?: string;
      source?: string;
      startDate?: string;
      endDate?: string;
      limit: number;
      offset: number;
    }
  ) => {
    const where: string[] = [];
    const params: (string | number)[] = [];

    if (options.type) {
      where.push("ci.type = ?");
      params.push(options.type);
    }
    if (options.source) {
      where.push("ci.source = ?");
      params.push(options.source);
    }
    if (options.startDate) {
      where.push("ci.created_at >= ?");
      params.push(options.startDate);
    }
    if (options.endDate) {
      where.push("ci.created_at <= ?");
      params.push(options.endDate);
    }

    let join = "";
    if (options.tag) {
      join = `
        JOIN content_tags ct ON ct.content_id = ci.id
        JOIN tags t ON t.id = ct.tag_id
      `;
      where.push("t.name = ?");
      params.push(options.tag);
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const countStmt = db.prepare(`
      SELECT COUNT(*) as count
      FROM content_items ci
      ${join}
      ${whereSql}
    `);
    const total = (countStmt.get(...params) as { count: number }).count;

    const itemsStmt = db.prepare(`
      SELECT ci.*
      FROM content_items ci
      ${join}
      ${whereSql}
      ORDER BY ci.created_at DESC
      LIMIT ? OFFSET ?
    `);

    const items = itemsStmt.all(
      ...params,
      options.limit,
      options.offset
    ) as ContentItem[];
    return { items, total };
  },

  findWithRelations: (db: Database.Database, id: string) => {
    const item = contentItems.findById(db, id);
    if (!item) return null;

    const tags = contentTags.findByContent(db, id);
    const outbound = contentLinks.findBySource(db, id);
    const inbound = contentLinks.findByTarget(db, id);

    return { item, tags, links: { outbound, inbound } };
  },
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test src/db/__tests__/content-items.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/db/index.ts src/db/__tests__/content-items.test.ts
git commit -m "feat(db): add filtered list and item relations helpers"
```

---

### Task 4: Implement /api/items (GET/POST)

**Files:**

- Create: `src/app/api/items/route.ts`
- Test: `src/app/api/__tests__/items.test.ts`

- [ ] **Step 1: Write failing tests for POST and GET**

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { cleanupTestDb, createTestDb } from "@/db/test-utils";
import { GET, POST } from "@/app/api/items/route";

describe("/api/items", () => {
  beforeEach(() => {
    cleanupTestDb();
    createTestDb().close();
  });

  afterEach(() => {
    cleanupTestDb();
  });

  it("creates a content item", async () => {
    const req = new Request("http://localhost/api/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "note", content: "hello", source: "web" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.type).toBe("note");
    expect(json.content).toBe("hello");
  });

  it("returns paginated list", async () => {
    const createReq = new Request("http://localhost/api/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "note", content: "hello", source: "web" }),
    });
    await POST(createReq);

    const req = new Request("http://localhost/api/items?page=1&limit=20");
    const res = await GET(req);
    const json = await res.json();
    expect(json.items.length).toBeGreaterThan(0);
    expect(json.page).toBe(1);
    expect(json.limit).toBe(20);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test src/app/api/__tests__/items.test.ts`
Expected: FAIL with missing route or exports.

- [ ] **Step 3: Implement route handlers**

```ts
import { z } from "zod";
import { getDb, contentItems, auditLogs } from "@/db/index";
import {
  parsePagination,
  errorResponse,
  parseJson,
  logServerError,
} from "@/lib/api";
import { log } from "@/lib/logger";

const createSchema = z.object({
  type: z.string(),
  content: z.string().min(1),
  title: z.string().nullable().optional(),
  source: z.string().optional(),
  source_url: z.string().url().optional(),
  metadata: z.record(z.unknown()).optional(),
  is_private: z.number().optional(),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = parseJson(createSchema, body);
    if (!parsed.success) {
      return errorResponse("VALIDATION_ERROR", "Invalid input", 400, {
        issues: parsed.details,
      });
    }

    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    const db = getDb({ env: "test" });
    const metadata = parsed.data.metadata
      ? JSON.stringify(parsed.data.metadata)
      : null;

    contentItems.create(db, {
      id,
      type: parsed.data.type,
      title: parsed.data.title ?? null,
      content: parsed.data.content,
      source: parsed.data.source ?? "manual",
      source_url: parsed.data.source_url ?? null,
      metadata,
      is_private: parsed.data.is_private ?? 0,
      created_at: now,
      updated_at: now,
    });

    auditLogs.create(db, {
      id: crypto.randomUUID(),
      actor_type: "system",
      action: "content_item.create",
      entity_type: "content_item",
      entity_id: id,
      success: 1,
      metadata: null,
      created_at: now,
    });

    log("info", "content_item created", { event: "content_item.create", id });
    return Response.json(contentItems.findById(db, id), { status: 201 });
  } catch (error) {
    logServerError(error, { route: "/api/items", method: "POST" });
    return errorResponse("INTERNAL_ERROR", "Something went wrong", 500);
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const { page, limit, offset } = parsePagination({
      page: searchParams.get("page") ?? undefined,
      limit: searchParams.get("limit") ?? undefined,
    });

    const db = getDb({ env: "test" });
    const result = contentItems.listWithFilters(db, {
      type: searchParams.get("type") ?? undefined,
      tag: searchParams.get("tag") ?? undefined,
      source: searchParams.get("source") ?? undefined,
      startDate: searchParams.get("startDate") ?? undefined,
      endDate: searchParams.get("endDate") ?? undefined,
      limit,
      offset,
    });

    log("info", "content_items listed", {
      event: "content_item.list",
      count: result.items.length,
    });

    return Response.json({
      items: result.items,
      total: result.total,
      page,
      limit,
    });
  } catch (error) {
    logServerError(error, { route: "/api/items", method: "GET" });
    return errorResponse("INTERNAL_ERROR", "Something went wrong", 500);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test src/app/api/__tests__/items.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/api/items/route.ts src/app/api/__tests__/items.test.ts
git commit -m "feat(api): add content items list and create routes"
```

---

### Task 5: Implement /api/items/[id] (GET/PATCH/DELETE)

**Files:**

- Create: `src/app/api/items/[id]/route.ts`
- Modify: `src/app/api/__tests__/items.test.ts`

- [ ] **Step 1: Write failing tests for GET/PATCH/DELETE**

```ts
import { describe, it, expect } from "vitest";
import { GET as GET_BY_ID, PATCH, DELETE } from "@/app/api/items/[id]/route";

it("returns 404 for missing item", async () => {
  const req = new Request("http://localhost/api/items/does-not-exist");
  const res = await GET_BY_ID(req, { params: { id: "does-not-exist" } });
  expect(res.status).toBe(404);
});

it("updates an item", async () => {
  const createReq = new Request("http://localhost/api/items", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "note", content: "hello" }),
  });
  const createRes = await POST(createReq);
  const created = await createRes.json();

  const patchReq = new Request(`http://localhost/api/items/${created.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content: "updated" }),
  });
  const patchRes = await PATCH(patchReq, { params: { id: created.id } });
  const patched = await patchRes.json();
  expect(patched.content).toBe("updated");
});

it("deletes an item", async () => {
  const createReq = new Request("http://localhost/api/items", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "note", content: "bye" }),
  });
  const createRes = await POST(createReq);
  const created = await createRes.json();

  const deleteReq = new Request(`http://localhost/api/items/${created.id}`, {
    method: "DELETE",
  });
  const deleteRes = await DELETE(deleteReq, { params: { id: created.id } });
  expect(deleteRes.status).toBe(200);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test src/app/api/__tests__/items.test.ts`
Expected: FAIL with missing route or exports.

- [ ] **Step 3: Implement route handlers**

```ts
import { z } from "zod";
import {
  getDb,
  contentItems,
  auditLogs,
  contentLinks,
  contentTags,
} from "@/db/index";
import { errorResponse, parseJson, logServerError } from "@/lib/api";
import { log } from "@/lib/logger";

const patchSchema = z.object({
  title: z.string().optional(),
  content: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
  is_private: z.number().optional(),
});

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const db = getDb({ env: "test" });
    const result = contentItems.findWithRelations(db, params.id);
    if (!result) {
      return errorResponse("NOT_FOUND", "Item not found", 404);
    }
    return Response.json(result);
  } catch (error) {
    logServerError(error, { route: "/api/items/[id]", method: "GET" });
    return errorResponse("INTERNAL_ERROR", "Something went wrong", 500);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const parsed = parseJson(patchSchema, body);
    if (!parsed.success) {
      return errorResponse("VALIDATION_ERROR", "Invalid input", 400, {
        issues: parsed.details,
      });
    }

    const db = getDb({ env: "test" });
    const existing = contentItems.findById(db, params.id);
    if (!existing) {
      return errorResponse("NOT_FOUND", "Item not found", 404);
    }

    const updates = {
      title: parsed.data.title ?? undefined,
      content: parsed.data.content ?? undefined,
      metadata: parsed.data.metadata
        ? JSON.stringify(parsed.data.metadata)
        : undefined,
      updated_at: new Date().toISOString(),
    };
    contentItems.update(db, params.id, updates);

    auditLogs.create(db, {
      id: crypto.randomUUID(),
      actor_type: "system",
      action: "content_item.update",
      entity_type: "content_item",
      entity_id: params.id,
      success: 1,
      metadata: null,
      created_at: updates.updated_at,
    });

    const updated = contentItems.findById(db, params.id);
    log("info", "content_item updated", {
      event: "content_item.update",
      id: params.id,
    });
    return Response.json(updated);
  } catch (error) {
    logServerError(error, { route: "/api/items/[id]", method: "PATCH" });
    return errorResponse("INTERNAL_ERROR", "Something went wrong", 500);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const db = getDb({ env: "test" });
    const existing = contentItems.findById(db, params.id);
    if (!existing) {
      return errorResponse("NOT_FOUND", "Item not found", 404);
    }

    const now = new Date().toISOString();
    const tx = db.transaction(() => {
      db.prepare(
        "DELETE FROM content_links WHERE source_id = ? OR target_id = ?"
      ).run(params.id, params.id);
      db.prepare("DELETE FROM content_tags WHERE content_id = ?").run(
        params.id
      );
      db.prepare(
        "DELETE FROM content_vectors WHERE rowid = (SELECT rowid FROM content_items WHERE id = ?)"
      ).run(params.id);
      contentItems.delete(db, params.id);
    });
    tx();

    auditLogs.create(db, {
      id: crypto.randomUUID(),
      actor_type: "system",
      action: "content_item.delete",
      entity_type: "content_item",
      entity_id: params.id,
      success: 1,
      metadata: null,
      created_at: now,
    });

    log("info", "content_item deleted", {
      event: "content_item.delete",
      id: params.id,
    });
    return Response.json({ id: params.id });
  } catch (error) {
    logServerError(error, { route: "/api/items/[id]", method: "DELETE" });
    return errorResponse("INTERNAL_ERROR", "Something went wrong", 500);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test src/app/api/__tests__/items.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/api/items/[id]/route.ts src/app/api/__tests__/items.test.ts
git commit -m "feat(api): add content item detail routes"
```

---

## Self-Review

- Spec coverage: CRUD endpoints, error format, pagination defaults/caps, JSON logger, audit log table and helper, tests for routes and DB helpers.
- Placeholder scan: none.
- Type consistency: `auditLogs.create` and `contentItems.listWithFilters/findWithRelations` names consistent across tasks.

---

Plan complete and saved to `docs/superpowers/plans/2026-05-20-content-item-crud.md`. Two execution options:

1. Subagent-Driven (recommended) - I dispatch a fresh subagent per task, review between tasks, fast iteration
2. Inline Execution - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
