import { getDb, apiTokens } from "@/db/index";
import { errorResponse, logServerError } from "@/lib/api";
import { requireAuthenticated } from "@/lib/auth/guard";
import { logAuthEvent } from "@/lib/auth/audit";

/**
 * DELETE /api/admin/api-tokens/[id]
 *
 * Revoke an API token by ID. Requires admin session.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuthenticated(request);
  if (!auth.ok) return auth.response;

  const { id } = await params;

  try {
    const db = getDb();
    apiTokens.revoke(db, id);

    logAuthEvent({
      action: "auth.token.revoked",
      username: auth.username,
      success: true,
      entityType: "api_token",
      entityId: id,
      metadata: { token_id: id },
    });

    return Response.json({ ok: true });
  } catch (error) {
    logServerError(error, {
      route: "/api/admin/api-tokens/[id]",
      method: "DELETE",
    });
    return errorResponse("INTERNAL_ERROR", "Something went wrong", 500);
  }
}
