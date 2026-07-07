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
import { request as httpRequest } from "node:http";

import { SSRF_POLICY } from "./security.config";
import { validateFetchUrl, type HostRecord as SsrfHostRecord } from "./ssrf";
import {
  FetchError,
  defaultFetchImpl,
  isHtmlResponse,
  readCappedBody,
  readHeadSection,
} from "./http-fetch";
import type { UpstreamResponse } from "./http-fetch";
import {
  matchMeta,
  matchMetaName,
  matchTitle,
  resolveFavicon,
  safeAbsolute,
  pickFirst,
} from "./html-parsers";
import { extractFirstUrl } from "./url-extract";

// Re-export public API for backward compatibility
export { isPrivateOrLoopbackIp } from "./ssrf";
export type { HostRecord } from "./ssrf";
export type { UpstreamResponseLike } from "./http-fetch";
export { extractFirstUrl };

/** Policy values from security.config.ts */
const {
  defaultTimeoutMs: DEFAULT_TIMEOUT_MS,
  defaultDnsTimeoutMs: DEFAULT_DNS_TIMEOUT_MS,
  defaultMaxBytes: DEFAULT_MAX_BYTES,
  maxRedirectHops: MAX_REDIRECT_HOPS,
} = SSRF_POLICY;

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
  /**
   * When true, only read the `<head>` section (stop at `</head>`).
   * Metadata (og:title, description, favicon) lives in `<head>`, so
   * this avoids downloading megabytes of `<body>` for large pages.
   * Defaults to false for backward compatibility.
   */
  headOnly?: boolean;
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

// ---------- SSRF-safe fetch ----------

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
  const headOnly = options.headOnly ?? false;

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
      // Use headOnly mode for metadata extraction — stops at </head>
      // to avoid downloading megabytes of <body> content.
      return await (headOnly
        ? readHeadSection(res.body, maxBytes)
        : readCappedBody(res.body, maxBytes));
    } catch (err) {
      res.body.destroy();
      throw err;
    }
  }

  throw new FetchError("too many redirects");
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
    // Default to headOnly mode for metadata extraction — metadata
    // (og:title, description, favicon) lives in <head>, so we don't
    // need to download the entire <body>. This is critical for large
    // pages like YouTube (several MB). Callers can override by passing
    // headOnly: false explicitly.
    html = await safeFetchHtml(url, { headOnly: true, ...options });
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
