/**
 * Route-handler auth guard.
 *
 * The proxy already enforces auth for every protected route.
 * This helper is the *defense-in-depth* check inside each route
 * handler — a test that calls the route function directly
 * (without going through the proxy) still fails closed, and
 * any future proxy misconfiguration does not silently
 * expose a handler.
 *
 * Supports two authentication methods:
 *   1. **Bearer token** (`Authorization: Bearer <token>`) — for
 *      programmatic access. Only valid on content-management routes
 *      (`/api/items`, `/api/tags`, `/api/links`, `/api/images`).
 *      Returns 403 for routes outside the token scope.
 *   2. **Session cookie** — the standard browser-based auth.
 *
 * Usage:
 *
 *     export async function GET(request: Request) {
 *       const auth = await requireAuthenticated(request);
 *       if (!auth.ok) return auth.response;
 *       // ... handler logic
 *     }
 *
 * The function is `async` (rather than sync) because the
 * underlying session verification uses Web Crypto's HMAC, which
 * is itself async. Keeping the signature async here avoids
 * surprising callers who might `await` it inconsistently.
 */

import { getEnv } from "@/lib/env";
import { readSessionFromRequest } from "./session";
import { verifyToken, isPathInTokenScope } from "@/lib/auth/api-token";
import { getDb } from "@/db/index";
import { apiTokens } from "@/db/repositories/api-tokens";
import { logAuthEvent } from "@/lib/auth/audit";
import { getClientIp } from "@/lib/auth/client-ip";

export type GuardResult =
  { ok: true; username: string } | { ok: false; response: Response };

/** Verify that `request` carries a valid session cookie or a valid
 *  Bearer token. Returns `{ ok: true, username }` on success, or
 *  `{ ok: false, response }` where `response` is a ready-to-return
 *  error response. */
export async function requireAuthenticated(
  request: Request
): Promise<GuardResult> {
  const env = getEnv();

  // E2E mode: bypass auth for testing. The proxy also skips auth
  // in e2e mode (see src/proxy.ts), and this guard follows suit
  // so every route handler accepts requests without credentials.
  // Only reachable when NODE_ENV=e2e — never in dev/prod/test.
  // The username "e2e" is a deliberate marker so audit-log entries
  // written during test runs are distinguishable. The e2e DB is
  // fully isolated (data/shadowbrain.e2e.db) so this never
  // contaminates production.
  if (env.NODE_ENV === "e2e") {
    return { ok: true, username: "e2e" };
  }

  // ── Bearer token auth ──────────────────────────────────────
  const authHeader = request.headers.get("authorization");

  if (authHeader && authHeader.startsWith("Bearer ")) {
    const rawToken = authHeader.slice(7).trim();
    const url = new URL(request.url);
    const pathname = url.pathname;

    // Check scope: token is only valid on content-management routes.
    if (!isPathInTokenScope(pathname)) {
      return {
        ok: false,
        response: new Response(
          JSON.stringify({
            error: {
              code: "FORBIDDEN",
              message: "This token cannot access this endpoint",
            },
          }),
          { status: 403, headers: { "Content-Type": "application/json" } }
        ),
      };
    }

    const db = getDb();
    const row = await verifyToken(rawToken, db);

    if (row) {
      // Record usage and log audit event. Bookkeeping failures
      // (recordUsage / audit log) must not reject valid requests;
      // the token is still valid regardless of whether we managed
      // to write the metadata.
      const ip = getClientIp(request, {
        header: env.TRUSTED_PROXY_HEADER,
      });
      try {
        apiTokens.recordUsage(db, row.id, ip);
      } catch {
        // swallowed — see comment above.
      }
      logAuthEvent({
        action: "auth.token.used",
        username: `__api_token__:${row.id}`,
        success: true,
        ip,
        entityType: "api_token",
        entityId: row.id,
        metadata: { token_id: row.id, token_name: row.name },
      });
      return { ok: true, username: "__api_token__" };
    }

    // Token not valid.
    return {
      ok: false,
      response: new Response(
        JSON.stringify({
          error: { code: "UNAUTHORIZED", message: "Unauthorized" },
        }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      ),
    };
  }

  // ── Session cookie auth (existing) ─────────────────────────
  const result = await readSessionFromRequest(request, env.SESSION_SECRET);
  if (!result.ok || !result.session) {
    return {
      ok: false,
      response: new Response(
        JSON.stringify({
          error: { code: "UNAUTHORIZED", message: "Unauthorized" },
        }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      ),
    };
  }
  return { ok: true, username: result.session.username };
}
