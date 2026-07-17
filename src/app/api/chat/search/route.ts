import { z } from "zod";
import { getDb, sanitizeFts5Query } from "@/db/index";
import { requireAuthenticated } from "@/lib/auth/guard";
import { errorResponse, logServerError } from "@/lib/api";

const searchParamsSchema = z.object({
  q: z.string().min(1).max(256),
  limit: z
    .string()
    .optional()
    .transform((v) => {
      const n = Number(v ?? 20);
      return Number.isNaN(n) ? 20 : Math.min(50, Math.max(1, n));
    }),
});

interface SearchRow {
  thread_id: string;
  thread_title: string;
  target_provider: string;
  target_model: string;
  updated_at: string;
  message_id: string;
  message_role: string;
  message_content: string;
  message_created_at: string;
  snippet: string;
}

export async function GET(request: Request) {
  const auth = await requireAuthenticated(request);
  if (!auth.ok) return auth.response;

  try {
    const url = new URL(request.url);
    const parsed = searchParamsSchema.safeParse({
      q: url.searchParams.get("q"),
      limit: url.searchParams.get("limit") ?? undefined,
    });

    if (!parsed.success) {
      return errorResponse(
        "VALIDATION_ERROR",
        "Query parameter 'q' is required (1-256 chars)",
        400
      );
    }

    const { q, limit } = parsed.data;
    const ftsQuery = sanitizeFts5Query(q);
    if (!ftsQuery) {
      return Response.json({ query: q, results: [] });
    }

    const db = getDb();

    // Search across chat_messages using FTS5, join with threads.
    // For each thread, return only the first (best-ranked) matching message.
    const stmt = db.prepare(`
      SELECT
        ct.id AS thread_id,
        ct.title AS thread_title,
        ct.target_provider,
        ct.target_model,
        ct.updated_at,
        cm.id AS message_id,
        cm.role AS message_role,
        cm.content AS message_content,
        cm.created_at AS message_created_at,
        bm25(chat_messages_search) AS rank,
        snippet(chat_messages_search, 0, '<mark>', '</mark>', '…', 24) AS snippet
      FROM chat_messages_search
      JOIN chat_messages cm ON cm.rowid = chat_messages_search.rowid
      JOIN chat_threads ct ON ct.id = cm.thread_id
      WHERE chat_messages_search MATCH ?
      ORDER BY rank
      LIMIT ?
    `);

    const rows = stmt.all(ftsQuery, limit) as SearchRow[];

    // Deduplicate: one result per thread (pick the best-ranked message).
    const seenThreads = new Set<string>();
    const results: Array<{
      threadId: string;
      threadTitle: string;
      targetProvider: string;
      targetModel: string;
      updatedAt: string;
      messageId: string;
      messageRole: string;
      createdAt: string;
      snippet: string;
    }> = [];

    for (const row of rows) {
      if (seenThreads.has(row.thread_id)) continue;
      seenThreads.add(row.thread_id);
      results.push({
        threadId: row.thread_id,
        threadTitle: row.thread_title,
        targetProvider: row.target_provider,
        targetModel: row.target_model,
        updatedAt: row.updated_at,
        messageId: row.message_id,
        messageRole: row.message_role,
        createdAt: row.message_created_at,
        snippet: row.snippet,
      });
    }

    return Response.json({ query: q, results });
  } catch (error) {
    logServerError(error, {
      route: "/api/chat/search",
      method: "GET",
    });
    return errorResponse("INTERNAL_ERROR", "Something went wrong", 500);
  }
}
