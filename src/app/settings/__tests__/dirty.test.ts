import { describe, it, expect } from "vitest";
import {
  buildSettingsPatch,
  isProviderSectionDirty,
  isSettingsDirty,
} from "@/app/settings/dirty";
import type { SettingsDraft, SettingsSnapshot } from "@/app/settings/types";

function makeSnapshot(
  overrides: Partial<SettingsSnapshot> = {}
): SettingsSnapshot {
  return {
    openrouter_api_key: "",
    openrouter_api_key_is_set: false,
    ai_model: "mistralai/mistral-7b-instruct",
    ai_model_tagging: "",
    ai_model_titling: "",
    ai_model_linking: "",
    embedding_model: "all-MiniLM-L6-v2",
    hermes_api_base: "http://localhost:8642/v1",
    hermes_api_key: "",
    hermes_api_key_is_set: false,
    opencode_go_api_base: "https://opencode.ai/zen/go/v1",
    opencode_go_api_key: "",
    opencode_go_api_key_is_set: false,
    opencode_go_model: "glm-5.2",
    last_backup_at: "",
    ...overrides,
  };
}

function makeDraft(overrides: Partial<SettingsDraft> = {}): SettingsDraft {
  return {
    openrouter_api_key: "",
    ai_model: "mistralai/mistral-7b-instruct",
    ai_model_tagging: "",
    ai_model_titling: "",
    ai_model_linking: "",
    embedding_model: "all-MiniLM-L6-v2",
    hermes_api_base: "http://localhost:8642/v1",
    hermes_api_key: "",
    opencode_go_api_base: "https://opencode.ai/zen/go/v1",
    opencode_go_api_key: "",
    opencode_go_model: "glm-5.2",
    ...overrides,
  };
}

describe("settings dirty helpers", () => {
  it("detects non-secret field changes", () => {
    const saved = makeSnapshot();
    const draft = makeDraft({ ai_model: "openai/gpt-4" });
    expect(isSettingsDirty(saved, draft, new Set())).toBe(true);
  });

  it("detects new secret values", () => {
    const saved = makeSnapshot();
    const draft = makeDraft({ openrouter_api_key: "sk-test" });
    expect(isSettingsDirty(saved, draft, new Set())).toBe(true);
  });

  it("detects cleared secrets", () => {
    const saved = makeSnapshot({ openrouter_api_key_is_set: true });
    const draft = makeDraft();
    const cleared = new Set<keyof SettingsDraft>(["openrouter_api_key"]);
    expect(isSettingsDirty(saved, draft, cleared)).toBe(true);
  });

  it("builds a patch with only changed keys", () => {
    const saved = makeSnapshot();
    const draft = makeDraft({
      ai_model: "openai/gpt-4",
      openrouter_api_key: "sk-new",
    });
    const patch = buildSettingsPatch(saved, draft, new Set());
    expect(patch).toEqual({
      ai_model: "openai/gpt-4",
      openrouter_api_key: "sk-new",
    });
  });

  it("marks provider sections dirty when unsaved", () => {
    const saved = makeSnapshot();
    const draft = makeDraft({ hermes_api_base: "http://localhost:9000/v1" });
    expect(isProviderSectionDirty(saved, draft, new Set(), "hermes")).toBe(
      true
    );
    expect(isProviderSectionDirty(saved, draft, new Set(), "opencode-go")).toBe(
      false
    );
  });
});
