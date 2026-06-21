/**
 * SSRF (Server-Side Request Forgery) protection for URL-fetch endpoints.
 *
 * This module validates URLs before fetching them, preventing attacks where
 * an attacker tricks the server into making requests to internal resources.
 *
 * ## Threat model
 *
 * A malicious user submits a URL that appears public but resolves to a
 * private address at fetch time (DNS rebinding), or embeds a private IP
 * literal directly (e.g. `https://169.254.169.254/latest/meta-data`). Without
 * protection, this could leak cloud metadata, internal services, or local
 * network resources.
 *
 * ## What this blocks
 *
 * - **Private IP ranges** (RFC1918): `10.0.0.0/8`, `172.16.0.0/12`,
 *   `192.168.0.0/16`
 * - **Loopback**: `127.0.0.0/8`, `::1`
 * - **Link-local**: `169.254.0.0/16` (includes cloud metadata endpoint
 *   `169.254.169.254`), `fe80::/10`
 * - **Carrier-grade NAT**: `100.64.0.0/10`
 * - **Unspecified**: `0.0.0.0/8`, `::`
 * - **Unique-local addresses (ULA)**: `fc00::/7` (`fc00::` / `fd00::`)
 * - **Multicast / reserved**: `>=224.0.0.0`, `ff00::/8`
 * - **Non-http(s) schemes**: `file:`, `javascript:`, `data:`, etc.
 *
 * ## DNS rebinding defense
 *
 * The `validateFetchUrl` function returns a `safeLookup` callback that
 * re-resolves the hostname at TCP connect time and re-validates the IP.
 * This closes the window between the initial validation and the actual
 * connection, where a malicious resolver could flip from a public IP to a
 * private IP.
 *
 * ## Usage
 *
 * ```ts
 * import { validateFetchUrl } from "@/lib/ssrf";
 *
 * const result = await validateFetchUrl(userInput);
 * if (!result.ok) {
 *   // result.reason is a generic message (no IPs, no internal paths)
 *   return { error: result.reason };
 * }
 *
 * // Pass safeLookup to http.request / https.request
 * const req = https.request(result.url, { lookup: result.safeLookup });
 * ```
 *
 * See the App Security Baseline design spec
 * (docs/superpowers/specs/2026-06-19-app-security-baseline-design.md §7)
 * for the full policy.
 */

import { isIPv4, isIPv6, LookupFunction } from "node:net";
import { lookup } from "node:dns/promises";
import { log } from "./logger";

// ---------- Generic error reasons ----------
// These are the messages returned to clients. Server-side logs record the
// exact IPs/hostnames for debugging.

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

// ---------- Types ----------

/** A DNS lookup result. */
export interface HostRecord {
  ip: string;
  family: number; // 4 or 6
}

/** Options for `validateFetchUrl`. */
export interface ValidateOptions {
  /** Override DNS resolution (used in tests). Defaults to node:dns/promises lookup. */
  resolve?: (hostname: string) => Promise<HostRecord[]>;
  /** DNS resolution timeout in ms. Default 3_000. */
  dnsTimeoutMs?: number;
}

/** Result of `validateFetchUrl`. Narrow on `ok` to discriminate. */
export type ValidationResult =
  | {
      ok: true;
      url: URL;
      /** A LookupFunction that re-validates the IP at connect time to
       *  prevent DNS rebinding. Pass to http.request / https.request. */
      safeLookup: LookupFunction;
    }
  | { ok: false; reason: string };

// ---------- IP range checking ----------

