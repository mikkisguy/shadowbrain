import { z } from "zod";
import { getDb, search, contentTags, contentLinks } from "@/db/index";
import {
  parsePagination,
  errorResponse,
  parseJson,
  parseIncludeFlag,
  logServerError,
} from "@/lib/api";
import { log } from "@/lib/logger";
import { requireAuthenticated } from "@/lib/auth/guard";

const searchSchema = z.object({
  q: z
    .string()
    .trim()
    .min(1, "Query cannot be empty")
    .max(256, "Query is too long"),
  type: z.string().trim().min(1).max(64).optional(),
  tag: z.string().trim().min(1).max(256).optional(),
});

export async function GET(request: Request) {
  // Defense in depth: the proxy already enforces auth, but the route
  // re-checks so a direct call still fails closed.
  const auth = await requireAuthenticated(request);
  if (!auth.ok) return auth.response;

  try {
    const { searchParams } = new URL(request.url);

    const parsed = parseJson(searchSchema, {
      q: searchParams.get("q") ?? undefined,
      type: searchParams.get("type") ?? undefined,
      tag: searchParams.get("tag") ?? undefined,
    });
    if (!parsed.success) {
      return errorResponse("VALIDATION_ERROR", "Invalid search query", 400, {
        issues: parsed.details,
      });
    }

    const { page, limit, offset } = parsePagination({
      page: searchParams.get("page") ?? undefined,
      limit: searchParams.get("limit") ?? undefined,
    });

    // Visibility opt-in is admin-only; auth above cleared the gate.
    const includeHidden = parseIncludeFlag(searchParams.get("include_hidden"));
    const includePrivate = parseIncludeFlag(
      searchParams.get("include_private")
    );

    const db = getDb();
    const results = search.queryWithFilters(db, parsed.data.q, {
      type: parsed.data.type,
      tag: parsed.data.tag,
      limit,
      offset,
      includeHidden,
      includePrivate,
    });
    const total = search.countWithFilters(db, parsed.data.q, {
      type: parsed.data.type,
      tag: parsed.data.tag,
      includeHidden,
      includePrivate,
    });

    // Attach each result's tag names (batched, no N+1) so the card
    // renders clickable tags in search results too — the tag-click
    // affordance works the same in list and search mode.
    const ids = results.map((r) => r.id);
    const tagMap = contentTags.findNamesByContentIds(db, ids);
    // Same cover resolution as /api/items: the first linked image's
    // path, else the row's own image_path. Keeps the browse card
    // identical in list and search mode.
    const coverMap = contentLinks.findCoverImagesBySourceIds(db, ids, {
      includeHidden,
      includePrivate,
    });
    const resultsWithTags = results.map((r) => ({
      ...r,
      image_path: coverMap[r.id] ?? r.image_path,
      tags: tagMap[r.id] ?? [],
    }));

    log("info", "search executed", {
      event: "search.query",
      queryLength: parsed.data.q.length,
      count: results.length,
      total,
      includeHidden,
      includePrivate,
    });

    return Response.json({
      query: parsed.data.q,
      results: resultsWithTags,
      total,
      page,
      limit,
    });
  } catch (error) {
    logServerError(error, { route: "/api/search", method: "GET" });
    return errorResponse("INTERNAL_ERROR", "Something went wrong", 500);
  }
}
