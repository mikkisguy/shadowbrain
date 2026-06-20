/**
 * POST /api/auth/logout
 *
 * Clears the session cookie. The endpoint is safe to call without
 * an existing session — the response is the same 200 either way
 * (this avoids leaking whether a cookie was present). The logout
 * event is recorded to `audit_logs` when a session was present.
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

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie": cookie,
    },
  });
}
