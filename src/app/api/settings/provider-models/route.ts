import { z } from "zod";
import { getDb } from "@/db/index";
import { errorResponse, logServerError } from "@/lib/api";
import { requireAuthenticated } from "@/lib/auth/guard";
import { log } from "@/lib/logger";
import { listProviderModels } from "@/lib/settings/provider-connection";

export async function GET(request: Request) {
  const auth = await requireAuthenticated(request);
  if (!auth.ok) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const providerParsed = z
      .enum(["opencode-go"])
      .safeParse(searchParams.get("provider"));

    if (!providerParsed.success) {
      return errorResponse("VALIDATION_ERROR", "Invalid provider", 400);
    }

    const db = getDb();
    const models = await listProviderModels(db, providerParsed.data);

    log("info", "provider models listed", {
      event: "settings.provider_models",
      provider: providerParsed.data,
      count: models.length,
    });

    return Response.json({ models });
  } catch (error) {
    logServerError(error, {
      route: "/api/settings/provider-models",
      method: "GET",
    });
    return errorResponse(
      "UPSTREAM_ERROR",
      "Could not load provider models",
      502
    );
  }
}
