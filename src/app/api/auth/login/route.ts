/**
 * POST /api/auth/login
 *
 * Body: { username: string, password: string }
 *
 * On success: 200 with `{ ok: true }` and a `Set-Cookie` carrying
 * the signed session. On failure: 401 with a generic
 * `"Invalid credentials"` message — the same message for both
 * "user not found" and "wrong password".
 *
 * Rate-limited per IP at ≈5 attempts / 15 min. The check itself
 * lives in the **proxy** (`src/proxy.ts`) so the limit is enforced
 * before the request reaches this handler; this module just resets
 * the bucket on a successful login (a legitimate user should not
 * be penalised for typos) and reads the same `loginRateLimiter`
 * singleton the proxy uses.
 *
 * All attempts (success and failure) are logged to `audit_logs`.
 */

import { z } from "zod";

import { getEnv } from "@/lib/env";
import { log } from "@/lib/logger";
import { errorResponse, parseJson } from "@/lib/api";
import { getClientIp } from "@/lib/auth/client-ip";
import { logAuthEvent } from "@/lib/auth/audit";
import { verifyPasswordConstantTime } from "@/lib/auth/password";
import { resetLoginRateLimit } from "@/lib/auth/login-rate-limit";
import {
  buildSessionCookie,
  getSessionMaxAge,
  signSessionValue,
} from "@/lib/auth/session";

const loginSchema = z.object({
  username: z.string().min(1).max(256),
  password: z.string().min(1).max(1024),
});

export async function POST(request: Request) {
  const env = getEnv();
  // Read the client IP from the configured trusted-proxy header
  // (the same one the proxy uses for the rate-limit bucket), so
  // the audit log entry and the bucket key agree.
  const ip = getClientIp(request, { header: env.TRUSTED_PROXY_HEADER });
  const userAgent = request.headers.get("user-agent");

  // ── 1. Validate body shape ──────────────────────────────────
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return errorResponse("VALIDATION_ERROR", "Invalid JSON", 400);
  }
  const parsed = parseJson(loginSchema, rawBody);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid input", 400, {
      issues: parsed.details,
    });
  }

  const { username, password } = parsed.data;
  const usernameMatches = username === env.ADMIN_USERNAME;
  // When the username does not match, we still want to run the
  // bcrypt compare against a real hash to keep the wall-clock cost
  // identical to the "user exists, wrong password" branch. The
  // constant-time helper handles this — we just hand it a null
  // `storedHash` when the username is wrong.
  const storedHash = usernameMatches ? env.ADMIN_PASSWORD_HASH : null;

  const verify = await verifyPasswordConstantTime({
    submittedPassword: password,
    storedHash,
  });

  if (!verify.ok) {
    logAuthEvent({
      action: "auth.login.failure",
      username,
      success: false,
      ip,
      userAgent,
      metadata: { reason: usernameMatches ? "wrong-password" : "no-such-user" },
    });
    log("info", "auth.login.failure", {
      event: "auth.login.failure",
      ip,
      usernameMatch: usernameMatches,
    });
    return errorResponse("UNAUTHORIZED", "Invalid credentials", 401);
  }

  // ── 2. Issue session cookie ─────────────────────────────────
  const maxAgeMs = getSessionMaxAge(env.SESSION_MAX_AGE);
  const value = await signSessionValue({
    username: env.ADMIN_USERNAME,
    secret: env.SESSION_SECRET,
    maxAgeMs,
  });
  const isProd = env.NODE_ENV === "production";
  const cookie = buildSessionCookie(value, maxAgeMs, isProd);

  // Reset the shared rate-limit bucket on a successful login so a
  // legitimate user is not penalised for typos. The proxy enforces
  // the same bucket before this handler runs.
  resetLoginRateLimit(ip);

  logAuthEvent({
    action: "auth.login.success",
    username: env.ADMIN_USERNAME,
    success: true,
    ip,
    userAgent,
  });
  log("info", "auth.login.success", {
    event: "auth.login.success",
    ip,
  });

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie": cookie,
    },
  });
}

/** Internal: helpers exported only for tests. */
export const __test = {
  signSessionValue,
  getSessionMaxAge,
  buildSessionCookie,
};
