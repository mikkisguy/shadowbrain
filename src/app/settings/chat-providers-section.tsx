"use client";

import { useEffect, useState } from "react";

import { fetchProviderModels, testConnection } from "./api";
import { isProviderSectionDirty } from "./dirty";
import { ProviderSubsection } from "./provider-subsection";

import type { SettingsDraft, SettingsSnapshot } from "./types";

export function ChatProvidersSection({
  saved,
  draft,
  clearedSecrets,
  onChange,
  onClearHermesSecret,
  onClearOpenCodeSecret,
  savedVersion,
}: {
  saved: SettingsSnapshot;
  draft: SettingsDraft;
  clearedSecrets: Set<keyof SettingsDraft>;
  onChange: (patch: Partial<SettingsDraft>) => void;
  onClearHermesSecret: () => void;
  onClearOpenCodeSecret: () => void;
  savedVersion: number;
}) {
  const [hermesTestResult, setHermesTestResult] = useState<string | null>(null);
  const [openCodeTestResult, setOpenCodeTestResult] = useState<string | null>(
    null
  );
  const [hermesTesting, setHermesTesting] = useState(false);
  const [openCodeTesting, setOpenCodeTesting] = useState(false);
  const [openCodeModels, setOpenCodeModels] = useState<
    { id: string; name: string }[]
  >([]);
  const [openCodeModelsLoading, setOpenCodeModelsLoading] = useState(false);

  const hermesDirty = isProviderSectionDirty(
    saved,
    draft,
    clearedSecrets,
    "hermes"
  );
  const openCodeDirty = isProviderSectionDirty(
    saved,
    draft,
    clearedSecrets,
    "opencode-go"
  );

  async function loadOpenCodeModels() {
    setOpenCodeModelsLoading(true);
    try {
      const models = await fetchProviderModels("opencode-go");
      setOpenCodeModels(models);
    } catch {
      setOpenCodeModels([]);
    } finally {
      setOpenCodeModelsLoading(false);
    }
  }

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    void loadOpenCodeModels();
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  async function runTest(provider: "hermes" | "opencode-go") {
    if (provider === "hermes") {
      setHermesTesting(true);
      setHermesTestResult(null);
      try {
        const result = await testConnection("hermes");
        setHermesTestResult(result.message);
      } catch {
        setHermesTestResult("Connection test failed");
      } finally {
        setHermesTesting(false);
      }
      return;
    }

    setOpenCodeTesting(true);
    setOpenCodeTestResult(null);
    try {
      const result = await testConnection("opencode-go");
      setOpenCodeTestResult(result.message);
    } catch {
      setOpenCodeTestResult("Connection test failed");
    } finally {
      setOpenCodeTesting(false);
    }
  }

  return (
    <section
      className="border-border bg-surface-elevated/40 flex flex-col gap-5 rounded-sm border p-5"
      data-testid="chat-providers-section"
    >
      <header className="flex flex-col gap-1">
        <h2 className="text-foreground font-serif text-xl font-semibold">
          Chat providers
        </h2>
        <p className="text-muted-foreground font-sans text-sm">
          Powers the chat interface. Keys stay server-side only.
        </p>
      </header>

      <ProviderSubsection
        title="Hermes"
        description="Agent-backed chat. The underlying model is configured inside Hermes — there is no per-thread model picker here."
        baseUrlId="hermes-api-base"
        baseUrl={draft.hermes_api_base}
        onBaseUrlChange={(value) => onChange({ hermes_api_base: value })}
        secretId="hermes-api-key"
        secretLabel="API key"
        secretIsSet={
          saved.hermes_api_key_is_set && !clearedSecrets.has("hermes_api_key")
        }
        secretValue={draft.hermes_api_key}
        onSecretChange={(value) => onChange({ hermes_api_key: value })}
        onSecretClear={onClearHermesSecret}
        testDisabled={hermesDirty}
        testResult={hermesTestResult}
        testing={hermesTesting}
        onTest={() => void runTest("hermes")}
        savedVersion={savedVersion}
      />

      <ProviderSubsection
        title="OpenCode Go"
        description="Default model for new chat threads. Each thread can override it in the chat UI."
        baseUrlId="opencode-go-api-base"
        baseUrl={draft.opencode_go_api_base}
        onBaseUrlChange={(value) => onChange({ opencode_go_api_base: value })}
        secretId="opencode-go-api-key"
        secretLabel="API key"
        secretIsSet={
          saved.opencode_go_api_key_is_set &&
          !clearedSecrets.has("opencode_go_api_key")
        }
        secretValue={draft.opencode_go_api_key}
        onSecretChange={(value) => onChange({ opencode_go_api_key: value })}
        onSecretClear={onClearOpenCodeSecret}
        testDisabled={openCodeDirty}
        testResult={openCodeTestResult}
        testing={openCodeTesting}
        onTest={() => void runTest("opencode-go")}
        modelField={{
          id: "opencode-go-model",
          label: "Default model",
          value: draft.opencode_go_model,
          options: openCodeModels,
          loading: openCodeModelsLoading,
          onChange: (value) => onChange({ opencode_go_model: value }),
          onRefresh: () => void loadOpenCodeModels(),
        }}
        savedVersion={savedVersion}
      />
    </section>
  );
}
