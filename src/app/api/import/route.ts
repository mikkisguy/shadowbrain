import { getDb } from "@/db/index";
import { errorResponse, logServerError } from "@/lib/api";
import { requireAuthenticated } from "@/lib/auth/guard";
import { getClientIp } from "@/lib/auth/client-ip";
import { getEnv } from "@/lib/env";
import { log } from "@/lib/logger";
import { IMPORT_MAX_BYTES, runJsonImport } from "@/lib/data-export";

/** Resolve the import payload from an envelope, legacy array, or `{ data }` wrapper. */
function resolveImportBody(
  body: unknown
): { ok: true; data: unknown } | { ok: false; message: string } {
  if (Array.isArray(body)) return { ok: true, data: body };
  if (typeof body !== "object" || body === null)
    return { ok: false, message: "Invalid import request" };

  const requestBody = body as {
    mode?: unknown;
    data?: unknown;
    format?: unknown;
  };
  if (requestBody.format === "shadowbrain-export") {
    if (requestBody.mode !== undefined && requestBody.mode !== "merge") {
      return { ok: false, message: "Only merge mode is supported" };
    }
    return { ok: true, data: body };
  }
  if (requestBody.mode !== undefined && requestBody.mode !== "merge") {
    return { ok: false, message: "Only merge mode is supported" };
  }
  if (!("data" in requestBody))
    return { ok: false, message: "Import data is required" };
  return { ok: true, data: requestBody.data };
}

type BodyReadResult =
  { ok: true; bytes: Uint8Array } | { tooLarge: true } | { ok: false };

/** Read incrementally so a request cannot allocate an unbounded JSON payload. */
async function readBodyWithinLimit(request: Request): Promise<BodyReadResult> {
  const contentLength = request.headers.get("content-length");
  if (contentLength !== null) {
    const declaredLength = Number(contentLength);
    if (Number.isFinite(declaredLength) && declaredLength > IMPORT_MAX_BYTES) {
      return { tooLarge: true };
    }
  }
  if (!request.body) return { ok: false };

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      total += next.value.byteLength;
      if (total > IMPORT_MAX_BYTES) {
        await reader.cancel();
        return { tooLarge: true };
      }
      chunks.push(next.value);
    }
  } catch {
    return { ok: false };
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { ok: true, bytes };
}

export async function POST(request: Request) {
  const auth = await requireAuthenticated(request);
  if (!auth.ok) return auth.response;

  try {
    const env = getEnv();
    const bodyRead = await readBodyWithinLimit(request);
    if ("tooLarge" in bodyRead) {
      return errorResponse(
        "PAYLOAD_TOO_LARGE",
        `Import payload exceeds ${IMPORT_MAX_BYTES} bytes`,
        413
      );
    }
    if (!bodyRead.ok)
      return errorResponse("VALIDATION_ERROR", "Invalid JSON", 400);

    let body: unknown;
    try {
      body = JSON.parse(
        new TextDecoder("utf-8", { fatal: true }).decode(bodyRead.bytes)
      );
    } catch {
      return errorResponse("VALIDATION_ERROR", "Invalid JSON", 400);
    }

    const resolved = resolveImportBody(body);
    if (!resolved.ok)
      return errorResponse("VALIDATION_ERROR", resolved.message, 400);

    const imported = runJsonImport(getDb(), resolved.data, {
      actorId: auth.username,
      actorType: "user",
      ip: getClientIp(request, { header: env.TRUSTED_PROXY_HEADER }),
      userAgent: request.headers.get("user-agent"),
    });
    if (!imported.ok) {
      return errorResponse("VALIDATION_ERROR", "Invalid import data", 400, {
        issues: imported.issues,
      });
    }

    log("info", "content.import", {
      event: "content.import",
      actor: auth.username,
      ...imported.result.created,
      reused_tags: imported.result.reused_tags,
    });
    return Response.json(imported.result);
  } catch (error) {
    logServerError(error, { route: "/api/import", method: "POST" });
    return errorResponse("INTERNAL_ERROR", "Something went wrong", 500);
  }
}
