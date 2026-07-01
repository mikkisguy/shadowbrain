/**
 * Auth-related audit logging.
 *
 * Writes a row to the existing `audit_logs` table with the
 * standard shape used by the rest of the app. The action string is
 * one of:
 *
 *   - `auth.login.success`
 *   - `auth.login.failure`
 *   - `auth.logout`
 *
 * `success` is `0` for failures and `1` otherwise; the `metadata`
 * column carries a JSON blob of contextual details (e.g. the
 * submitted username on a failure, the reason the rate limiter
 * rejected the request, etc.). The plaintext password is **never**
 * included.
 */

import { getDb, auditLogs } from "@/db/index";

export type AuthEventAction =
  "auth.login.success" | "auth.login.failure" | "auth.logout";

export interface LogAuthEventInput {
  action: AuthEventAction;
  /** The submitted username, if known. The success branch also
   *  stores this so an admin can grep "who logged in when". The
   *  failure branch may carry an unknown / wrong username — the
   *  caller should still log it for forensics. */
  username?: string | null;
  success: boolean;
  ip?: string | null;
  userAgent?: string | null;
  /** Free-form JSON-serialisable context. Must not contain
   *  secrets (passwords, hashes, session cookies). */
  metadata?: Record<string, unknown>;
}

/** Append a row to `audit_logs` for an auth event. Errors during
 *  audit logging are swallowed and logged to stderr — auditing
 *  must never be the cause of a failed request. */
export function logAuthEvent(input: LogAuthEventInput): void {
  try {
    const db = getDb();
    auditLogs.create(db, {
      id: crypto.randomUUID(),
      actor_id: input.username ?? null,
      actor_type: "user",
      action: input.action,
      entity_type: "auth_session",
      entity_id: null,
      success: input.success ? 1 : 0,
      ip: input.ip ?? null,
      user_agent: input.userAgent ?? null,
      metadata: input.metadata
        ? JSON.stringify(redactSecrets(input.metadata))
        : null,
      created_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error(
      JSON.stringify({
        level: "error",
        msg: "Failed to write auth audit log",
        action: input.action,
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      })
    );
  }
}

const SECRET_KEYS = new Set([
  "password",
  "passwordhash",
  "passwd",
  "secret",
  "session",
  "sessionsecret",
  "cookie",
  "token",
  "apitoken",
  "apikey",
]);

/** Defensive redaction for the metadata blob. Drops any key that
 *  looks like it could carry a secret, even if a caller
 *  accidentally included one. Walks nested objects and arrays so a
 *  secret buried in a sub-object does not slip through. */
function redactSecrets(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(redactSecrets);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (SECRET_KEYS.has(k.toLowerCase())) {
      out[k] = "[REDACTED]";
    } else {
      out[k] = redactSecrets(v);
    }
  }
  return out;
}
