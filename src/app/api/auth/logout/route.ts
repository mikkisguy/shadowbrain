/**
 * POST /api/auth/logout
 *
 * Clears the session cookie and redirects the browser back to
 * `/login`. Returning a 303 (See Other) means a plain HTML form
 * submission — no JS required — gives the user a clean
 * post-logout flow: the browser POSTs the form, the server
 * drops the cookie, and the browser follows the redirect to the
 * sign-in page. The `SameSite=Lax` cookie is cleared on the
 * response so the next render of `/login` sees the visitor as
 * unauthenticated.
 *
 * The endpoint is safe to call without an existing session —
 * the response is the same 303 either way (this avoids leaking
 * whether a cookie was present). The logout event is recorded
 * to `audit_logs` whenever the request reaches the route.
 */

import { getEnv } from "@/lib/env";
import { log } from "@/lib/logger";
import { getClientIp } from "@/lib/auth/client-ip";
import { logAuthEvent } from "@/lib/auth/audit";
import { buildClearSessionCookie } from "@/lib/auth/session";

export async function POST(request: Request) {
  const env = getEnv();
  const isProd = env.NODE_ENV === "production";
  const cookie = buildClearSessionCookie(isProd);

  const ip = getClientIp(request);
  const userAgent = request.headers.get("user-agent");

  // We deliberately do not verify the session here. The client
  // might be logging out because the cookie is already invalid;
  // either way, the response shape is identical.
  logAuthEvent({
    action: "auth.logout",
    success: true,
    ip,
    userAgent,
  });
  log("info", "auth.logout", { event: "auth.logout", ip });

  return new Response(null, {
    status: 303,
    headers: {
      Location: "/login",
      "Set-Cookie": cookie,
    },
  });
}
