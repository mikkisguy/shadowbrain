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

// ---------- Imports ----------
import { isIPv4, isIPv6 } from "node:net";
import type { LookupFunction } from "node:net";

import { log } from "./logger";

import {
  BLOCKED_IP,
  DNS_RESOLUTION_FAILED,
  DNS_TIMEOUT,
  DISALLOWED_SCHEME,
  INVALID_URL,
} from "./ssrf/constants";
import { isPrivateOrLoopbackIp } from "./ssrf/ip-ranges";
import {
  defaultResolve,
  resolveWithTimeout,
  createSafeLookup,
} from "./ssrf/dns";
import type { HostRecord } from "./ssrf/dns";

// ---------- Re-exports (public API surface) ----------
export {
  BLOCKED_IP,
  DNS_RESOLUTION_FAILED,
  DNS_TIMEOUT,
  DISALLOWED_SCHEME,
  INVALID_URL,
} from "./ssrf/constants";
export { isPrivateOrLoopbackIp } from "./ssrf/ip-ranges";
export type { HostRecord } from "./ssrf/dns";

// ---------- Types ----------

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
  const safeLookup = createSafeLookup(resolveBounded);

  return { ok: true, url: parsed, safeLookup };
}
