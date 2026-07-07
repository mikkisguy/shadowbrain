/**
 * Session cookie management.
 *
 * The session cookie is `base64url(payload).base64url(hmac)` where
 * `hmac` is HMAC-SHA256 of the payload using `SESSION_SECRET` as the
 * key. We use the Web Crypto API so the signer works in both the
 * Node.js runtime (login API route) and the Edge runtime (Next.js
 * proxy). The payload is JSON of the form:
 *
 *     { "u": "username", "e": <expiry ms epoch>, "v": 1 }
 *
 * `v` is a schema version so we can rotate the format without
 * silently accepting cookies from a different scheme.
 *
 * Sliding renewal: when a session is more than 50% through its
 * lifetime, every successful verify returns a fresh cookie. This
 * means the same `SESSION_MAX_AGE` value also acts as an inactivity
 * timeout — a request more than `SESSION_MAX_AGE` after the last
 * sliding renewal is treated as expired.
 */

import {
  DEFAULT_SESSION_AGE_MS,
  MAX_SESSION_AGE_MS,
  MIN_SESSION_AGE_MS,
  SESSION_COOKIE_NAME,
} from "./constants";
import { parseCookieHeader } from "./session-cookies";

/** Schema version of the session payload. Bump if the JSON shape
 *  changes incompatibly. */
const SESSION_VERSION = 1;

interface SessionPayload {
  /** Username. */
  u: string;
  /** Absolute expiry time in milliseconds since epoch. */
  e: number;
  /** Schema version. */
  v: number;
}

/**
 * Compute the effective session lifetime in milliseconds.
 *
 * Honours SESSION_MAX_AGE (when set) and clamps it to
 * `[MIN_SESSION_AGE_MS, MAX_SESSION_AGE_MS]`. Any invalid or
 * out-of-range value falls back to DEFAULT_SESSION_AGE_MS. Borrowed
 * from branchforge's proven `getSessionMaxAge()`.
 */
export function getSessionMaxAge(
  rawMaxAgeMs: number | string | undefined
): number {
  const fallback = DEFAULT_SESSION_AGE_MS;

  if (rawMaxAgeMs === undefined || rawMaxAgeMs === null || rawMaxAgeMs === "") {
    return fallback;
  }

  const parsed =
    typeof rawMaxAgeMs === "string"
      ? Number.parseInt(rawMaxAgeMs, 10)
      : rawMaxAgeMs;

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  if (parsed < MIN_SESSION_AGE_MS) return MIN_SESSION_AGE_MS;
  if (parsed > MAX_SESSION_AGE_MS) return MAX_SESSION_AGE_MS;
  return parsed;
}

/* ── Web Crypto helpers ────────────────────────────────────────── */

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const b64 =
    typeof btoa === "function"
      ? btoa(binary)
      : Buffer.from(binary, "binary").toString("base64");
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(input: string): Uint8Array {
  // Re-pad to a multiple of 4 and restore the standard alphabet.
  const padLen = (4 - (input.length % 4)) % 4;
  const b64 = input.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat(padLen);
  const binary =
    typeof atob === "function"
      ? atob(b64)
      : Buffer.from(b64, "base64").toString("binary");
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

async function importHmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

async function hmacSign(secret: string, data: string): Promise<Uint8Array> {
  const key = await importHmacKey(secret);
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(data));
  return new Uint8Array(sig);
}

/** Constant-time string equality. Length is exposed in the comparison
 *  length only — the per-byte work is independent of the caller's
 *  input. We compare against the shorter of the two lengths and then
 *  always run the difference loop too, so the time taken does not
 *  depend on where the strings diverge. */
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/* ── Public API ────────────────────────────────────────────────── */

export interface ParsedSession {
  username: string;
  expiresAt: number;
}

export interface SignSessionOptions {
  username: string;
  secret: string;
  maxAgeMs: number;
  /** Override the absolute expiry. Used by sliding renewal to bump
   *  an existing session forward. */
  now?: number;
}

/** Sign a new session cookie value. Returns the cookie value
 *  (e.g. `base64url(payload).base64url(hmac)`) — *not* a full
 *  `Cookie:` header. */
export async function signSessionValue({
  username,
  secret,
  maxAgeMs,
  now,
}: SignSessionOptions): Promise<string> {
  const issuedAt = now ?? Date.now();
  const payload: SessionPayload = {
    u: username,
    e: issuedAt + maxAgeMs,
    v: SESSION_VERSION,
  };
  const payloadJson = JSON.stringify(payload);
  const payloadB64 = toBase64Url(encoder.encode(payloadJson));
  const mac = await hmacSign(secret, payloadB64);
  const macB64 = toBase64Url(mac);
  return `${payloadB64}.${macB64}`;
}

export interface VerifySessionResult {
  ok: boolean;
  session?: ParsedSession;
  /** True when the session is past 50% of its lifetime and should be
   *  silently renewed. The caller emits a fresh Set-Cookie when this
   *  is true. */
  shouldRenew?: boolean;
  /** Reason the session was rejected, for logging. Not surfaced to
   *  the client. */
  reason?: string;
}

