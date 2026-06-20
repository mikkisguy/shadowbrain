/**
 * Exempt-path matching.
 *
 * The exempt list is matched by **exact normalized pathname
 * equality** — never by suffix or prefix. A blind suffix match
 * would let any future route ending in `/login` (e.g. a future
 * `/api/admin/login`) silently inherit the CSRF exemption, so the
 * exempt list is minimal, compared as exact pathnames (query
 * string stripped, trailing slashes normalized), and reviewed on
 * every change.
 *
 * Static assets are handled separately (see `isStaticAsset`) so a
 * future typo cannot accidentally widen the CSRF exemption.
 */

import { EXEMPT_FROM_AUTH, LOGIN_PATH, STATIC_PREFIXES } from "./constants";

/** Strip query string and trailing slashes; return the resulting
 *  pathname. */
export function normalizePathname(rawPath: string): string {
  // Drop the query string. `URL` would also work, but we keep the
  // helper self-contained to avoid pulling `URL` into edge
  // environments that might not have it.
  const noQuery = rawPath.split("?")[0] ?? rawPath;
  // Collapse repeated slashes, then strip the trailing slash (but
  // keep the root `/`).
  const collapsed = noQuery.replace(/\/{2,}/g, "/");
  if (collapsed === "/") return "/";
  return collapsed.replace(/\/+$/, "");
}

/** Return `true` if the pathname is exempt from the auth check. */
export function isExemptFromAuth(pathname: string): boolean {
  const normalized = normalizePathname(pathname);
  return EXEMPT_FROM_AUTH.has(normalized);
}

/** Return `true` if the pathname is the login page specifically.
 *  Used by the CSRF guard to bypass the Origin check for the
 *  login form submission (the login API route has its own CSRF
 *  posture: rate-limited + bcrypt). */
export function isLoginPath(pathname: string): boolean {
  return normalizePathname(pathname) === LOGIN_PATH;
}

/** Return `true` if the pathname is a static asset that the
 *  proxy should pass through. */
export function isStaticAsset(pathname: string): boolean {
  const normalized = normalizePathname(pathname);
  for (const prefix of STATIC_PREFIXES) {
    if (normalized.startsWith(prefix)) return true;
  }
  return false;
}

/** Does the request want HTML (browser navigation)? Used to decide
 *  between a 401 (API) and a redirect to /login (browser). */
export function isBrowserNavigation(request: Request): boolean {
  const accept = request.headers.get("accept") ?? "";
  // Most browsers send `text/html,...` even for sub-resource
  // fetches in some cases. A more reliable signal is the
  // Sec-Fetch-Dest header when present.
  if (accept.includes("text/html")) return true;
  const dest = request.headers.get("sec-fetch-dest");
  if (dest === "document") return true;
  return false;
}
