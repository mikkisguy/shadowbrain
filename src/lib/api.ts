import { z } from "zod";
import { log } from "./logger";

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 20;

export function parsePagination(params: { page?: string; limit?: string }) {
  const parsedPage = Number.parseInt(params.page ?? "1", 10);
  const parsedLimit = Number.parseInt(
    params.limit ?? DEFAULT_LIMIT.toString(),
    10
  );
  const page = Math.max(1, Number.isNaN(parsedPage) ? 1 : parsedPage);
  const rawLimit = Number.isNaN(parsedLimit) ? DEFAULT_LIMIT : parsedLimit;
  const limit = Math.min(MAX_LIMIT, Math.max(1, rawLimit));
  const offset = (page - 1) * limit;
  return { page, limit, offset };
}

export function errorResponse(
  code: string,
  message: string,
  status: number,
  details?: Record<string, unknown>
) {
  return Response.json({ error: { code, message, details } }, { status });
}

export function parseJson<T>(schema: z.ZodSchema<T>, body: unknown) {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const details = parsed.error.issues.map((i) => ({
      path: i.path.join("."),
      message: i.message,
    }));
    return { success: false as const, details };
  }
  return { success: true as const, data: parsed.data };
}

export function logServerError(
  error: unknown,
  context: Record<string, unknown>
) {
  const err =
    error instanceof Error
      ? { message: error.message, stack: error.stack }
      : { message: String(error) };
  log("error", "Unhandled server error", { ...context, error: err });
}

/**
 * Parse one of the two-level visibility opt-in query parameters
 * (`include_hidden` / `include_private`). The route spec (App
 * Security Baseline §2) uses the literal string `"1"` to opt in;
 * anything else — including the param being absent, empty, `"0"`,
 * `"true"` — is treated as `false`.
 *
 * The auth gate is upstream of this helper: every route must call
 * `requireAuthenticated(request)` and short-circuit with 401 before
 * the opt-in is ever parsed. The unauthenticated request therefore
 * never reaches this function, so the parsed flag can never leak
 * rows to an anonymous caller even if they pass `?include_private=1`.
 */
export function parseIncludeFlag(value: string | null | undefined): boolean {
  return value === "1";
}
