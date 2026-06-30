import type { PublicSettings } from "@/lib/settings/public";

// The writable settings shape is mirrored in three places that must stay in
// sync when a setting is added or removed:
//   1. `SettingsDraft` below (the client draft shape),
//   2. `DRAFT_KEYS` / `SECRET_KEYS` in `./dirty.ts` (dirty-tracking + patch),
//   3. `patchSchema` in `src/app/api/settings/route.ts` (server validation).
export type SettingsDraft = {
  openrouter_api_key: string;
  ai_model: string;
  ai_model_journal: string;
  ai_model_tagging: string;
  ai_model_titling: string;
  ai_model_linking: string;
  embedding_model: string;
  hermes_api_base: string;
  hermes_api_key: string;
  opencode_go_api_base: string;
  opencode_go_api_key: string;
  opencode_go_model: string;
};

export type SettingsSnapshot = SettingsDraft & {
  openrouter_api_key_is_set: boolean;
  hermes_api_key_is_set: boolean;
  opencode_go_api_key_is_set: boolean;
  last_backup_at: string;
};

export type OpenRouterModelSummary = {
  id: string;
  name: string;
  pricing: { prompt: string; completion: string };
  context_length: number;
};

export type ProviderModelOption = {
  id: string;
  name: string;
};

export type SystemInfo = {
  totalItems: number;
  databaseSizeBytes: number;
  databaseSize: string;
  lastBackupAt: string | null;
};

export type TestConnectionResult = {
  ok: boolean;
  message: string;
  modelCount?: number;
};

export type SecretField =
  | "openrouter_api_key"
  | "hermes_api_key"
  | "opencode_go_api_key";

export type ModelField =
  | "ai_model"
  | "ai_model_journal"
  | "ai_model_tagging"
  | "ai_model_titling"
  | "ai_model_linking";

export function snapshotToDraft(snapshot: SettingsSnapshot): SettingsDraft {
  return {
    openrouter_api_key: "",
    ai_model: snapshot.ai_model,
    ai_model_journal: snapshot.ai_model_journal,
    ai_model_tagging: snapshot.ai_model_tagging,
    ai_model_titling: snapshot.ai_model_titling,
    ai_model_linking: snapshot.ai_model_linking,
    embedding_model: snapshot.embedding_model,
    hermes_api_base: snapshot.hermes_api_base,
    hermes_api_key: "",
    opencode_go_api_base: snapshot.opencode_go_api_base,
    opencode_go_api_key: "",
    opencode_go_model: snapshot.opencode_go_model,
  };
}

export function publicSettingsToSnapshot(
  data: PublicSettings
): SettingsSnapshot {
  return {
    openrouter_api_key: "",
    openrouter_api_key_is_set: Boolean(data.openrouter_api_key_is_set),
    ai_model: String(data.ai_model ?? ""),
    ai_model_journal: String(data.ai_model_journal ?? ""),
    ai_model_tagging: String(data.ai_model_tagging ?? ""),
    ai_model_titling: String(data.ai_model_titling ?? ""),
    ai_model_linking: String(data.ai_model_linking ?? ""),
    embedding_model: String(data.embedding_model ?? ""),
    hermes_api_base: String(data.hermes_api_base ?? ""),
    hermes_api_key: "",
    hermes_api_key_is_set: Boolean(data.hermes_api_key_is_set),
    opencode_go_api_base: String(data.opencode_go_api_base ?? ""),
    opencode_go_api_key: "",
    opencode_go_api_key_is_set: Boolean(data.opencode_go_api_key_is_set),
    opencode_go_model: String(data.opencode_go_model ?? ""),
    last_backup_at: String(data.last_backup_at ?? ""),
  };
}
