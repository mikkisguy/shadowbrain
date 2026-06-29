import type Database from "better-sqlite3";
import { settings } from "@/db/index";
import { SETTINGS_KEY_DEFS, type SettingsKey, secretIsSetFlag } from "./keys";

export type PublicSettings = Record<string, string | boolean>;

/**
 * Serialize settings for the client. Secret values are never returned;
 * each secret key is replaced with a boolean `*_is_set` flag.
 */
export function toPublicSettings(db: Database.Database): PublicSettings {
  const result: PublicSettings = {};

  for (const [key, def] of Object.entries(SETTINGS_KEY_DEFS)) {
    const settingsKey = key as SettingsKey;
    const raw = settings.get(db, settingsKey);

    if (def.secret) {
      result[secretIsSetFlag(settingsKey)] =
        typeof raw === "string" && raw.trim() !== "";
      continue;
    }

    if (def.readOnly) {
      result[settingsKey] = raw ?? "";
      continue;
    }

    result[settingsKey] = raw ?? def.defaultValue ?? "";
  }

  return result;
}

export function getSettingValue(
  db: Database.Database,
  key: SettingsKey
): string | null {
  const def = SETTINGS_KEY_DEFS[key];
  const raw = settings.get(db, key);
  if (raw === null || raw === "") {
    return def.defaultValue ?? null;
  }
  return raw;
}
