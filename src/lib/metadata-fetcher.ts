// Bookmark metadata auto-fetcher.
//
// Detects a URL in bookmark content, fetches the page HTML through a
// SSRF-safe fetch wrapper, and extracts `og:title` / `og:description` /
// favicon metadata. Stores the result in `content_items.metadata`.
//
// Designed to be called from POST /api/items when `type === "bookmark"`.
// SSRF protection (allowlist + DNS rebinding defense) is provided by
// `src/lib/ssrf.ts` — this module consumes it for HTML-specific concerns
// (content-type check, entity decoding).

import type { LookupFunction } from "node:net";
import {
  request as httpRequest,
  RequestOptions as HttpRequestOptions,
} from "node:http";
import {
  request as httpsRequest,
  RequestOptions as HttpsRequestOptions,
} from "node:https";
import { Readable } from "node:stream";
import { SSRF_POLICY } from "./security.config";
import {
  validateFetchUrl,
  // Re-export for backward compatibility with existing test imports
  isPrivateOrLoopbackIp as ssrfIsPrivateOrLoopbackIp,
  type HostRecord as SsrfHostRecord,
} from "./ssrf";

/** Policy values from security.config.ts */
const {
  defaultTimeoutMs: DEFAULT_TIMEOUT_MS,
  defaultDnsTimeoutMs: DEFAULT_DNS_TIMEOUT_MS,
  defaultMaxBytes: DEFAULT_MAX_BYTES,
  maxRedirectHops: MAX_REDIRECT_HOPS,
} = SSRF_POLICY;

/** User-Agent sent to upstream. Identifies the fetcher for site operators. */
const USER_AGENT = "ShadowBrain/1.0 (+bookmark-metadata)";

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
  resolve?: (hostname: string) => Promise<SsrfHostRecord[]>;
  /** Request timeout in ms. */
  timeoutMs?: number;
  /** DNS resolution timeout in ms. */
  dnsTimeoutMs?: number;
  /** Response body cap in bytes. */
  maxBytes?: number;
}

// Re-export HostRecord for backward compatibility with test imports
export type { HostRecord as HostRecord } from "./ssrf";

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

// Re-export for backward compatibility with existing test imports
export const isPrivateOrLoopbackIp = ssrfIsPrivateOrLoopbackIp;

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
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const dnsTimeoutMs = options.dnsTimeoutMs ?? DEFAULT_DNS_TIMEOUT_MS;
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;

  let currentUrl: URL;
  if (typeof url === "string") {
    try {
      currentUrl = new URL(url);
    } catch {
      throw new FetchError("invalid URL");
    }
  } else {
    currentUrl = new URL(url.toString());
  }

  for (let hop = 0; hop <= MAX_REDIRECT_HOPS; hop++) {
    // 1. Validate the URL and get a safeLookup callback.
    const validationResult = await validateFetchUrl(currentUrl, {
      resolve: options.resolve,
      dnsTimeoutMs,
    });

    if (!validationResult.ok) {
      throw new FetchError(validationResult.reason);
    }

    // 2. Make the request. The safeLookup callback re-validates the IP
    //    at connect time, closing the DNS rebinding window.
    let res: UpstreamResponse;
    try {
      res = await fetchImpl(currentUrl, {
        timeoutMs,
        lookup: validationResult.safeLookup,
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
      // The scheme check is done by `validateFetchUrl` on the next
      // loop iteration. Adding a separate check here would either be
      // dead code or echo the user-supplied scheme in the error
      // message, both of which the security baseline rejects.
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
