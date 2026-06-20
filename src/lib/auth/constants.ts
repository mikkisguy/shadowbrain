/**
 * Shared constants for the auth subsystem.
 *
 * Kept in one place so that the exempt list (§3 in the security spec),
 * the session cookie name, and the lifetime bounds are all visible at
 * a glance. **Do not** match the exempt list by suffix or prefix —
 * exact-pathname equality is the only correct rule.
 */

// Single cookie name for the session. The leading `sb_` keeps it
// recognisable in DevTools without leaking the framework.
export const SESSION_COOKIE_NAME = "sb_session";

/** Minimum lifetime: 1 hour. Below this the sliding-renewal window
 *  starts to feel hostile to active users. */
export const MIN_SESSION_AGE_MS = 60 * 60 * 1000;

/** Maximum lifetime: 30 days. Above this the value of a leaked
 *  cookie becomes unreasonable. */
export const MAX_SESSION_AGE_MS = 30 * 24 * 60 * 60 * 1000;

/** Default lifetime: 24 hours. Tunable via SESSION_MAX_AGE (ms). */
export const DEFAULT_SESSION_AGE_MS = 24 * 60 * 60 * 1000;

/** Login page path (also exempt from auth). */
export const LOGIN_PATH = "/login";

/** Public auth API endpoints (also exempt from auth + CSRF). These
 *  are matched by exact pathname, not by prefix — see `isExemptPath`.
 *  Not exported: this is an implementation detail of
 *  `EXEMPT_FROM_AUTH` and the exempt list is reviewed together. */
const PUBLIC_AUTH_PATHS: ReadonlySet<string> = new Set([
  "/api/auth/login",
  "/api/auth/logout",
]);

/** Path prefixes served by Next.js' static pipeline. We match the
 *  pathname's first segment against this set; anything starting with
 *  `/_next/`, `/favicon.ico`, etc. is not our concern. Exported
 *  so the exempt-path helper can use it. */
export const STATIC_PREFIXES: readonly string[] = [
  "/_next/",
  "/favicon.ico",
  "/public/",
];

/** The login route is exempt from auth + CSRF. Static assets are
 *  exempt from auth but **not** from CSRF (they're not state-changing
 *  anyway, so the CSRF check is a no-op for GETs). */
export const EXEMPT_FROM_AUTH: ReadonlySet<string> = new Set([
  LOGIN_PATH,
  ...PUBLIC_AUTH_PATHS,
]);

/** State-changing methods that need an Origin / Referer CSRF check. */
export const STATE_CHANGING_METHODS: ReadonlySet<string> = new Set([
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
]);

/** Login rate limit: ≈5 attempts per 15 minutes per IP. The spec calls
 *  for an in-memory token bucket; this is process-local and resets on
 *  process restart, which is acceptable for a single VPS. */
export const LOGIN_RATE_LIMIT_MAX = 5;
export const LOGIN_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
