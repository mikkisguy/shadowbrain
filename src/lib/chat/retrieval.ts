import type Database from "better-sqlite3";
import { search, sanitizeFts5Query } from "@/db/search";
import { getEnv } from "@/lib/env";
import { log } from "@/lib/logger";

// ---------------------------------------------------------------------------
// RAG retrieval for chat grounding
// ---------------------------------------------------------------------------

/**
 * Retrieve relevant content items from the knowledge base for RAG grounding.
 *
 * Visibility rules (per the App Security Baseline two-level visibility):
 * - `is_hidden = 1` items are **included** by default (AI-OK).
 * - `is_private = 1` items are **excluded** unless `includePrivate` is true
 *   (gated by the thread's `include_private_in_ai` setting or per-send
 *   override).
 *
 * Returns a formatted `## Retrieved context` block for injection as a system
 * message, or `null` when no items match or on error (never blocks the chat).
 */
export function retrieveContext(
  db: Database.Database,
  userMessage: string,
  options: {
    includePrivate?: boolean;
    topK?: number;
  } = {}
): string | null {
  const topK = Math.min(
    50,
    Math.max(1, options.topK ?? getEnv().CHAT_RAG_TOP_K)
  );

  try {
    const sanitized = sanitizeFts5Query(userMessage);
    if (!sanitized) return null;

    const results = search.queryWithFilters(db, sanitized, {
      limit: topK,
      includeHidden: true, // hidden items are AI-OK
      includePrivate: options.includePrivate ?? false,
    });

    if (results.length === 0) return null;

    return formatContextBlock(results);
  } catch (err) {
    // RAG must never block the chat — log and proceed without context
    log("warn", "RAG retrieval failed, proceeding without context", {
      event: "chat.rag.retrieval_error",
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/**
 * Format retrieved items into a `## Retrieved context` system-message block.
 */
function formatContextBlock(
  results: Array<{
    id: string;
    title: string | null;
    type: string;
    snippet: string | null;
    content: string;
  }>
): string {
  const lines: string[] = [
    "## Retrieved context",
    "",
    "The following items were found in the user's knowledge base. " +
      "Use them as context for your response if relevant:",
    "",
  ];

  for (const item of results) {
    const title = item.title || "Untitled";
    const preview = item.snippet ?? item.content.slice(0, 200);
    lines.push(`- **${title}** (${item.type}): ${preview}`);
  }

  return lines.join("\n");
}
