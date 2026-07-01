import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  authedGet,
  authedRequest,
  cleanupTestDb,
  createTestDb,
} from "@/db/test-utils";
import { getDb, settings } from "@/db/index";
import { GET, POST } from "@/app/api/backup/route";

describe("/api/backup", () => {
  beforeEach(() => {
    cleanupTestDb();
    createTestDb().close();
  });

  afterEach(() => {
    cleanupTestDb();
    vi.unstubAllGlobals();
  });

  it("returns enforce severity when never backed up", async () => {
    const res = await GET(await authedGet("http://localhost/api/backup"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.lastBackupAt).toBeNull();
    expect(json.daysSince).toBeNull();
    expect(json.severity).toBe("enforce");
    expect(json.snoozeCount).toBe(0);
  });

  it("returns hidden severity when last backup was 3 days ago", async () => {
    const db = getDb();
    const threeDaysAgo = new Date(Date.now() - 3 * 86_400_000).toISOString();
    settings.set(db, "last_backup_at", threeDaysAgo);

    const res = await GET(await authedGet("http://localhost/api/backup"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.lastBackupAt).toBe(threeDaysAgo);
    expect(json.daysSince).toBe(3);
    expect(json.severity).toBe("hidden");
  });

  it("returns gentle severity when last backup was 10 days ago", async () => {
    const db = getDb();
    const tenDaysAgo = new Date(Date.now() - 10 * 86_400_000).toISOString();
    settings.set(db, "last_backup_at", tenDaysAgo);

    const res = await GET(await authedGet("http://localhost/api/backup"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.daysSince).toBe(10);
    expect(json.severity).toBe("gentle");
  });

  it("returns prominent severity when last backup was 12 days ago", async () => {
    const db = getDb();
    const twelveDaysAgo = new Date(Date.now() - 12 * 86_400_000).toISOString();
    settings.set(db, "last_backup_at", twelveDaysAgo);

    const res = await GET(await authedGet("http://localhost/api/backup"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.daysSince).toBe(12);
    expect(json.severity).toBe("prominent");
  });

  it("returns enforce severity when last backup was 20 days ago", async () => {
    const db = getDb();
    const twentyDaysAgo = new Date(Date.now() - 20 * 86_400_000).toISOString();
    settings.set(db, "last_backup_at", twentyDaysAgo);

    const res = await GET(await authedGet("http://localhost/api/backup"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.daysSince).toBe(20);
    expect(json.severity).toBe("enforce");
  });

  it("POST marks backed up: sets last_backup_at, resets snooze_count, writes audit event", async () => {
    const db = getDb();
    // Pre-seed an old backup and a snooze count
    const oldBackup = new Date(Date.now() - 20 * 86_400_000).toISOString();
    settings.set(db, "last_backup_at", oldBackup);
    settings.set(db, "backup_snooze_count", "2");

    const res = await POST(
      await authedRequest("http://localhost/api/backup", {
        method: "POST",
      })
    );
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.lastBackupAt).not.toBeNull();
    expect(json.daysSince).toBe(0);
    expect(json.severity).toBe("hidden");
    expect(json.snoozeCount).toBe(0);

    // Verify DB state
    expect(settings.get(db, "last_backup_at")).not.toBeNull();
    expect(settings.get(db, "backup_snooze_count")).toBe("0");

    // Verify audit log was written
    const auditLogRow = db
      .prepare("SELECT * FROM audit_logs WHERE action = ?")
      .get("backup.marked") as
      | {
          actor_type: string;
          actor_id: string | null;
          entity_type: string;
          entity_id: string | null;
          success: number;
          metadata: string | null;
        }
      | undefined;
    expect(auditLogRow).toBeDefined();
    if (!auditLogRow) return;
    const auditLog = auditLogRow;
    expect(auditLog.actor_type).toBe("user");
    expect(auditLog.actor_id).toBe("admin"); // test session username
    expect(auditLog.entity_type).toBe("settings");
    expect(auditLog.entity_id).toBe("last_backup_at");
    expect(auditLog.success).toBe(1);
    const meta = JSON.parse(auditLog.metadata as string);
    expect(meta.last_backup_at).toBe(json.lastBackupAt);
  });

  it("rejects GET with 401 when unauthenticated", async () => {
    const res = await GET(new Request("http://localhost/api/backup"));
    expect(res.status).toBe(401);
  });

  it("rejects POST with 401 when unauthenticated", async () => {
    const res = await POST(
      new Request("http://localhost/api/backup", { method: "POST" })
    );
    expect(res.status).toBe(401);
  });
});
