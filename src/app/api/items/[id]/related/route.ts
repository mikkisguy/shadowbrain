import { getDb, contentItems } from "@/db/index";
import { errorResponse, parseIncludeFlag, logServerError } from "@/lib/api";
import { requireAuthenticated } from "@/lib/auth/guard";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  // Defense in depth: the proxy already enforces auth.
  const auth = await requireAuthenticated(request);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  try {
    const { searchParams } = new URL(request.url);
    const includeHidden = parseIncludeFlag(searchParams.get("include_hidden"));
    const includePrivate = parseIncludeFlag(
      searchParams.get("include_private")
    );

    const db = getDb();

    // Distinguish 404 (not found / filtered) from 400 (not a project).
    const item = contentItems.findById(db, id, {
      includeHidden,
      includePrivate,
    });
    if (!item) {
      return errorResponse("NOT_FOUND", "Item not found", 404);
    }
    if (item.type !== "project") {
      return errorResponse(
        "BAD_REQUEST",
        "Related items are only available for projects",
        400
      );
    }

    const result = contentItems.findRelatedForProject(db, id, {
      includeHidden,
      includePrivate,
    });
    // The helper re-checks visibility, so in theory this branch is
    // unreachable after the guard above, but belt-and-braces.
    if (!result) {
      return errorResponse("NOT_FOUND", "Item not found", 404);
    }
    return Response.json(result);
  } catch (error) {
    logServerError(error, {
      route: "/api/items/[id]/related",
      method: "GET",
    });
    return errorResponse("INTERNAL_ERROR", "Something went wrong", 500);
  }
}
