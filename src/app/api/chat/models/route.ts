import { getDb } from "@/db/index";
import { requireAuthenticated } from "@/lib/auth/guard";
import { getSettingValue } from "@/lib/settings/public";
import { listModels } from "@/lib/chat/providers";
import type { ChatProvider } from "@/lib/settings/provider-connection";
import { errorResponse, logServerError } from "@/lib/api";

const providers: ChatProvider[] = ["hermes", "opencode-go"];

export async function GET(request: Request) {
  const auth = await requireAuthenticated(request);
  if (!auth.ok) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const filterProvider = searchParams.get("provider");
    if (filterProvider && !providers.includes(filterProvider as ChatProvider)) {
      return errorResponse(
        "VALIDATION_ERROR",
        `Unknown provider: ${filterProvider}`,
        400
      );
    }

    const db = getDb();
    const providerList = filterProvider
      ? [filterProvider as ChatProvider]
      : providers;

    const results: Record<string, { id: string; name: string }[]> = {};
    for (const p of providerList) {
      results[p] = await listModels(p, db);
    }

    // Include the configured default Go-model so the UI can pre-select it.
    const defaultOpenCodeGoModel =
      getSettingValue(db, "opencode_go_model") ?? "";

    return Response.json({
      models: results,
      defaultOpenCodeGoModel: defaultOpenCodeGoModel || null,
    });
  } catch (error) {
    logServerError(error, { route: "/api/chat/models", method: "GET" });
    return errorResponse("INTERNAL_ERROR", "Something went wrong", 500);
  }
}
