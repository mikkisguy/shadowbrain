/**
 * SSRF error reason constants.
 *
 * These are the messages returned to clients. Server-side logs record the
 * exact IPs/hostnames for debugging.
 */

/** Generic "blocked IP" message (client-facing). The server-side log
 *  records the actual IP. */
export const BLOCKED_IP = "blocked IP" as const;

/** Generic "DNS resolution failed" message. The server-side log records
 *  the hostname and the error. */
export const DNS_RESOLUTION_FAILED = "DNS resolution failed" as const;

/** Generic "DNS timeout" message. */
export const DNS_TIMEOUT = "DNS timeout" as const;

/** Generic "disallowed scheme" message. The scheme itself is not echoed
 *  to the client — it is user-supplied and the security baseline asks for
 *  generic failure messages. The server-side log records the scheme. */
export const DISALLOWED_SCHEME = "disallowed scheme" as const;

/** Generic "invalid URL" message. Returned when `new URL(url)` throws
 *  (e.g. unparseable string, invalid port). The original error is
 *  recorded server-side. */
export const INVALID_URL = "invalid URL" as const;
