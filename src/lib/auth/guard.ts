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
