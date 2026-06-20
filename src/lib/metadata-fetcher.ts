// Bookmark metadata auto-fetcher.
//
// Detects a URL in bookmark content, fetches the page HTML through a
// SSRF-safe fetch wrapper, and extracts `og:title` / `og:description` /
// favicon metadata. Stores the result in `content_items.metadata`.
//
// Designed to be called from POST /api/items when `type === "bookmark"`.
// The full SSRF allowlist + DNS rebinding protection lives in this module
// for now. When issue #60 lands (shared `validateFetchUrl` helper used by
// both #17 and #44), this module should switch to calling that helper
// instead — the contract is the same: reject private / loopback /
// link-local / metadata IP targets at every hop.

import { lookup } from "node:dns/promises";
import { isIPv4, isIPv6, LookupFunction } from "node:net";
import {
  request as httpRequest,
  RequestOptions as HttpRequestOptions,
} from "node:http";
import {
  request as httpsRequest,
  RequestOptions as HttpsRequestOptions,
} from "node:https";
import { Readable } from "node:stream";
import { log } from "./logger";

/** Default request timeout in milliseconds. Bounds the whole request. */
const DEFAULT_TIMEOUT_MS = 5_000;

/** Default DNS resolution timeout in milliseconds. */
const DEFAULT_DNS_TIMEOUT_MS = 3_000;

/** Default response body cap in bytes. Reading more aborts the request. */
const DEFAULT_MAX_BYTES = 1_048_576; // 1 MiB

/** User-Agent sent to upstream. Identifies the fetcher for site operators. */
const USER_AGENT = "ShadowBrain/1.0 (+bookmark-metadata)";

/**
 * Max redirect hops to follow. Each hop is re-validated against the SSRF
 * allowlist. The outer loop in `safeFetchHtml` runs `MAX_REDIRECT_HOPS + 1`
 * times (the original request plus the redirects).
 */
const MAX_REDIRECT_HOPS = 3;

export interface FetchOptions {
  /** Override the underlying http(s) request (used in tests). */
  requestImpl?: typeof httpRequest;
  /**
   * Override the higher-level request — receives a URL and the SSRF-safe
   * lookup callback, returns a Promise of {statusCode, headers, body}.
   * Tests use this to inject fakes without touching node:http.
   */
  fetchImpl?: (
    url: URL,
    opts: { timeoutMs: number; lookup: LookupFunction }
  ) => Promise<UpstreamResponse>;
  /** Override DNS resolution (used in tests). */
  resolve?: (hostname: string) => Promise<HostRecord[]>;
  /** Request timeout in ms. */
  timeoutMs?: number;
  /** DNS resolution timeout in ms. */
  dnsTimeoutMs?: number;
  /** Response body cap in bytes. */
  maxBytes?: number;
}

export interface HostRecord {
  ip: string;
  family: number;
}

export interface BookmarkMetadata {
  /** The URL we resolved and fetched. */
  url: string;
  /** Page title (og:title, twitter:title, or <title>). */
  title: string | null;
  /** Page description (og:description, twitter:description, or <meta name="description">). */
  description: string | null;
  /** Resolved absolute favicon URL, or null if none. */
  favicon: string | null;
  /** og:site_name if present. */
  site_name: string | null;
  /** og:image absolute URL, or null. */
  image: string | null;
  /** ISO timestamp of when the fetch happened. */
  fetched_at: string;
}

interface FetchResult {
  ok: true;
  metadata: BookmarkMetadata;
}

interface FetchFailure {
  ok: false;
  reason: string;
  /** Partial metadata — `url` is always present so callers can still link back. */
  metadata: Pick<BookmarkMetadata, "url" | "fetched_at">;
}

/** Outcome of fetching bookmark metadata. Narrow on `ok` to discriminate. */
export type BookmarkFetchOutcome = FetchResult | FetchFailure;

// ---------- URL detection ----------

/**
 * Find the first http(s) URL in `content`. Returns null when none is
 * found. Surrounding punctuation (e.g. trailing `)` or `,`) is stripped
 * so common copy-paste artefacts don't poison the URL.
 */
