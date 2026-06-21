/**
 * Client-IP extraction.
 *
 * In production the real client IP is in a header set by the trusted
 * reverse proxy. The default is `X-Forwarded-For` (a comma-separated
 * chain; the leftmost entry is the original client), with `X-Real-IP`
 * (a single value) as a fallback. The header name is configurable via
 * the `TRUSTED_PROXY_HEADER` env var (see `src/lib/env.ts`); in
 * production nginx MUST set the chosen header for the value to be
 * trustworthy.
 *
 * The header is attacker-controlled when the app is exposed without
 * a trusted proxy — that's why the App Security Baseline design spec
 * calls out a separate deployment-security issue for nginx hardening.
 * The helper here accepts the headers but the caller must not treat
 * the IP as authoritative for trust decisions; it is used only for
 * rate-limit bucketing and audit-log context.
 */

const FORWARDED_FOR = "x-forwarded-for";
const REAL_IP = "x-real-ip";

export interface GetClientIpOptions {
  /** Header to read. Case-insensitive. Defaults to the proxy header
   *  the deployment sets (see `TRUSTED_PROXY_HEADER`); `getClientIp`
   *  itself is the default-reading helper and uses `X-Forwarded-For`
   *  when called with no options. The explicit `header` option lets
   *  the proxy choose the configured header from the env. */
  header?: string;
}

/** Read the best-effort client IP from the request headers. Returns
 *  `"unknown"` when no header is present, so the caller can always
 *  bucket the request. */
export function getClientIp(
  request: Request,
  options: GetClientIpOptions = {}
): string {
  const configured = options.header?.toLowerCase();
  // The configured header is the primary signal. If the deployment
  // sets `X-Real-IP` instead, the configured header is `X-Real-IP` and
  // we never read `X-Forwarded-For`. If the deployment sets the
  // default `X-Forwarded-For`, we read that first and fall back to
  // `X-Real-IP` (which nginx often sets alongside XFF).
  if (configured === REAL_IP) {
    const v = request.headers.get(REAL_IP);
    if (v) return v.trim();
    return "unknown";
  }
  if (configured && configured !== FORWARDED_FOR) {
    // Custom header (e.g. CF-Connecting-IP). Read it as a single
    // value — the deployment contract is one IP per request.
    const v = request.headers.get(configured);
    if (v) return v.trim();
    return "unknown";
  }
  // Default: X-Forwarded-For, with X-Real-IP as a fallback.
  const xff = request.headers.get(FORWARDED_FOR);
  if (xff) {
    // Take the leftmost entry; trim whitespace and quotes.
    const first = xff.split(",")[0]?.trim().replace(/^"|"$/g, "");
    if (first) return first;
  }
  const xri = request.headers.get(REAL_IP);
  if (xri) return xri.trim();
  return "unknown";
}
