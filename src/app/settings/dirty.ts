import type { SettingsDraft, SettingsSnapshot } from "./types";

// Keep in sync with `SettingsDraft` in `./types.ts` and `patchSchema` in
// `src/app/api/settings/route.ts` when adding or removing a setting.
const DRAFT_KEYS: Array<keyof SettingsDraft> = [
  "openrouter_api_key",
  "ai_model",
  "ai_model_tagging",
  "ai_model_titling",
  "ai_model_linking",
  "embedding_model",
  "hermes_api_base",
  "hermes_api_key",
  "opencode_go_api_base",
  "opencode_go_api_key",
  "opencode_go_model",
];

const SECRET_KEYS = new Set<keyof SettingsDraft>([
  "openrouter_api_key",
  "hermes_api_key",
  "opencode_go_api_key",
]);

function secretIsSetKey(
  key: "openrouter_api_key" | "hermes_api_key" | "opencode_go_api_key"
):
  | "openrouter_api_key_is_set"
  | "hermes_api_key_is_set"
  | "opencode_go_api_key_is_set" {
  return `${key}_is_set`;
}

export function isSettingsDirty(
  saved: SettingsSnapshot,
  draft: SettingsDraft,
  clearedSecrets: Set<keyof SettingsDraft>
): boolean {
  for (const key of DRAFT_KEYS) {
    if (SECRET_KEYS.has(key)) {
      const secretKey = key as
        "openrouter_api_key" | "hermes_api_key" | "opencode_go_api_key";
      if (clearedSecrets.has(secretKey) && saved[secretIsSetKey(secretKey)]) {
        return true;
      }
      if (draft[secretKey].trim() !== "") return true;
      continue;
    }

    if (draft[key] !== saved[key]) return true;
  }

  return false;
}

export function buildSettingsPatch(
  saved: SettingsSnapshot,
  draft: SettingsDraft,
  clearedSecrets: Set<keyof SettingsDraft>
): Partial<SettingsDraft> & {
  openrouter_api_key?: string | null;
  hermes_api_key?: string | null;
  opencode_go_api_key?: string | null;
} {
  const patch: Partial<SettingsDraft> & {
    openrouter_api_key?: string | null;
    hermes_api_key?: string | null;
    opencode_go_api_key?: string | null;
  } = {};

  for (const key of DRAFT_KEYS) {
    if (SECRET_KEYS.has(key)) {
      const secretKey = key as
        "openrouter_api_key" | "hermes_api_key" | "opencode_go_api_key";
      if (clearedSecrets.has(secretKey)) {
        (patch as Record<string, string | null>)[secretKey] = null;
        continue;
      }
      const draftValue = draft[secretKey].trim();
      if (draftValue !== "") {
        patch[secretKey] = draftValue;
      }
      continue;
    }

    if (draft[key] !== saved[key]) {
      patch[key] = draft[key];
    }
  }

  return patch;
}

export function isProviderSectionDirty(
  saved: SettingsSnapshot,
  draft: SettingsDraft,
  clearedSecrets: Set<keyof SettingsDraft>,
  provider: "hermes" | "opencode-go"
): boolean {
  if (provider === "hermes") {
    return (
      draft.hermes_api_base !== saved.hermes_api_base ||
      draft.hermes_api_key.trim() !== "" ||
      clearedSecrets.has("hermes_api_key")
    );
  }

  return (
    draft.opencode_go_api_base !== saved.opencode_go_api_base ||
    draft.opencode_go_api_key.trim() !== "" ||
    clearedSecrets.has("opencode_go_api_key") ||
    draft.opencode_go_model !== saved.opencode_go_model
  );
}
