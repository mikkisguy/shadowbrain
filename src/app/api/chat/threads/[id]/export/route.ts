import { z } from "zod";
import { getDb } from "@/db/index";
import { requireAuthenticated } from "@/lib/auth/guard";
import { errorResponse, logServerError } from "@/lib/api";
import { formatModelName } from "@/lib/chat/format-model-name";
import type { ThreadRow, MessageRow } from "@/lib/chat/types";

const exportParamsSchema = z.object({
  format: z.enum(["markdown", "json"]).optional().default("markdown"),
});

function sanitizeFilename(title: string): string {
  return (
    title
      .replace(/[^a-zA-Z0-9._-]/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_|_$/g, "")
      .slice(0, 64) || "chat"
  );
}

function sanitizeHeaderParam(value: string): string {
  // Strip characters unsafe in an HTTP header parameter value:
  // quotes, newlines, semicolons, and other control characters.
  return value.replace(/["\r\n;<>\\]/g, "").slice(0, 128);
}

function toMarkdown(thread: ThreadRow, messages: MessageRow[]): string {
  const lines: string[] = [];

  lines.push(`# ${thread.title}`);
  lines.push("");
  lines.push(`**Provider:** ${thread.target_provider}  `);
  lines.push(`**Model:** ${formatModelName(thread.target_model)}  `);
  lines.push(`**Created:** ${new Date(thread.created_at).toLocaleString()}  `);
  lines.push(`**Updated:** ${new Date(thread.updated_at).toLocaleString()}  `);
  lines.push("");
  lines.push("---");
  lines.push("");

  for (const msg of messages) {
    const timestamp = new Date(msg.created_at).toLocaleString();
    const role = msg.role.charAt(0).toUpperCase() + msg.role.slice(1);

    lines.push(`### ${role} — ${timestamp}`);

    if (msg.target_model) {
      lines.push(`*Model: ${formatModelName(msg.target_model)}*`);
    }

    if (msg.prompt_tokens != null || msg.completion_tokens != null) {
      const parts: string[] = [];
      if (msg.prompt_tokens != null) {
        parts.push(`in: ${msg.prompt_tokens}`);
      }
      if (msg.completion_tokens != null) {
        parts.push(`out: ${msg.completion_tokens}`);
      }
      lines.push(`*Tokens: ${parts.join(" / ")}*`);
    }

    lines.push("");
    lines.push(msg.content);
    lines.push("");
    lines.push("---");
    lines.push("");
  }

  return lines.join("\n");
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuthenticated(request);
  if (!auth.ok) return auth.response;

  try {
    const { id } = await params;
    const url = new URL(request.url);
    const parsed = exportParamsSchema.safeParse({
      format: url.searchParams.get("format") ?? undefined,
    });

    if (!parsed.success) {
      return errorResponse(
        "VALIDATION_ERROR",
        "Invalid format (must be 'markdown' or 'json')",
        400
      );
    }

    const { format } = parsed.data;
    const db = getDb();

    const thread = db
      .prepare("SELECT * FROM chat_threads WHERE id = ?")
      .get(id) as ThreadRow | undefined;

    if (!thread) {
      return errorResponse("NOT_FOUND", "Thread not found", 404);
    }

    const messages = db
      .prepare(
        "SELECT * FROM chat_messages WHERE thread_id = ? ORDER BY created_at ASC"
      )
      .all(id) as MessageRow[];

    const safeFilename = sanitizeFilename(thread.title);
    const ext = format === "json" ? "json" : "md";
    const rawFilename = `${safeFilename}-${id.slice(0, 8)}.${ext}`;
    const filename = sanitizeHeaderParam(rawFilename);

    if (format === "json") {
      const exportData = {
        exportedAt: new Date().toISOString(),
        thread: {
          id: thread.id,
          title: thread.title,
          provider: thread.target_provider,
          model: thread.target_model,
          createdAt: thread.created_at,
          updatedAt: thread.updated_at,
        },
        messages: messages.map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          targetProvider: m.target_provider,
          targetModel: m.target_model,
          promptTokens: m.prompt_tokens,
          completionTokens: m.completion_tokens,
          createdAt: m.created_at,
        })),
      };

      return new Response(JSON.stringify(exportData, null, 2), {
        headers: {
          "Content-Type": "application/json",
          "Content-Disposition": `attachment; filename="${filename}"`,
        },
      });
    }

    const markdown = toMarkdown(thread, messages);

    return new Response(markdown, {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    logServerError(error, {
      route: "/api/chat/threads/[id]/export",
      method: "GET",
    });
    return errorResponse("INTERNAL_ERROR", "Something went wrong", 500);
  }
}