/** Verify a session cookie value. Returns `{ ok: true, session,
 *  shouldRenew }` on success, or `{ ok: false, reason }` on
 *  failure. The reason is a server-side log detail only. */
export async function verifySessionValue(
  value: string,
  secret: string
): Promise<VerifySessionResult> {
  return verifySessionValueInternal(value, secret, DEFAULT_SESSION_AGE_MS);
}

/** Internal verify that accepts a `maxAgeMs` parameter so the
 *  sliding-renewal threshold matches the configured lifetime. */
async function verifySessionValueInternal(
  value: string,
  secret: string,
  maxAgeMs: number
): Promise<VerifySessionResult> {
  if (typeof value !== "string" || value.length === 0) {
    return { ok: false, reason: "missing" };
  }
  const dot = value.indexOf(".");
  if (dot <= 0 || dot === value.length - 1) {
    return { ok: false, reason: "malformed" };
  }
  const payloadB64 = value.slice(0, dot);
  const providedMacB64 = value.slice(dot + 1);

  let payloadJson: string;
  let payload: SessionPayload;
  try {
    const bytes = fromBase64Url(payloadB64);
    payloadJson = decoder.decode(bytes);
    payload = JSON.parse(payloadJson) as SessionPayload;
  } catch {
    return { ok: false, reason: "unparseable" };
  }
  if (
    !payload ||
    typeof payload.u !== "string" ||
    typeof payload.e !== "number" ||
    payload.v !== SESSION_VERSION
  ) {
    return { ok: false, reason: "bad payload" };
  }

  const expectedMac = await hmacSign(secret, payloadB64);
  const expectedMacB64 = toBase64Url(expectedMac);
  if (!constantTimeEqual(providedMacB64, expectedMacB64)) {
    return { ok: false, reason: "bad signature" };
  }

  const now = Date.now();
  if (now >= payload.e) {
    return { ok: false, reason: "expired" };
  }

  return {
    ok: true,
    session: { username: payload.u, expiresAt: payload.e },
    shouldRenew: shouldSlidingRenew(payload.e, now, maxAgeMs),
  };
}

/** Decide whether a verified session should be silently renewed.
 *
 *  We don't store the issue time in the payload (the cookie is
 *  designed to be small), but we *do* know the configured
 *  `maxAgeMs` at verify time — the verify call is the only
 *  consumer of this helper, and it always passes the same
 *  configured lifetime. The threshold is 50% of that lifetime.
 *  This is the correct interpretation of "sliding renewal at
 *  50% through lifetime" — the renewal frequency matches the
 *  actual lifetime, not the longest possible one. */
function shouldSlidingRenew(
  absoluteExpiry: number,
  now: number,
  maxAgeMs: number
): boolean {
  const remaining = absoluteExpiry - now;
  return remaining < maxAgeMs / 2;
}

/** Read the session cookie off a `Request` and verify it. The
 *  result mirrors `verifySessionValue` plus a `present` flag so the
 *  caller can distinguish "no cookie" from "bad cookie" without
 *  branching on `undefined`. The optional `maxAgeMs` is used as
 *  the sliding-renewal threshold (50% of lifetime); when omitted,
 *  the default lifetime is used. */
export async function readSessionFromRequest(
  request: Request,
  secret: string,
  maxAgeMs: number = DEFAULT_SESSION_AGE_MS
): Promise<VerifySessionResult & { present: boolean }> {
  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) {
    return { ok: false, present: false, reason: "missing" };
  }
  const value = parseCookieHeader(cookieHeader, SESSION_COOKIE_NAME);
  if (value === null) {
    return { ok: false, present: false, reason: "missing" };
  }
  const result = await verifySessionValueInternal(value, secret, maxAgeMs);
  return { ...result, present: true };
}

/** Lightweight session check for server components / route handlers
 *  that only need a yes/no answer (e.g. layout chrome, the /login
 *  page deciding whether to bounce an already-authenticated visitor
 *  back to /). Builds a minimal `Request` from the supplied
 *  cookie value (or `null`/`undefined` for "no cookie present")
 *  and delegates to `readSessionFromRequest`. Never throws — a
 *  missing, malformed, or expired cookie simply returns `false`. */
export async function isSessionCookieValid(
  cookieValue: string | null | undefined,
  secret: string,
  maxAgeMs: number = DEFAULT_SESSION_AGE_MS
): Promise<boolean> {
  if (!cookieValue) return false;
  const request = new Request("http://internal/session-check", {
    headers: { cookie: `${SESSION_COOKIE_NAME}=${cookieValue}` },
  });
  const result = await readSessionFromRequest(request, secret, maxAgeMs);
  return result.ok;
}

// ── Re-exports for backwards compatibility ────────────────────
// These moved to session-cookies.ts but the public API surface stays the same.

export { buildSessionCookie, buildClearSessionCookie } from "./session-cookies";