export function extractFirstUrl(content: string): string | null {
  const match = content.match(/https?:\/\/[^\s<>"'`]+/i);
  if (!match) return null;
  return stripTrailingPunctuation(match[0]);
}

function stripTrailingPunctuation(url: string): string {
  // Drop a single trailing punctuation char that's almost never part of
  // a URL. We loop because a sentence can end in ".)" or similar.
  let end = url.length;
  while (end > 0) {
    const ch = url[end - 1];
    if (ch === ")" || ch === "]" || ch === "," || ch === ".") {
      // Keep balanced: a `(` without a matching `)` should not be
      // stripped (it means the URL itself contains a paren). Cheap
      // heuristic: only strip the trailing char if the matching
      // opener isn't also inside the URL.
      const open = ch === ")" ? "(" : ch === "]" ? "[" : null;
      if (open && url.slice(0, end - 1).includes(open)) {
        break;
      }
      end--;
      continue;
    }
    if (ch === ";" || ch === ":") {
      // Drop a trailing `;` or `:` that is the end of an HTML entity or
      // sentence, not a URL component. (URLs ending in `:` are not
      // meaningful; URLs ending in `;` only appear as a query separator
      // in the middle.)
      end--;
      continue;
    }
    break;
  }
  return url.slice(0, end);
}

// ---------- IP / SSRF checks ----------

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
 * that should never be reached from a public-internet bookmark fetcher.
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

function isPrivateIpv6(ip: string): boolean {
  if (ip === "::1") return true; // loopback
  if (ip === "::") return true; // unspecified
  if (ip.startsWith("fc") || ip.startsWith("fd")) return true; // fc00::/7 (ULA)
  if (ip.startsWith("fe80:")) return true; // fe80::/10 (link-local)
  if (ip.startsWith("ff")) return true; // ff00::/8 (multicast)
  return false;
}

// ---------- SSRF-safe fetch ----------

class FetchError extends Error {
  constructor(public readonly reason: string) {
    super(reason);
    this.name = "FetchError";
  }
}

/**
 * Fetch HTML from a public URL. The URL is validated against private /
 * loopback / link-local IP ranges at every hop (initial request + every
 * redirect) to prevent SSRF. DNS resolution happens once per host and
 * the resolved IP is re-validated at TCP connect time — this blocks
 * DNS rebinding where the resolver returns a public IP for validation
 * and a private IP at connection time. The hostname is preserved in
 * the SNI / Host header so HTTPS vhosted sites work normally.
 */
export async function safeFetchHtml(
  url: string | URL,
  options: FetchOptions = {}
): Promise<string> {
  const fetchImpl = options.fetchImpl ?? defaultFetchImpl;
  const resolve = options.resolve ?? defaultResolve;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const dnsTimeoutMs = options.dnsTimeoutMs ?? DEFAULT_DNS_TIMEOUT_MS;
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;

  const resolveBounded: (hostname: string) => Promise<HostRecord[]> = (h) =>
    resolveWithTimeout(h, resolve, dnsTimeoutMs);

  let currentUrl = normaliseUrl(url);

  for (let hop = 0; hop <= MAX_REDIRECT_HOPS; hop++) {
    // 1. Pre-validate the host (blocks IP literals and bad DNS).
    const safeLookup = await buildSafeLookup(
      currentUrl.hostname,
      resolveBounded,
      dnsTimeoutMs
    );

    // 2. Make the request. The custom `lookup` callback re-validates
    //    the IP at connect time, closing the DNS rebinding window.
    let res: UpstreamResponse;
    try {
      res = await fetchImpl(currentUrl, {
        timeoutMs,
        lookup: safeLookup,
      });
    } catch (err) {
      if (err instanceof FetchError) throw err;
      throw new FetchError(
        err instanceof Error ? `network error: ${err.message}` : "network error"
      );
    }

    // 3. Handle redirects manually so we can re-validate the target host.
    if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
      if (hop === MAX_REDIRECT_HOPS) {
        res.body.destroy();
        throw new FetchError("too many redirects");
      }
      const location = Array.isArray(res.headers.location)
        ? res.headers.location[0]
        : res.headers.location;
      if (!location) {
        res.body.destroy();
        throw new FetchError("invalid redirect target");
      }
      let next: URL;
      try {
        next = new URL(location, currentUrl);
      } catch {
        res.body.destroy();
        throw new FetchError("invalid redirect target");
      }
      if (next.protocol !== "http:" && next.protocol !== "https:") {
        res.body.destroy();
        throw new FetchError(`disallowed redirect scheme: ${next.protocol}`);
      }
      res.body.destroy();
      currentUrl = next;
      continue;
    }

    // 4. Validate response and read the body with a hard size cap.
    if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
      res.body.destroy();
      throw new FetchError(`upstream ${res.statusCode}`);
    }
    if (!isHtmlResponse(res.headers["content-type"])) {
      res.body.destroy();
      throw new FetchError("non-HTML response");
    }
    try {
      return await readCappedBody(res.body, maxBytes);
    } catch (err) {
      res.body.destroy();
      throw err;
    }
  }

  throw new FetchError("too many redirects");
}

