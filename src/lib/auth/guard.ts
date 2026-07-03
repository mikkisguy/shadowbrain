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

export type GuardResult =
  { ok: true; username: string } | { ok: false; response: Response };

/** Verify that `request` carries a valid session cookie. Returns
 *  `{ ok: true, username }` on success, or `{ ok: false,
 *  response }` where `response` is a ready-to-return 401 with a
 *  generic `"Unauthorized"` body. */
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
