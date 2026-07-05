import { z } from "zod";
import { requireAuthenticated } from "@/lib/auth/guard";
import { errorResponse, logServerError } from "@/lib/api";
import { validateFetchUrl } from "@/lib/ssrf";
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

/**
 * GET /api/bookmarks/image-proxy?url=...
 *
 * Proxies an external image (favicon, og:image, etc.) through our origin
 * so the browser's CSP (which restricts img-src to 'self') doesn't block
 * it. The URL is validated through the SSRF guard before fetching,
 * preventing the endpoint from being used to probe internal services.
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

    // Fetch the image
    const imageUrl = validation.url;
    const protocol =
      imageUrl.protocol === "https:" ? httpsRequest : httpRequest;

    const requestOptions: HttpRequestOptions | HttpsRequestOptions = {
      method: "GET",
      protocol: imageUrl.protocol,
      hostname: imageUrl.hostname,
      port: imageUrl.port || (imageUrl.protocol === "https:" ? 443 : 80),
      path: `${imageUrl.pathname}${imageUrl.search}`,
      headers: {
        Host: imageUrl.host,
        "User-Agent": "ShadowBrain/1.0 (+bookmark-metadata)",
        Accept: "image/*,*/*;q=0.8",
      },
      lookup: validation.safeLookup,
    };

    const image = await new Promise<{
      contentType: string;
      buffer: Buffer;
    }>((resolveReq, rejectReq) => {
      const req = protocol(requestOptions, (res) => {
        if (!res.statusCode || res.statusCode >= 400) {
          res.destroy();
          rejectReq(new Error(`upstream ${res.statusCode}`));
          return;
        }

        const contentType =
          res.headers["content-type"] ?? "application/octet-stream";
        const chunks: Buffer[] = [];
        let size = 0;
        const maxSize = 256 * 1024; // 256KB limit

        res.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > maxSize) {
            res.destroy();
            rejectReq(new Error("image too large"));
            return;
          }
          chunks.push(chunk);
        });

        res.on("end", () => {
          resolveReq({
            contentType: contentType.split(";")[0]!.trim(),
            buffer: Buffer.concat(chunks),
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
        error.message.includes("too large"))
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
