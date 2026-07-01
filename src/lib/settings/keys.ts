import { z } from "zod";

const nonEmptyString = z.string().trim().min(1);
const optionalModelString = z.string().trim();

const urlString = z
  .string()
  .trim()
  .min(1)
  .refine((value) => {
    try {
      const parsed = new URL(value);
      return parsed.protocol === "http:" || parsed.protocol === "https:";
    } catch {
      return false;
    }
  }, "Must be a valid http(s) URL");

export type SettingsKeyDef = {
  secret: boolean;
  schema: z.ZodType<string>;
  defaultValue?: string;
  readOnly?: boolean;
};

export const SETTINGS_KEY_DEFS: Record<string, SettingsKeyDef> = {
  openrouter_api_key: {
    secret: true,
    schema: nonEmptyString,
  },
  ai_model: {
    secret: false,
    schema: nonEmptyString,
    defaultValue: "mistralai/mistral-7b-instruct",
  },
  ai_model_journal: {
    secret: false,
    schema: optionalModelString,
    defaultValue: "",
  },
  ai_model_tagging: {
    secret: false,
    schema: optionalModelString,
    defaultValue: "",
  },
  ai_model_titling: {
    secret: false,
    schema: optionalModelString,
    defaultValue: "",
  },
  ai_model_linking: {
    secret: false,
    schema: optionalModelString,
    defaultValue: "",
  },
  embedding_model: {
    secret: false,
    schema: nonEmptyString,
    defaultValue: "all-MiniLM-L6-v2",
  },
  hermes_api_base: {
    secret: false,
    schema: urlString,
    defaultValue: "http://localhost:8642/v1",
  },
  hermes_api_key: {
    secret: true,
    schema: nonEmptyString,
  },
  opencode_go_api_base: {
    secret: false,
    schema: urlString,
    defaultValue: "https://opencode.ai/zen/go/v1",
  },
  opencode_go_api_key: {
    secret: true,
    schema: nonEmptyString,
  },
  opencode_go_model: {
    secret: false,
    schema: optionalModelString,
    defaultValue: "",
  },
  last_backup_at: {
    secret: false,
    schema: z.string(),
    readOnly: true,
  },
  // Consecutive snoozes at the 14+ day backup severity. Reset to 0 by the
  // "Mark as backed up" action. Read-only here so the generic settings PATCH
  // can't set it — only the dedicated /api/backup routes mutate it. Stored as
  // a string (the settings table is TEXT) and parsed to an int on read.
  backup_snooze_count: {
    secret: false,
    schema: z.string(),
    readOnly: true,
  },
};

export type SettingsKey = keyof typeof SETTINGS_KEY_DEFS;

const SETTINGS_KEYS = Object.keys(SETTINGS_KEY_DEFS) as SettingsKey[];

export const WRITABLE_SETTINGS_KEYS = SETTINGS_KEYS.filter(
  (key) => !SETTINGS_KEY_DEFS[key].readOnly
);

export function secretIsSetFlag(key: SettingsKey): string {
  return `${key}_is_set`;
}

export function isSettingsKey(key: string): key is SettingsKey {
  return key in SETTINGS_KEY_DEFS;
}