interface UpstreamResponse {
  statusCode: number;
  headers: NodeJS.Dict<string | string[]>;
  body: Readable;
}

/** Public alias so test code can type its fake-fetch return shape. */
export type UpstreamResponseLike = UpstreamResponse;

interface PerformOptions {
  timeoutMs: number;
  lookup: LookupFunction;
  requestImpl?: typeof httpRequest;
}

const defaultFetchImpl = (
  url: URL,
  opts: { timeoutMs: number; lookup: LookupFunction }
): Promise<UpstreamResponse> => performRequest(url, { ...opts });

function performRequest(
  url: URL,
  opts: PerformOptions
): Promise<UpstreamResponse> {
  return new Promise((resolveReq, rejectReq) => {
    const headers: NodeJS.Dict<string | string> = {
      Host: url.host,
      "User-Agent": USER_AGENT,
      Accept: "text/html,application/xhtml+xml",
    };

    const requestOptions: HttpRequestOptions | HttpsRequestOptions = {
      method: "GET",
      protocol: url.protocol,
      hostname: url.hostname,
      port: url.port || (url.protocol === "https:" ? 443 : 80),
      path: `${url.pathname}${url.search}`,
      headers,
      lookup: opts.lookup,
    };

    const reqFn =
      opts.requestImpl ??
      (url.protocol === "https:" ? httpsRequest : httpRequest);

    let settled = false;
    const req = reqFn(requestOptions, (res) => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      resolveReq({
        statusCode: res.statusCode ?? 0,
        headers: res.headers,
        body: res,
      });
    });

    // Hard total deadline. `req.setTimeout` is the socket idle timeout
    // (slow-loris can defeat that), so we also install a single
    // one-shot timer that aborts the request after `timeoutMs` total.
    const deadline = setTimeout(() => {
      if (settled) return;
      settled = true;
      req.destroy(new FetchError("request timeout"));
    }, opts.timeoutMs);

    // Socket idle timeout — shorter than the total deadline so a
    // stuck connection is killed early. A server that sends one byte
    // per period is caught by the total deadline above.
    req.setTimeout(opts.timeoutMs, () => {
      if (settled) return;
      settled = true;
      req.destroy(new FetchError("socket idle"));
    });

    req.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      rejectReq(
        new FetchError(
          err.message ? `network error: ${err.message}` : "network error"
        )
      );
    });
    req.end();
  });
}

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
      rejectP(new FetchError("DNS timeout"));
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

/**
 * Build a `lookup` callback for the request. The callback:
 *  1. Re-resolves the hostname (closing the DNS rebinding window —
 *     the IP seen here may differ from the IP we saw during pre-
 *     validation).
 *  2. Verifies every resolved IP is public.
 *  3. Calls back with the first safe IP.
 *
 * If the URL is an IP literal, the IP is validated directly without
 * DNS resolution (no rebinding possible when there's no DNS).
 */
