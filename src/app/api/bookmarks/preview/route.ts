import { z } from "zod";
import { requireAuthenticated } from "@/lib/auth/guard";
import { errorResponse, logServerError } from "@/lib/api";
import { safeFetchHtml, extractBookmarkMetadata } from "@/lib/metadata-fetcher";

const querySchema = z.object({
  url: z.string().url("Must be a valid URL"),
});

/**
 * GET /api/bookmarks/preview?url=...
 *
 * Accepts a URL through the query string, fetches the page HTML securely
 * (SSRF-protected), and extracts Open Graph / Twitter / <title> metadata.
 *
 * Returns `{ ok: true, metadata: BookmarkMetadata }` on success, or
 * `{ ok: false, reason: string, metadata: { url, fetched_at } }` on
 * failure (unreachable, blocked IP, non-HTML response, etc.).
 *
 * The failure branch always returns 200 with `ok: false` — a fetch
 * failure is an expected outcome (the user wants to bookmark a bad
 * URL), not a server error. Only invalid input (missing / malformed
 * `url` param) returns 400, and unexpected crashes return 500.
 */
export async function GET(request: Request) {
  const auth = await requireAuthenticated(request);
  if (!auth.ok) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const rawUrl = searchParams.get("url");

    const parsed = querySchema.safeParse({ url: rawUrl });
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => ({
        path: i.path.join("."),
        message: i.message,
      }));
      return errorResponse("VALIDATION_ERROR", "Invalid URL", 400, { issues });
    }

    const { url } = parsed.data;
    const fetchedAt = new Date().toISOString();

    let html: string;
    try {
      // Only read the <head> section — metadata (og:title, description,
      // favicon) lives there, so we don't need to download the entire
      // <body>. This is critical for large pages like YouTube (several MB).
      html = await safeFetchHtml(url, { headOnly: true });
    } catch (err) {
      const reason = err instanceof Error ? err.message : "fetch failed";
      return Response.json({
        ok: false,
        reason,
        metadata: { url, fetched_at: fetchedAt },
      });
    }

    const partial = extractBookmarkMetadata(html, url);
    return Response.json({
      ok: true,
      metadata: { ...partial, fetched_at: fetchedAt },
    });
  } catch (error) {
    logServerError(error, { route: "/api/bookmarks/preview", method: "GET" });
    return errorResponse("INTERNAL_ERROR", "Something went wrong", 500);
  }
}
