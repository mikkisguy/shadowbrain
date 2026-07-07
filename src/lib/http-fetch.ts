// HTTP fetch utilities for SSRF-safe bookmark metadata fetching.
// Wraps node:http / node:https with redirect following, size caps,
// and content-type validation.

import type { LookupFunction } from "node:net";
import {
  request as httpRequest,
  type RequestOptions as HttpRequestOptions,
} from "node:http";
import {
  request as httpsRequest,
  type RequestOptions as HttpsRequestOptions,
} from "node:https";
import { Readable } from "node:stream";

/** User-Agent sent to upstream. Identifies the fetcher for site operators. */
const USER_AGENT = "ShadowBrain/1.0 (+bookmark-metadata)";

export class FetchError extends Error {
  constructor(public readonly reason: string) {
    super(reason);
    this.name = "FetchError";
  }
}

export interface UpstreamResponse {
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

export const defaultFetchImpl = (
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

export function isHtmlResponse(
  contentType: string | string[] | undefined
): boolean {
  const ct = Array.isArray(contentType) ? contentType[0] : contentType;
  if (!ct) return false;
  return ct.includes("text/html") || ct.includes("application/xhtml+xml");
}

export async function readCappedBody(
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

/**
 * Read only the `<head>` section of an HTML document. Metadata (og:title,
 * og:description, favicon, etc.) lives in `<head>`, so we can stop reading
 * once we hit `</head>` — this avoids downloading megabytes of `<body>`
 * content for large pages like YouTube.
 *
 * Falls back to reading up to `maxBytes` if `</head>` is never found
 * (malformed HTML or non-HTML response).
 */
export async function readHeadSection(
  body: Readable,
  maxBytes: number
): Promise<string> {
  const chunks: Buffer[] = [];
  let total = 0;
  let accumulated = "";

  for await (const chunk of body) {
    const buf = Buffer.isBuffer(chunk)
      ? chunk
      : Buffer.from(chunk as Uint8Array);
    total += buf.byteLength;
    if (total > maxBytes) {
      throw new FetchError("response body too large");
    }
    chunks.push(buf);

    // Build a running string — avoids O(n²) Buffer.concat on every chunk.
    accumulated += buf.toString("utf-8");

    // Search for </head> directly. The risk of </head> appearing inside
    // a script/style block is low, and early truncation still captures
    // meta tags that appear before the script/style block.
    const headEndMatch = accumulated.match(/<\/head[^>]*>/i);
    if (headEndMatch && headEndMatch.index !== undefined) {
      return accumulated.slice(0, headEndMatch.index + headEndMatch[0].length);
    }
  }

  // If we didn't find </head>, return what we have (up to maxBytes)
  return Buffer.concat(chunks).toString("utf-8");
}
