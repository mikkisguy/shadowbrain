import { z } from "zod";
import { getDb } from "@/db/index";
import { errorResponse, parseJson, logServerError } from "@/lib/api";
import { requireAuthenticated } from "@/lib/auth/guard";
import { log } from "@/lib/logger";
import { testProviderConnection } from "@/lib/settings/provider-connection";

const bodySchema = z.object({
  provider: z.enum(["hermes", "opencode-go"]),
});

export async function POST(request: Request) {
  const auth = await requireAuthenticated(request);
  if (!auth.ok) return auth.response;

  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return errorResponse("VALIDATION_ERROR", "Invalid JSON", 400);
    }

    const parsed = parseJson(bodySchema, body);
    if (!parsed.success) {
      return errorResponse("VALIDATION_ERROR", "Invalid input", 400, {
        issues: parsed.details,
      });
    }

    const db = getDb();
    const result = await testProviderConnection(db, parsed.data.provider);

    log("info", "provider connection tested", {
      event: "settings.test_connection",
      provider: parsed.data.provider,
      ok: result.ok,
    });

    if (!result.ok) {
      return Response.json({
        ok: false,
        message: result.reason,
      });
    }

    return Response.json({
      ok: true,
      message: `Connected (${result.modelCount} models)`,
      modelCount: result.modelCount,
    });
  } catch (error) {
    logServerError(error, {
      route: "/api/settings/test-connection",
      method: "POST",
    });
    return errorResponse("INTERNAL_ERROR", "Something went wrong", 500);
  }
}
