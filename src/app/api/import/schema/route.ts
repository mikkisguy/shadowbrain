import { errorResponse, logServerError } from "@/lib/api";
import { requireAuthenticated } from "@/lib/auth/guard";
import { EXPORT_JSON_SCHEMA } from "@/lib/data-export";

export async function GET(request: Request) {
  const auth = await requireAuthenticated(request);
  if (!auth.ok) return auth.response;

  try {
    return new Response(JSON.stringify(EXPORT_JSON_SCHEMA, null, 2), {
      headers: {
        "Content-Type": "application/schema+json; charset=utf-8",
        "Content-Disposition":
          'attachment; filename="shadowbrain-export.schema.json"',
      },
    });
  } catch (error) {
    logServerError(error, { route: "/api/import/schema", method: "GET" });
    return errorResponse("INTERNAL_ERROR", "Something went wrong", 500);
  }
}
