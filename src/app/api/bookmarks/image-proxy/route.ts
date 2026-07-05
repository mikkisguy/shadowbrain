import { z } from "zod";
import { requireAuthenticated } from "@/lib/auth/guard";
import { errorResponse, logServerError } from "@/lib/api";
import { validateFetchUrl } from "@/lib/ssrf";
import type { LookupFunction } from "node:net";
import {
  request as httpRequest,
  type RequestOptions as HttpRequestOptions,
} from "node:http";
import {
  request as httpsRequest,
  type RequestOptions as HttpsRequestOptions,
} from "node:https";

const querySchema = z.object({
  url: z.string().url("Must be a valid URL"),
});

const MAX_REDIRECTS = 3;
const MAX_IMAGE_BYTES = 256 * 1024; // 256KB limit

/**
 * Fetch an image from a validated URL, following redirects with SSRF
 * re-validation at each hop. Returns the image buffer and content type.
 */
async function fetchImageWithRedirects(
  startUrl: URL,
  startLookup: LookupFunction
): Promise<{ contentType: string; buffer: Buffer }> {
  let currentUrl = startUrl;
  let currentLookup = startLookup;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const protocol =
      currentUrl.protocol === "https:" ? httpsRequest : httpRequest;

    const requestOptions: HttpRequestOptions | HttpsRequestOptions = {
      method: "GET",
      protocol: currentUrl.protocol,
      hostname: currentUrl.hostname,
      port: currentUrl.port || (currentUrl.protocol === "https:" ? 443 : 80),
      path: `${currentUrl.pathname}${currentUrl.search}`,
      headers: {
        Host: currentUrl.host,
        "User-Agent": "ShadowBrain/1.0 (+bookmark-metadata)",
        Accept: "image/*,*/*;q=0.8",
      },
      lookup: currentLookup,
    };

    const result = await new Promise<{
      status: number;
      contentType: string;
      buffer: Buffer;
      location: string | null;
    }>((resolveReq, rejectReq) => {
      const req = protocol(requestOptions, (res) => {
        const status = res.statusCode ?? 0;

        // Handle redirects — extract Location and resolve it
        if (status >= 300 && status < 400 && res.headers.location) {
          res.destroy();
          const location = Array.isArray(res.headers.location)
            ? res.headers.location[0]
            : res.headers.location;
          resolveReq({
            status,
            contentType: "",
            buffer: Buffer.alloc(0),
            location: location ?? null,
          });
          return;
        }

        if (status < 200 || status >= 400) {
          res.destroy();
          rejectReq(new Error(`upstream ${status}`));
          return;
        }

        const contentType =
          res.headers["content-type"] ?? "application/octet-stream";
        const chunks: Buffer[] = [];
        let size = 0;

        res.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > MAX_IMAGE_BYTES) {
            res.destroy();
            rejectReq(new Error("image too large"));
            return;
          }
          chunks.push(chunk);
        });

        res.on("end", () => {
          resolveReq({
            status,
            contentType: contentType.split(";")[0]!.trim(),
            buffer: Buffer.concat(chunks),
            location: null,
          });
        });

        res.on("error", rejectReq);
      });

      req.on("error", rejectReq);
      req.setTimeout(5000, () => {
        req.destroy(new Error("request timeout"));
      });
      req.end();
    });

    // Not a redirect — return the image
    if (!result.location) {
      return { contentType: result.contentType, buffer: result.buffer };
    }

    // Redirect — resolve the Location and re-validate through SSRF
    const next = new URL(result.location, currentUrl);
    const validation = await validateFetchUrl(next.toString());
    if (!validation.ok) {
      throw new Error(`redirect to blocked URL: ${result.location}`);
    }
    currentUrl = validation.url;
    currentLookup = validation.safeLookup;
  }

  throw new Error("too many redirects");
}

/**
 * GET /api/bookmarks/image-proxy?url=...
 *
 * Proxies an external image (favicon, og:image, etc.) through our origin
 * so the browser's CSP (which restricts img-src to 'self') doesn't block
 * it. The URL is validated through the SSRF guard before fetching,
 * preventing the endpoint from being used to probe internal services.
 * Redirects are followed with SSRF re-validation at each hop.
 *
 * Returns the image with appropriate Content-Type and cache headers.
 * Failures return 404 (not found) or 400 (invalid URL).
 */
export async function GET(request: Request) {
  const auth = await requireAuthenticated(request);
  if (!auth.ok) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const rawUrl = searchParams.get("url");

    const parsed = querySchema.safeParse({ url: rawUrl });
    if (!parsed.success) {
      return errorResponse("VALIDATION_ERROR", "Invalid URL", 400);
    }

    const { url } = parsed.data;

    // Validate the URL through SSRF protection
    const validation = await validateFetchUrl(url);
    if (!validation.ok) {
      return errorResponse("VALIDATION_ERROR", "Invalid URL", 400);
    }

    const image = await fetchImageWithRedirects(
      validation.url,
      validation.safeLookup
    );

    // Cache for 1 day (images don't change often)
    return new Response(new Uint8Array(image.buffer), {
      status: 200,
      headers: {
        "Content-Type": image.contentType,
        "Cache-Control": "public, max-age=86400",
        "Content-Length": image.buffer.length.toString(),
      },
    });
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.includes("upstream") ||
        error.message.includes("timeout") ||
        error.message.includes("too large") ||
        error.message.includes("redirect"))
    ) {
      return errorResponse("NOT_FOUND", "Image not found", 404);
    }
    logServerError(error, {
      route: "/api/bookmarks/image-proxy",
      method: "GET",
    });
    return errorResponse("INTERNAL_ERROR", "Failed to fetch image", 500);
  }
}
