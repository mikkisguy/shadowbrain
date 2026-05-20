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
    const entityId = crypto.randomUUID();
    const result = auditLogs.create(db, {
      id: crypto.randomUUID(),
      actor_id: null,
      actor_type: "system",
      action: "content_item.create",
      entity_type: "content_item",
      entity_id: entityId,
      success: 1,
      metadata: JSON.stringify({ foo: "bar" }),
      ip: "127.0.0.1",
      user_agent: "vitest",
      created_at: now,
    });

    expect(result.changes).toBe(1);

    const row = db
      .prepare(
        "SELECT action, entity_id, success FROM audit_logs WHERE entity_id = ?"
      )
      .get(entityId) as
      | { action: string; entity_id: string; success: number }
      | undefined;

    expect(row?.action).toBe("content_item.create");
    expect(row?.entity_id).toBe(entityId);
    expect(row?.success).toBe(1);
    db.close();
  });
});
