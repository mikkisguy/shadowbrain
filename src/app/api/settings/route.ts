import { z } from "zod";
import { getDb, settings, auditLogs } from "@/db/index";
import { errorResponse, parseJson, logServerError } from "@/lib/api";
import { log } from "@/lib/logger";
import { requireAuthenticated } from "@/lib/auth/guard";
import {
  isSettingsKey,
  SETTINGS_KEY_DEFS,
  WRITABLE_SETTINGS_KEYS,
  type SettingsKey,
} from "@/lib/settings/keys";
import { toPublicSettings } from "@/lib/settings/public";

const secretPatchValue = z.union([z.string(), z.null()]);

const patchSchema = z
  .object({
    openrouter_api_key: secretPatchValue.optional(),
    ai_model: z.string().optional(),
    ai_model_journal: z.string().optional(),
    ai_model_tagging: z.string().optional(),
    ai_model_titling: z.string().optional(),
    ai_model_linking: z.string().optional(),
    embedding_model: z.string().optional(),
    hermes_api_base: z.string().optional(),
    hermes_api_key: secretPatchValue.optional(),
    opencode_go_api_base: z.string().optional(),
    opencode_go_api_key: secretPatchValue.optional(),
    opencode_go_model: z.string().optional(),
  })
  .strict();

export async function GET(request: Request) {
  const auth = await requireAuthenticated(request);
  if (!auth.ok) return auth.response;

  try {
    const db = getDb();
    const publicSettings = toPublicSettings(db);

    log("info", "settings read", { event: "settings.read" });
    return Response.json(publicSettings);
  } catch (error) {
    logServerError(error, { route: "/api/settings", method: "GET" });
    return errorResponse("INTERNAL_ERROR", "Something went wrong", 500);
  }
}

export async function PATCH(request: Request) {
  const auth = await requireAuthenticated(request);
  if (!auth.ok) return auth.response;

  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return errorResponse("VALIDATION_ERROR", "Invalid JSON", 400);
    }

    const parsed = parseJson(patchSchema, body);
    if (!parsed.success) {
      return errorResponse("VALIDATION_ERROR", "Invalid input", 400, {
        issues: parsed.details,
      });
    }

    const entries = Object.entries(parsed.data);
    if (entries.length === 0) {
      return errorResponse("VALIDATION_ERROR", "No settings to update", 400);
    }

    for (const [key] of entries) {
      if (!isSettingsKey(key)) {
        return errorResponse("VALIDATION_ERROR", "Invalid input", 400, {
          issues: [{ path: key, message: "Unknown setting key" }],
        });
      }
      if (SETTINGS_KEY_DEFS[key].readOnly) {
        return errorResponse("VALIDATION_ERROR", "Invalid input", 400, {
          issues: [{ path: key, message: "Setting is read-only" }],
        });
      }
    }

    const db = getDb();
    const pendingUpdates: Array<
      | { key: SettingsKey; action: "set"; value: string }
      | { key: SettingsKey; action: "delete" }
    > = [];
    const validationIssues: Array<{ path: string; message: string }> = [];

    for (const [key, rawValue] of entries) {
      const settingsKey = key as SettingsKey;
      const def = SETTINGS_KEY_DEFS[settingsKey];

      if (def.secret) {
        if (rawValue === undefined) continue;
        if (rawValue === null) {
          pendingUpdates.push({ key: settingsKey, action: "delete" });
          continue;
        }
        if (rawValue === "") continue;
        const secretParsed = def.schema.safeParse(rawValue);
        if (!secretParsed.success) {
          validationIssues.push({
            path: settingsKey,
            message: secretParsed.error.issues[0]?.message ?? "Invalid value",
          });
          continue;
        }
        pendingUpdates.push({
          key: settingsKey,
          action: "set",
          value: secretParsed.data,
        });
        continue;
      }

      if (typeof rawValue !== "string") {
        validationIssues.push({
          path: settingsKey,
          message: "Expected a string value",
        });
        continue;
      }

      const valueParsed = def.schema.safeParse(rawValue);
      if (!valueParsed.success) {
        validationIssues.push({
          path: settingsKey,
          message: valueParsed.error.issues[0]?.message ?? "Invalid value",
        });
        continue;
      }

      pendingUpdates.push({
        key: settingsKey,
        action: "set",
        value: valueParsed.data,
      });
    }

    if (validationIssues.length > 0) {
      return errorResponse("VALIDATION_ERROR", "Invalid input", 400, {
        issues: validationIssues,
      });
    }

    if (pendingUpdates.length === 0) {
      return Response.json(toPublicSettings(db));
    }

    const updatedKeys = pendingUpdates.map((update) => update.key);
    const now = new Date().toISOString();
    const auditLogId = crypto.randomUUID();
    const tx = db.transaction(() => {
      for (const update of pendingUpdates) {
        if (update.action === "delete") {
          settings.delete(db, update.key);
        } else {
          settings.set(db, update.key, update.value);
        }
      }
      auditLogs.create(db, {
        id: auditLogId,
        actor_type: "system",
        action: "settings.update",
        entity_type: "settings",
        entity_id: null,
        success: 1,
        metadata: JSON.stringify({ keys: updatedKeys }),
        created_at: now,
      });
    });
    tx();

    log("info", "settings updated", {
      event: "settings.update",
      keys: updatedKeys,
    });

    return Response.json(toPublicSettings(db));
  } catch (error) {
    logServerError(error, { route: "/api/settings", method: "PATCH" });
    return errorResponse("INTERNAL_ERROR", "Something went wrong", 500);
  }
}

// Re-export for tests / route consumers that need the allowlist.
export { WRITABLE_SETTINGS_KEYS };