async function buildSafeLookup(
  hostname: string,
  resolve: (hostname: string) => Promise<HostRecord[]>,
  dnsTimeoutMs: number
): Promise<NonNullable<HttpRequestOptions["lookup"]>> {
  // The URL parser leaves brackets on IPv6 hosts. Strip them so the
  // `isIPv4`/`isIPv6` checks below see the bare address.
  const bareHostname =
    hostname.startsWith("[") && hostname.endsWith("]")
      ? hostname.slice(1, -1)
      : hostname;

  if (isIPv4(bareHostname) || isIPv6(bareHostname)) {
    if (isPrivateOrLoopbackIp(bareHostname)) {
      // The specific IP stays out of the message: client-facing errors
      // are generic per the security baseline (§Error Handling). The
      // server-side log below records the exact value for debugging.
      log("warn", "blocked private IP literal", {
        event: "ssrf.block",
        ip: bareHostname,
      });
      throw new FetchError("blocked IP");
    }
    const family = isIPv6(bareHostname) ? 6 : 4;
    return (_h, _opts, cb) => {
      cb(null, bareHostname, family);
    };
  }

  // Pre-resolve so a clearly-bad hostname fails fast (better error
  // message than waiting for the connect-time callback).
  const records = await resolveWithTimeout(hostname, resolve, dnsTimeoutMs);
  if (records.length === 0) {
    log("warn", "DNS resolution returned no records", {
      event: "ssrf.dns.empty",
      hostname,
    });
    throw new FetchError("DNS resolution failed");
  }
  for (const r of records) {
    if (isPrivateOrLoopbackIp(r.ip)) {
      log("warn", "blocked private DNS record", {
        event: "ssrf.block",
        hostname,
        ip: r.ip,
      });
      throw new FetchError("blocked IP");
    }
  }

  // Return a callback that re-validates at connect time, closing the
  // DNS rebinding window. We always prefer IPv4 results regardless of
  // the caller's family preference — IPv4 is universally reachable and
  // avoids the rare case where the remote has a misconfigured AAAA.
  return (lookupHostname, _opts, cb) => {
    resolveWithTimeout(lookupHostname, resolve, dnsTimeoutMs)
      .then((recs) => {
        if (recs.length === 0) {
          log("warn", "connect-time DNS returned no records", {
            event: "ssrf.dns.empty",
            hostname: lookupHostname,
          });
          cb(new Error("DNS resolution failed"), "", 0);
          return;
        }
        for (const r of recs) {
          if (isPrivateOrLoopbackIp(r.ip)) {
            log("warn", "blocked DNS rebinding to private IP", {
              event: "ssrf.rebind.block",
              hostname: lookupHostname,
              ip: r.ip,
            });
            cb(new Error("blocked IP"), "", 0);
            return;
          }
        }
        const v4 = recs.find((r) => r.family === 4);
        const chosen = v4 ?? recs[0]!;
        cb(null, chosen.ip, chosen.family);
      })
      .catch((err: unknown) => {
        cb(err instanceof Error ? err : new Error(String(err)), "", 0);
      });
  };
}

function normaliseUrl(url: string | URL): URL {
  const parsed =
    typeof url === "string" ? new URL(url) : new URL(url.toString());
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new FetchError(`disallowed scheme: ${parsed.protocol}`);
  }
  if (!parsed.hostname) {
    throw new FetchError("missing hostname");
  }
  return parsed;
}

function isHtmlResponse(contentType: string | string[] | undefined): boolean {
  const ct = Array.isArray(contentType) ? contentType[0] : contentType;
  if (!ct) return false;
  return ct.includes("text/html") || ct.includes("application/xhtml+xml");
}

async function readCappedBody(
  body: Readable,
  maxBytes: number
): Promise<string> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of body) {
    const buf = Buffer.isBuffer(chunk)
      ? chunk
      : Buffer.from(chunk as Uint8Array);
    total += buf.byteLength;
    if (total > maxBytes) {
      throw new FetchError("response body too large");
    }
    chunks.push(buf);
  }
  return Buffer.concat(chunks).toString("utf-8");
}

