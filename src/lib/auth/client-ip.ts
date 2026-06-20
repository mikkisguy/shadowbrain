/**
 * Client-IP extraction.
 *
 * In production the real client IP is in `X-Forwarded-For` (set by
 * nginx). The header is a comma-separated chain; the leftmost entry
 * is the original client. `X-Real-IP` is the simpler single-value
 * alternative.
 *
 * Both headers are attacker-controlled when the app is exposed
 * without a trusted proxy — that's why the App Security Baseline
 * design spec calls out a separate deployment-security issue for
 * nginx hardening. The helper here accepts the headers but the
 * caller must not treat the IP as authoritative for trust
 * decisions; it's used only for rate-limit bucketing and audit-log
 * context.
 */

const FORWARDED_FOR = "x-forwarded-for";
const REAL_IP = "x-real-ip";

/** Read the best-effort client IP from the request headers. Returns
 *  `"unknown"` when neither header is present, so the caller can
 *  always bucket the request. */
export function getClientIp(request: Request): string {
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
