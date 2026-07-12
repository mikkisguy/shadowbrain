import { z } from "zod";
import { getDb, apiTokens } from "@/db/index";
import { errorResponse, parseJson, logServerError } from "@/lib/api";
import { requireAuthenticated } from "@/lib/auth/guard";
import { generateToken } from "@/lib/auth/api-token";
import { logAuthEvent } from "@/lib/auth/audit";

const createSchema = z.object({
  name: z.string().min(1).max(200),
});

/**
 * GET /api/admin/api-tokens
 *
 * List all API tokens (without secrets). Requires admin session.
 */
export async function GET(request: Request) {
  const auth = await requireAuthenticated(request);
  if (!auth.ok) return auth.response;

  try {
    const db = getDb();
    const rows = apiTokens.listAll(db);

    // Never expose token_hash or token_prefix to the client.
    const safe = rows.map((r) => ({
      id: r.id,
      name: r.name,
      created_at: r.created_at,
      last_used_at: r.last_used_at,
      last_used_ip: r.last_used_ip,
      is_revoked: r.is_revoked,
    }));

    return Response.json(safe);
  } catch (error) {
    logServerError(error, {
      route: "/api/admin/api-tokens",
      method: "GET",
    });
    return errorResponse("INTERNAL_ERROR", "Something went wrong", 500);
  }
}

/**
 * POST /api/admin/api-tokens
 *
 * Create a new API token. The raw token is returned only once.
 * Requires admin session.
 */
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

    const parsed = parseJson(createSchema, body);
    if (!parsed.success) {
      return errorResponse("VALIDATION_ERROR", "Invalid input", 400, {
        issues: parsed.details,
      });
    }

    const { raw, prefix, hash } = generateToken();
    const id = crypto.randomUUID();
    const created_at = new Date().toISOString();

    const db = getDb();
    apiTokens.create(db, {
      id,
      name: parsed.data.name,
      token_prefix: prefix,
      token_hash: hash,
      created_at,
    });

    logAuthEvent({
      action: "auth.token.created",
      username: auth.username,
      success: true,
      entityType: "api_token",
      entityId: id,
      metadata: { token_id: id, token_name: parsed.data.name },
    });

    return Response.json(
      {
        id,
        name: parsed.data.name,
        token: raw,
        created_at,
      },
      { status: 201 }
    );
  } catch (error) {
    logServerError(error, {
      route: "/api/admin/api-tokens",
      method: "POST",
    });
    return errorResponse("INTERNAL_ERROR", "Something went wrong", 500);
  }
}