// ---------- HTML metadata extraction ----------

/**
 * Pull bookmark-relevant metadata out of an HTML document. `baseUrl` is
 * used to resolve relative favicon / image URLs.
 *
 * Returns null on every field when the page is empty. Always returns an
 * object (never throws) so a malformed page doesn't fail the whole
 * bookmark creation.
 */
export function extractBookmarkMetadata(
  html: string,
  baseUrl: string | URL
): Omit<BookmarkMetadata, "fetched_at"> {
  const base = typeof baseUrl === "string" ? new URL(baseUrl) : baseUrl;
  const ogImage = matchMeta(html, "og:image");
  return {
    url: base.toString(),
    title: pickFirst(
      matchMeta(html, "og:title"),
      matchMeta(html, "twitter:title"),
      matchTitle(html)
    ),
    description: pickFirst(
      matchMeta(html, "og:description"),
      matchMeta(html, "twitter:description"),
      matchMetaName(html, "description")
    ),
    favicon: resolveFavicon(html, base),
    site_name: matchMeta(html, "og:site_name"),
    image: ogImage ? safeAbsolute(ogImage, base) : null,
  };
}

function matchMeta(html: string, property: string): string | null {
  // Match `<meta property="og:title" content="..." />` in any quoting
  // style and across line breaks. Property and content can be in either
  // order; we look for both. Some publishers (notably Twitter) use
  // `name="twitter:*"` instead of `property="twitter:*"`, so we accept
  // either attribute for the key — content order is also free.
  const escaped = escapeRegex(property);
  const patterns: RegExp[] = [
    new RegExp(
      `<meta\\s+[^>]*property\\s*=\\s*["']${escaped}["'][^>]*content\\s*=\\s*["']([^"']*)["']`,
      "i"
    ),
    new RegExp(
      `<meta\\s+[^>]*content\\s*=\\s*["']([^"']*)["'][^>]*property\\s*=\\s*["']${escaped}["']`,
      "i"
    ),
    new RegExp(
      `<meta\\s+[^>]*name\\s*=\\s*["']${escaped}["'][^>]*content\\s*=\\s*["']([^"']*)["']`,
      "i"
    ),
    new RegExp(
      `<meta\\s+[^>]*content\\s*=\\s*["']([^"']*)["'][^>]*name\\s*=\\s*["']${escaped}["']`,
      "i"
    ),
  ];
  for (const p of patterns) {
    const m = html.match(p);
    if (m) return decodeEntities(m[1]!);
  }
  return null;
}

function matchMetaName(html: string, name: string): string | null {
  const escaped = escapeRegex(name);
  const patterns: RegExp[] = [
    new RegExp(
      `<meta\\s+[^>]*name\\s*=\\s*["']${escaped}["'][^>]*content\\s*=\\s*["']([^"']*)["']`,
      "i"
    ),
    new RegExp(
      `<meta\\s+[^>]*content\\s*=\\s*["']([^"']*)["'][^>]*name\\s*=\\s*["']${escaped}["']`,
      "i"
    ),
  ];
  for (const p of patterns) {
    const m = html.match(p);
    if (m) return decodeEntities(m[1]!);
  }
  return null;
}

function matchTitle(html: string): string | null {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!m) return null;
  return decodeEntities(m[1]!.trim());
}

function resolveFavicon(html: string, base: URL): string | null {
  const linkRel = (rel: string): string | null => {
    const escaped = escapeRegex(rel);
    const re = new RegExp(
      `<link\\s+[^>]*rel\\s*=\\s*["']${escaped}["'][^>]*href\\s*=\\s*["']([^"']*)["']`,
      "i"
    );
    const m = html.match(re);
    return m ? m[1]! : null;
  };

  const href =
    linkRel("apple-touch-icon") ??
    linkRel("icon") ??
    linkRel("shortcut icon") ??
    "/favicon.ico";
  return safeAbsolute(href, base);
}

function safeAbsolute(href: string, base: URL): string | null {
  try {
    return new URL(href, base).toString();
  } catch {
    return null;
  }
}

