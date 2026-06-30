import { getDb } from "@/db/index";
import { errorResponse, logServerError } from "@/lib/api";
import { requireAuthenticated } from "@/lib/auth/guard";
import { log } from "@/lib/logger";
import { getOpenRouterModels } from "@/lib/settings/openrouter-models";
import { getSettingValue } from "@/lib/settings/public";

export async function GET(request: Request) {
  const auth = await requireAuthenticated(request);
  if (!auth.ok) return auth.response;

  try {
    const db = getDb();
    const apiKey = getSettingValue(db, "openrouter_api_key");
    const models = await getOpenRouterModels(apiKey);

    log("info", "openrouter models listed", {
      event: "settings.openrouter_models",
      count: models.length,
    });

    return Response.json({ models });
  } catch (error) {
    logServerError(error, {
      route: "/api/settings/openrouter/models",
      method: "GET",
    });
    return errorResponse(
      "UPSTREAM_ERROR",
      "Could not load OpenRouter models",
      502
    );
  }
}