/**
 * Normalize an IP string before range-checking. Handles three cases
 * that the raw input may arrive in:
 *  1. URL hostnames: `https://[::1]/` → `[::1]` (brackets included).
 *  2. IPv4-mapped IPv6 in dotted form: `::ffff:8.8.8.8` (returned by
 *     `dns.lookup` on most Linux/macOS systems when an IPv4 connection
 *     is established from a dual-stack socket).
 *  3. IPv4-mapped IPv6 in hex form: `::ffff:808:808` (produced by the
 *     WHATWG URL parser when given `https://[::ffff:8.8.8.8]/`).
 *
 * The normalizer extracts the embedded IPv4 where possible, falling
 * back to the literal IPv6 form. The IPv4 is then range-checked by
 * `isPrivateIpv4`; the IPv6 by `isPrivateIpv6`.
 */
function normalizeIp(ip: string): string {
  let lower = ip.toLowerCase();
  // Strip brackets that the URL parser leaves on IPv6 hosts.
  if (lower.startsWith("[") && lower.endsWith("]")) {
    lower = lower.slice(1, -1);
  }
  // IPv4-mapped IPv6, dotted form: ::ffff:a.b.c.d
  const dotted = lower.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (dotted) return dotted[1]!;
  // IPv4-mapped IPv6, hex form (URL-parser output): ::ffff:HHHH:HHHH
  const hex = lower.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (hex) {
    const hi = parseInt(hex[1]!, 16);
    const lo = parseInt(hex[2]!, 16);
    if (
      !Number.isNaN(hi) &&
      !Number.isNaN(lo) &&
      hi <= 0xffff &&
      lo <= 0xffff
    ) {
      return `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;
    }
  }
  return lower;
}

/**
 * Return true when the IP is in a private / loopback / link-local range
 * that should never be reached from a public-internet fetcher.
 * Covers IPv4 and IPv6. Anything that doesn't parse as a valid IP is
 * treated as unsafe (the conservative default).
 */
export function isPrivateOrLoopbackIp(ip: string): boolean {
  const normalized = normalizeIp(ip);
  if (isIPv4(normalized)) return isPrivateIpv4(normalized);
  if (isIPv6(normalized)) return isPrivateIpv6(normalized);
  return true; // unknown format
}

function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return true;
  const [a, b] = parts as [number, number, number, number];
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 127) return true; // 127.0.0.0/8 (loopback)
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 (link-local, includes cloud metadata 169.254.169.254)
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 (CGNAT)
  if (a === 0) return true; // 0.0.0.0/8
  if (a >= 224) return true; // 224.0.0.0/4 (multicast) + 240/4 (reserved) + 255.255.255.255
  return false;
}

/**
 * IPv6 private/loopback/link-local range check.
 *
 * Covers (CIDR → first-group integer range, in standard notation):
 *  - `::1/128`        loopback                  (`::1`)
 *  - `::/128`         unspecified               (`::`)
 *  - `fc00::/7`       unique-local (ULA)        first group in `[0xfc00, 0xfdff]`
 *  - `fe80::/10`      link-local                first group in `[0xfe80, 0xfebf]`
 *  - `ff00::/8`       multicast                 first group in `[0xff00, 0xffff]`
 *
 * The CIDRs are checked against the **first** colon-separated group as
 * an integer so the `fe80::/10` range (which spans `fe80:`–`febf:`) is
 * caught — a string-prefix check on `"fe80:"` would miss `fe81::1`,
 * `fe9f::1`, `febf::1`, etc. and would let a link-local SSRF bypass
 * through. See issue #60 review for the bug that was caught.
 */
function isPrivateIpv6(ip: string): boolean {
  if (ip === "::1") return true; // ::1/128 (loopback)
  if (ip === "::") return true; // ::/128 (unspecified)
  // Expanded `::1` form: 8 groups, all zeros except the last which is 1.
  // Node's `isIPv6` only accepts the canonical short form, so this
  // branch catches the full form (including zero-padded variants like
  // `00:00:00:00:00:00:00:01`) when `isPrivateOrLoopbackIp` is called
  // directly (e.g. with a `dns.lookup` result in expanded form).
  // Comparing as integers (parseInt → 0 / 1) catches the zero-padded
  // forms that a string `g === "0"` check would miss.
  const groups = ip.split(":");
  if (groups.length === 8) {
    const last = groups[7];
    if (
      groups.slice(0, 7).every((g) => parseInt(g, 16) === 0) &&
      last !== undefined &&
      parseInt(last, 16) === 1
    ) {
      return true;
    }
  }
  const firstGroup = ip.split(":", 1)[0];
  if (!firstGroup) return true; // empty / malformed — treat as unsafe
  const num = parseInt(firstGroup, 16);
  if (Number.isNaN(num)) return true; // non-hex first group — unsafe
  if (num >= 0xfc00 && num <= 0xfdff) return true; // fc00::/7 (ULA)
  if (num >= 0xfe80 && num <= 0xfebf) return true; // fe80::/10 (link-local)
  if (num >= 0xff00 && num <= 0xffff) return true; // ff00::/8 (multicast)
  return false;
}

// ---------- DNS resolution with timeout ----------

/** Default DNS resolver using node:dns/promises. */
async function defaultResolve(hostname: string): Promise<HostRecord[]> {
  // `lookup` with `all: true` returns every address, not just the
  // first — we must check every one. A hostname with both a public and
  // a private record is still unsafe. Map to our `HostRecord` shape
  // (the dns module uses `address`; the rest of the code uses `ip`).
  const records = await lookup(hostname, { all: true });
  return records.map((r: { address: string; family: number }) => ({
    ip: r.address,
    family: r.family,
  }));
}

/**
 * Wrap a resolve call with a timeout. `node:dns` does not accept an
 * AbortSignal, so we race against a `setTimeout`. The resolve is not
 * actually cancelled (libuv has no portable cancel hook), but the
 * caller bails out — keeping the response time bounded.
 */
function resolveWithTimeout(
  hostname: string,
  resolve: (hostname: string) => Promise<HostRecord[]>,
  timeoutMs: number
): Promise<HostRecord[]> {
  return new Promise((resolveP, rejectP) => {
    let done = false;
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      rejectP(new Error(DNS_TIMEOUT));
    }, timeoutMs);
    resolve(hostname).then(
      (recs) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolveP(recs);
      },
      (err: unknown) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        rejectP(err);
      }
    );
  });
}

// ---------- Main validator ----------

/**
 * Validate a URL for safe fetching. This is the SSRF protection entry
 * point for all URL-fetch endpoints (bookmark auto-fetch, image capture,
 * etc.).
 *
 * The function:
 *  1. Checks the scheme (only `http:` and `https:` are allowed).
 *  2. If the hostname is an IP literal, validates it directly.
 *  3. Otherwise, resolves the hostname and validates every resolved IP.
 *  4. Returns a `safeLookup` callback that re-validates at connect time
 *     (preventing DNS rebinding).
 *
 * @param url - The URL to validate (string or URL object).
 * @param options - Optional configuration (DNS resolver, timeout).
 * @returns A discriminated union: `{ ok: true, url, safeLookup }` on
 *          success, or `{ ok: false, reason }` on failure. The `reason`
 *          is a generic message; server-side logs record the details.
 */
export async function validateFetchUrl(
  url: string | URL,
  options?: ValidateOptions
): Promise<ValidationResult> {
  const resolve = options?.resolve ?? defaultResolve;
  const dnsTimeoutMs = options?.dnsTimeoutMs ?? 3_000;

  // Parse the URL and validate the scheme. `new URL` throws on
  // unparseable input (e.g. `"http://[::1"`, invalid port) — catch
  // and return a generic error rather than letting an unhandled
  // exception escape a future caller of this helper.
  let parsed: URL;
  try {
    parsed = typeof url === "string" ? new URL(url) : new URL(url.toString());
  } catch (err) {
    log("warn", "URL parse failed", {
      event: "ssrf.parse.failed",
      error: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, reason: INVALID_URL };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    log("warn", "disallowed URL scheme", {
      event: "ssrf.block",
      scheme: parsed.protocol,
    });
    return { ok: false, reason: DISALLOWED_SCHEME };
  }

  // The URL parser leaves brackets on IPv6 hosts. Strip them so the
  // `isIPv4`/`isIPv6` checks below see the bare address.
  const bareHostname =
    parsed.hostname.startsWith("[") && parsed.hostname.endsWith("]")
      ? parsed.hostname.slice(1, -1)
      : parsed.hostname;

  // If the hostname is an IP literal, validate it directly (no DNS,
  // no rebinding possible).
  if (isIPv4(bareHostname) || isIPv6(bareHostname)) {
    if (isPrivateOrLoopbackIp(bareHostname)) {
      log("warn", "blocked private IP literal", {
        event: "ssrf.block",
        ip: bareHostname,
      });
      return { ok: false, reason: BLOCKED_IP };
    }
    const family = isIPv6(bareHostname) ? 6 : 4;
    // Return a lookup callback that yields the same IP without re-resolving.
    const safeLookup: LookupFunction = (_h, _opts, cb) => {
      cb(null, bareHostname, family);
    };
    return { ok: true, url: parsed, safeLookup };
  }

  // Pre-resolve the hostname so a clearly-bad hostname fails fast.
  const resolveBounded: (h: string) => Promise<HostRecord[]> = (h) =>
    resolveWithTimeout(h, resolve, dnsTimeoutMs);

  let records: HostRecord[];
  try {
    records = await resolveBounded(parsed.hostname);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === DNS_TIMEOUT) {
      log("warn", "DNS resolution timeout", {
        event: "ssrf.dns.timeout",
        hostname: parsed.hostname,
      });
      return { ok: false, reason: DNS_TIMEOUT };
    }
    log("warn", "DNS resolution failed", {
      event: "ssrf.dns.failed",
      hostname: parsed.hostname,
      error: message,
    });
    return { ok: false, reason: DNS_RESOLUTION_FAILED };
  }

  if (records.length === 0) {
    log("warn", "DNS resolution returned no records", {
      event: "ssrf.dns.empty",
      hostname: parsed.hostname,
    });
    return { ok: false, reason: DNS_RESOLUTION_FAILED };
  }

  // Validate every resolved IP. A hostname with both a public and a
  // private record is still unsafe.
  for (const r of records) {
    if (isPrivateOrLoopbackIp(r.ip)) {
      log("warn", "blocked private DNS record", {
        event: "ssrf.block",
        hostname: parsed.hostname,
        ip: r.ip,
      });
      return { ok: false, reason: BLOCKED_IP };
    }
  }

  // Build a lookup callback that re-resolves and re-validates at connect
  // time, closing the DNS rebinding window.
  const safeLookup: LookupFunction = (lookupHostname, _opts, cb) => {
    resolveBounded(lookupHostname)
      .then((recs) => {
        if (recs.length === 0) {
          log("warn", "connect-time DNS returned no records", {
            event: "ssrf.dns.empty",
            hostname: lookupHostname,
          });
          cb(new Error(DNS_RESOLUTION_FAILED), "", 0);
          return;
        }
        for (const r of recs) {
          if (isPrivateOrLoopbackIp(r.ip)) {
            log("warn", "blocked DNS rebinding to private IP", {
              event: "ssrf.rebind.block",
              hostname: lookupHostname,
              ip: r.ip,
            });
            cb(new Error(BLOCKED_IP), "", 0);
            return;
          }
        }
        // Prefer IPv4 results regardless of the caller's family
        // preference — IPv4 is universally reachable and avoids the
        // rare case where the remote has a misconfigured AAAA.
        const v4 = recs.find((r) => r.family === 4);
        const chosen = v4 ?? recs[0]!;
        cb(null, chosen.ip, chosen.family);
      })
      .catch((err: unknown) => {
        cb(err instanceof Error ? err : new Error(String(err)), "", 0);
      });
  };

  return { ok: true, url: parsed, safeLookup };
}
