import { SESSION_COOKIE_NAME } from "./constants";

/** Build a `Set-Cookie` header value for the session. The cookie is
 *  HttpOnly, SameSite=Lax, and Secure in production. The path is
 *  `/` so it covers every route. */
export function buildSessionCookie(
  value: string,
  maxAgeMs: number,
  isProd: boolean
): string {
  const parts = [
    `${SESSION_COOKIE_NAME}=${value}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${Math.floor(maxAgeMs / 1000)}`,
  ];
  if (isProd) parts.push("Secure");
  return parts.join("; ");
}

/** Build a `Set-Cookie` header that clears the session. */
export function buildClearSessionCookie(isProd: boolean): string {
  const parts = [
    `${SESSION_COOKIE_NAME}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0",
  ];
  if (isProd) parts.push("Secure");
  return parts.join("; ");
}

/** Extract a single named cookie from a `Cookie:` header. Returns
 *  `null` if the cookie is not present. */
export function parseCookieHeader(header: string, name: string): string | null {
  for (const part of header.split(";")) {
    const trimmed = part.trim();
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq);
    if (key !== name) continue;
    return trimmed.slice(eq + 1);
  }
  return null;
}
