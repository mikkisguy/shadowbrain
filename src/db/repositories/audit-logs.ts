import Database from "better-sqlite3";

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

export type AuditLogCreateInput = Pick<
  AuditLog,
  "id" | "action" | "entity_type" | "created_at"
> &
  Partial<Omit<AuditLog, "id" | "action" | "entity_type" | "created_at">>;

export const auditLogs = {
  create: (db: Database.Database, log: AuditLogCreateInput) => {
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