function pickFirst(...values: (string | null | undefined)[]): string | null {
  for (const v of values) {
    if (v && v.trim().length > 0) return v;
  }
  return null;
}

const HTML_ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&nbsp;": " ",
  // Common named entities found in <title> and <meta> attributes.
  "&copy;": "\u00a9",
  "&reg;": "\u00ae",
  "&trade;": "\u2122",
  "&hellip;": "\u2026",
  "&mdash;": "\u2014",
  "&ndash;": "\u2013",
  "&lsquo;": "\u2018",
  "&rsquo;": "\u2019",
  "&ldquo;": "\u201c",
  "&rdquo;": "\u201d",
  "&middot;": "\u00b7",
  "&bull;": "\u2022",
  "&laquo;": "\u00ab",
  "&raquo;": "\u00bb",
  "&iexcl;": "\u00a1",
  "&iquest;": "\u00bf",
  "&deg;": "\u00b0",
  "&times;": "\u00d7",
  "&divide;": "\u00f7",
  "&euro;": "\u20ac",
  "&pound;": "\u00a3",
  "&cent;": "\u00a2",
  "&yen;": "\u00a5",
  "&sect;": "\u00a7",
  "&para;": "\u00b6",
};

function decodeEntities(s: string): string {
  // Decode named entities and numeric entities (decimal + hex) that
  // commonly appear in <title> and <meta content>. We keep the
  // decoder narrow on purpose: a full HTML entity table would balloon
  // the bundle for a string we only display back to the user. The
  // decoded strings are stored in JSON and rendered as text by the
  // web UI, so XSS is not a concern here — the goal is "looks right",
  // not "byte-for-byte lossless".
  return s.replace(
    /&(?:([a-z]+)|#(\d+)|#x([0-9a-f]+));/gi,
    (m, name, dec, hex) => {
      if (name) return HTML_ENTITIES[`&${name};`] ?? m;
      if (dec) {
        const code = Number.parseInt(dec, 10);
        return Number.isFinite(code) ? codePointFromInt(code, m) : m;
      }
      if (hex) {
        const code = Number.parseInt(hex, 16);
        return Number.isFinite(code) ? codePointFromInt(code, m) : m;
      }
      return m;
    }
  );
}

function codePointFromInt(code: number, fallback: string): string {
  // Reject control characters and unassigned code points — they would
  // be replaced with U+FFFD or render as junk in the UI.
  if (code < 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0d) {
    return fallback;
  }
  try {
    return String.fromCodePoint(code);
  } catch {
    return fallback;
  }
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ---------- Top-level orchestrator ----------

/**
 * Detect the first URL in `content`, fetch it, and return bookmark
 * metadata. On any failure (no URL, DNS error, blocked IP, upstream
 * non-2xx, parse failure) returns `{ ok: false, ... }` so the caller
 * can still save the bookmark without metadata.
 */
export async function fetchBookmarkMetadata(
  content: string,
  options: FetchOptions = {}
): Promise<BookmarkFetchOutcome> {
  const url = extractFirstUrl(content);
  const fetchedAt = new Date().toISOString();
  if (!url) {
    return {
      ok: false,
      reason: "no url in content",
      metadata: { url: "", fetched_at: fetchedAt },
    };
  }

  let html: string;
  try {
    html = await safeFetchHtml(url, options);
  } catch (err) {
    const reason = err instanceof Error ? err.message : "fetch failed";
    return {
      ok: false,
      reason,
      metadata: { url, fetched_at: fetchedAt },
    };
  }

  try {
    const partial = extractBookmarkMetadata(html, url);
    return {
      ok: true,
      metadata: { ...partial, fetched_at: fetchedAt },
    };
  } catch (err) {
    // HTML parsing should never throw, but be defensive — a parse
    // failure still saves the bookmark with whatever URL we found.
    const reason = err instanceof Error ? err.message : "parse failed";
    return {
      ok: false,
      reason,
      metadata: { url, fetched_at: fetchedAt },
    };
  }
}
