import { errorResponse, logServerError } from "@/lib/api";
import { requireAuthenticated } from "@/lib/auth/guard";
import { buildImportTemplate } from "@/lib/data-export";

export async function GET(request: Request) {
  const auth = await requireAuthenticated(request);
  if (!auth.ok) return auth.response;

  try {
    return new Response(JSON.stringify(buildImportTemplate(), null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition":
          'attachment; filename="shadowbrain-import-template.json"',
      },
    });
  } catch (error) {
    logServerError(error, { route: "/api/import/template", method: "GET" });
    return errorResponse("INTERNAL_ERROR", "Something went wrong", 500);
  }
}
