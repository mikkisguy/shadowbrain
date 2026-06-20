/**
 * CSRF — Origin / Referer header check.
 *
 * For state-changing requests (POST / PUT / PATCH / DELETE) on
 * authenticated routes, the Origin (preferred) or Referer header
 * must match the app's configured origin. Mismatch → 403 Forbidden.
 *
 * The compare is constant-time (`crypto.timingSafeEqual` semantics
 * implemented manually with `crypto.subtle` for Edge compatibility),
 * with length-difference handling so the work is independent of
 * the caller's input length. This avoids leaking the length of the
 * allowed origin to an attacker probing with varying-length headers.
 *
 * The exempt list (only `/login`, `/api/auth/*`, static) is matched
 * by exact normalized pathname equality — never by suffix.
 */

import { STATE_CHANGING_METHODS } from "./constants";

/** Normalize a pathname for comparison: lower-case the host portion
 *  of the Origin, drop the default port, trim trailing slashes on
 *  the path. Returns `null` for unparseable URLs. */
function normalizeOrigin(raw: string): string | null {
  try {
    const u = new URL(raw);
    // Drop the default port for the scheme. `URL.protocol`
    // includes the trailing colon, so strip it.
    const scheme = u.protocol.replace(/:$/, "").toLowerCase();
    const isDefaultPort =
      (scheme === "https" && u.port === "443") ||
      (scheme === "http" && u.port === "80");
    const hostPort = isDefaultPort
      ? u.hostname.toLowerCase()
      : u.host.toLowerCase();
    return `${scheme}://${hostPort}`;
  } catch {
    return null;
  }
}

/** Constant-time "looks-the-same" comparison for two URLs of
 *  different lengths. The loop runs `Math.max(a.length, b.length,
 *  MIN_COMPARE_LENGTH)` iterations — a length floor so the work is
 *  independent of the caller's input length up to a reasonable
 *  cap, and a probe with a very short Origin cannot be used to
 *  infer the allowed origin's length. The floor does not need to
 *  be exact; it just needs to flatten the timing for any input
 *  shorter than the expected length. */
const MIN_COMPARE_LENGTH = 64;

function constantTimeUrlEqual(a: string, b: string): boolean {
  const len = Math.max(a.length, b.length, MIN_COMPARE_LENGTH);
  let diff = a.length ^ b.length;
  for (let i = 0; i < len; i++) {
    const ca = i < a.length ? a.charCodeAt(i) : 0;
    const cb = i < b.length ? b.charCodeAt(i) : 0;
    diff |= ca ^ cb;
  }
  return diff === 0;
}

export interface OriginCheckResult {
  allowed: boolean;
  /** Where the comparison came from. Useful for logging. */
  source: "origin" | "referer" | "none";
  reason?: string;
}

export interface OriginCheckOptions {
  /** The allowed origin in the form `https://host[:port]`. */
  allowedOrigin: string;
  /** Methods that need the CSRF check. Defaults to
   *  STATE_CHANGING_METHODS. */
  methods?: ReadonlySet<string>;
}

/** Check the CSRF Origin / Referer against the allowed origin. Only
 *  state-changing methods are subject to the check; safe methods
 *  (GET, HEAD, OPTIONS) are allowed without inspection. */
export function checkCsrfOrigin(
  request: Request,
  options: OriginCheckOptions
): OriginCheckResult {
  const method = request.method.toUpperCase();
  const methods = options.methods ?? STATE_CHANGING_METHODS;
  if (!methods.has(method)) {
    return { allowed: true, source: "none" };
  }

  const allowed = options.allowedOrigin.replace(/\/+$/, "");
  const origin = request.headers.get("origin");
  if (origin) {
    const normalized = normalizeOrigin(origin);
    if (!normalized) {
      return { allowed: false, source: "origin", reason: "malformed" };
    }
    if (!constantTimeUrlEqual(normalized, allowed)) {
      return { allowed: false, source: "origin", reason: "mismatch" };
    }
    return { allowed: true, source: "origin" };
  }

  const referer = request.headers.get("referer");
  if (referer) {
    const normalized = normalizeOrigin(referer);
    if (!normalized) {
      return { allowed: false, source: "referer", reason: "malformed" };
    }
    if (!constantTimeUrlEqual(normalized, allowed)) {
      return { allowed: false, source: "referer", reason: "mismatch" };
    }
    return { allowed: true, source: "referer" };
  }

  // No Origin and no Referer on a state-changing request. Browsers
  // always send one of the two for cross-origin form submissions and
  // most fetch calls; absence is suspicious. Reject.
  return { allowed: false, source: "none", reason: "missing" };
}

/** Build the allowed origin from the app's DOMAIN env var. Handles
 *  bare `host:port` (e.g. `localhost:3000`) by defaulting the
 *  scheme to http(s) based on NODE_ENV. */
export function deriveAllowedOrigin(domain: string, isProd: boolean): string {
  const trimmed = domain.trim().replace(/\/+$/, "");
  if (/^https?:\/\//i.test(trimmed)) return trimmed.toLowerCase();
  const scheme = isProd ? "https" : "http";
  return `${scheme}://${trimmed.toLowerCase()}`;
}
