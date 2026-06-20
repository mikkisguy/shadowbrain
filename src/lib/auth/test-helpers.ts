/**
 * Test-only helper for authenticated requests.
 *
 * Tests that need an authenticated Request can import
 * `createAuthedRequest` instead of running the full login flow.
 * This avoids paying the bcrypt cost on every test that touches a
 * protected route, and avoids the rate-limit flakiness that would
 * arise from 20+ tests each hitting /api/auth/login.
 *
 * The helper signs a session cookie using the same secret the
 * app uses (`SESSION_SECRET` from process.env) and returns a
 * Request that already carries the cookie.
 */

import { signSessionValue } from "./session";
import { DEFAULT_SESSION_AGE_MS, SESSION_COOKIE_NAME } from "./constants";

export interface CreateAuthedRequestOptions {
  url: string;
  init?: RequestInit;
  username?: string;
  secret?: string;
  /** Lifetime in ms. Defaults to DEFAULT_SESSION_AGE_MS. */
  maxAgeMs?: number;
}

/** Build a `Request` that looks like a browser sending a valid
 *  session cookie. The cookie is signed with the same secret the
 *  app uses at runtime so the middleware's verifySession step
 *  passes. */
export async function createAuthedRequest({
  url,
  init = {},
  username = "admin",
  secret = process.env.SESSION_SECRET ?? "",
  maxAgeMs = DEFAULT_SESSION_AGE_MS,
}: CreateAuthedRequestOptions): Promise<Request> {
  if (!secret) {
    throw new Error(
      "createAuthedRequest: SESSION_SECRET is not set in process.env"
    );
  }
  const value = await signSessionValue({
    username,
    secret,
    maxAgeMs,
  });
  const headers = new Headers(init.headers);
  headers.set("Cookie", `${SESSION_COOKIE_NAME}=${value}`);
  return new Request(url, { ...init, headers });
}
