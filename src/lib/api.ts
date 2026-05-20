import { z } from "zod";
import { log } from "./logger";

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 20;

export function parsePagination(params: { page?: string; limit?: string }) {
  const page = Math.max(1, Number(params.page ?? 1) || 1);
  const rawLimit = Number(params.limit ?? DEFAULT_LIMIT) || DEFAULT_LIMIT;
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

export function logServerError(error: unknown, context: Record<string, unknown>) {
  const err = error instanceof Error ? { message: error.message, stack: error.stack } : { message: String(error) };
  log("error", "Unhandled server error", { ...context, error: err });
}
