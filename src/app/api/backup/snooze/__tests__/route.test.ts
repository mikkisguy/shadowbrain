import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { authedRequest, cleanupTestDb, createTestDb } from "@/db/test-utils";
import { getDb, settings } from "@/db/index";
import { POST } from "@/app/api/backup/snooze/route";

describe("/api/backup/snooze", () => {
  beforeEach(() => {
    cleanupTestDb();
    createTestDb().close();
  });

  afterEach(() => {
    cleanupTestDb();
    vi.unstubAllGlobals();
  });

  it("increments snooze_count from 0 to 1", async () => {
    const db = getDb();
    settings.set(db, "backup_snooze_count", "0");

    const res = await POST(
      await authedRequest("http://localhost/api/backup/snooze", {
        method: "POST",
      })
    );
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.snoozeCount).toBe(1);
    expect(settings.get(db, "backup_snooze_count")).toBe("1");
  });

  it("increments snooze_count from existing value", async () => {
    const db = getDb();
    settings.set(db, "backup_snooze_count", "2");

    const res = await POST(
      await authedRequest("http://localhost/api/backup/snooze", {
        method: "POST",
      })
    );
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.snoozeCount).toBe(3);
  });

  it("handles missing/invalid snooze_count gracefully (treats as 0)", async () => {
    const db = getDb();
    // Delete the key if it exists
    settings.delete(db, "backup_snooze_count");

    const res = await POST(
      await authedRequest("http://localhost/api/backup/snooze", {
        method: "POST",
      })
    );
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.snoozeCount).toBe(1);
  });

  it("rejects with 401 when unauthenticated", async () => {
    const res = await POST(
      new Request("http://localhost/api/backup/snooze", { method: "POST" })
    );
    expect(res.status).toBe(401);
  });
});
