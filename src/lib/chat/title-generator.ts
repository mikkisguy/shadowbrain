import type Database from "better-sqlite3";
import http from "node:http";
import https from "node:https";
import { log } from "@/lib/logger";
import { getSettingValue } from "@/lib/settings/public";
import type { MessageRow } from "./types";

const TITLE_MAX_CHARS = 50;
const TITLE_MODEL = "deepseek-v4-flash";
const REQUEST_TIMEOUT_MS = 30_000;

/**
 * Minimal HTTP POST using Node's native module — bypasses Next.js's patched
 * global `fetch`, which kills in-flight requests after the route handler
 * returns.
 */
function nativePostJson(
  url: string,
  body: unknown,
  headers: Record<string, string>,
  timeoutMs: number
): Promise<{ ok: boolean; status: number; data: string; elapsedMs: number }> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const u = new URL(url);
    const mod = u.protocol === "https:" ? https : http;

    const req = mod.request(
      u,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        timeout: timeoutMs,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () =>
          resolve({
            ok: (res.statusCode ?? 500) < 400,
            status: res.statusCode ?? 500,
            data: Buffer.concat(chunks).toString("utf-8"),
            elapsedMs: Date.now() - start,
          })
        );
      }
    );

    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error(`Request timeout after ${Date.now() - start}ms`));
    });

    req.write(JSON.stringify(body));
    req.end();
  });
}

/**
 * Generate an AI title for a thread after the first exchange (user + assistant).
 *
 * Uses a dedicated small model (deepseek-v4-flash) and Node's native HTTP to
 * avoid Next.js request-lifecycle interference.
 *
 * Fails gracefully — on error, the original `deriveTitle`-based title is kept.
 */
export async function generateThreadTitle(
  db: Database.Database,
  threadId: string
): Promise<void> {
  const messages = db
    .prepare(
      `SELECT role, content FROM chat_messages
       WHERE thread_id = ?
       ORDER BY created_at ASC
       LIMIT 2`
    )
    .all(threadId) as Pick<MessageRow, "role" | "content">[];

  if (messages.length < 2) return;

  const userMsg = messages.find((m) => m.role === "user");
  const assistantMsg = messages.find((m) => m.role === "assistant");
  if (!userMsg || !assistantMsg) return;

  const baseURL = getSettingValue(db, "opencode_go_api_base");
  if (!baseURL) {
    log(
      "warn",
      "AI thread title generation skipped — provider not configured",
      {
        event: "chat_thread.title_no_provider",
        threadId,
      }
    );
    return;
  }

  const apiKey = (getSettingValue(db, "opencode_go_api_key") ?? "").trim();

  log("info", "AI thread title generation started", {
    event: "chat_thread.title_generation_start",
    threadId,
    titleModel: TITLE_MODEL,
  });

  try {
    const headers: Record<string, string> = {};
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

    const { ok, status, data, elapsedMs } = await nativePostJson(
      `${baseURL.replace(/\/+$/, "")}/chat/completions`,
      {
        model: TITLE_MODEL,
        messages: [
          {
            role: "user",
            content: `What is a good short title (max ${TITLE_MAX_CHARS} characters) for this conversation? Reply with ONLY the title:\n\nUser: ${userMsg.content}\n\nAssistant: ${assistantMsg.content}`,
          },
        ],
        max_tokens: 500,
        temperature: 0.3,
      },
      headers,
      REQUEST_TIMEOUT_MS
    );

    log("info", "AI thread title generation — provider responded", {
      event: "chat_thread.title_response",
      threadId,
      status,
      elapsedMs,
      bodyLen: data.length,
    });

    if (!ok) {
      log("warn", "AI thread title generation — provider error", {
        event: "chat_thread.title_provider_error",
        threadId,
        status,
        body: data.slice(0, 500),
      });
      return;
    }

    const body = JSON.parse(data) as Record<string, unknown>;
    const choices = body.choices as
      | Array<{
          message?: {
            content?: string;
            reasoning_content?: string;
          };
        }>
      | undefined;
    let text = choices?.[0]?.message?.content ?? "";

    // Reasoning models (DeepSeek R1-style) spend tokens on internal
    // reasoning before producing visible content.  If the token budget
    // was exhausted before the model finished reasoning, `content`
    // will be empty while `reasoning_content` contains the partial
    // thought process — including title candidates.  Extract the last
    // plausible title as a fallback.
    if (!text) {
      const reasoning = choices?.[0]?.message?.reasoning_content ?? "";
      const titleMatches = reasoning.match(/"([^"]{3,50})"/g);
      if (titleMatches) {
        // Pick the last quoted title candidate (usually the final choice)
        const lastMatch = titleMatches[titleMatches.length - 1];
        text = lastMatch.replace(/^"|"$/g, "");
      }
      if (text) {
        log("info", "AI thread title extracted from reasoning content", {
          event: "chat_thread.title_from_reasoning",
          threadId,
          extractedTitle: text,
        });
      }
    }

    const title = text.trim().slice(0, TITLE_MAX_CHARS);

    if (title.length > 0) {
      db.prepare(
        `UPDATE chat_threads SET title = ?, updated_at = ? WHERE id = ?`
      ).run(title, new Date().toISOString(), threadId);

      log("info", "AI thread title generated", {
        event: "chat_thread.title_generated",
        threadId,
        title,
      });
    } else {
      log("warn", "AI thread title generation produced empty text", {
        event: "chat_thread.title_empty",
        threadId,
        rawText: text,
        responseBody: JSON.stringify(body).slice(0, 1000),
      });
    }
  } catch (err) {
    log("warn", "AI thread title generation failed", {
      event: "chat_thread.title_generation_error",
      threadId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
