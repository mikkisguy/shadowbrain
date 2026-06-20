import { z } from "zod";
import { getDb, search } from "@/db/index";
import {
  parsePagination,
  errorResponse,
  parseJson,
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
  tag: z.string().trim().min(1).max(64).optional(),
});

export async function GET(request: Request) {
  const auth = await requireAuthenticated(request);
  if (!auth.ok) return auth.response;
  // TODO: apply per-IP rate limit once src/lib/rate-limit.ts lands (#56).
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

    const db = getDb();
    const results = search.queryWithFilters(db, parsed.data.q, {
      type: parsed.data.type,
      tag: parsed.data.tag,
      limit,
      offset,
    });
    const total = search.countWithFilters(db, parsed.data.q, {
      type: parsed.data.type,
      tag: parsed.data.tag,
    });

    log("info", "search executed", {
      event: "search.query",
      queryLength: parsed.data.q.length,
      count: results.length,
      total,
    });

    return Response.json({
      query: parsed.data.q,
      results,
      total,
      page,
      limit,
    });
  } catch (error) {
    logServerError(error, { route: "/api/search", method: "GET" });
    return errorResponse("INTERNAL_ERROR", "Something went wrong", 500);
  }
}
