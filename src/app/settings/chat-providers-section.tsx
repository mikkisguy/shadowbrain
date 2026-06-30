"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { fetchProviderModels, testConnection } from "./api";
import { isProviderSectionDirty } from "./dirty";
import { SecretInput } from "./secret-input";
import type {
  ProviderModelOption,
  SettingsDraft,
  SettingsSnapshot,
} from "./types";

function ProviderSubsection({
  title,
  description,
  baseUrlId,
  baseUrl,
  onBaseUrlChange,
  secretId,
  secretLabel,
  secretIsSet,
  secretValue,
  onSecretChange,
  onSecretClear,
  testDisabled,
  testResult,
  testing,
  onTest,
  modelField,
  savedVersion,
}: {
  title: string;
  description: string;
  baseUrlId: string;
  baseUrl: string;
  onBaseUrlChange: (value: string) => void;
  secretId: string;
  secretLabel: string;
  secretIsSet: boolean;
  secretValue: string;
  onSecretChange: (value: string) => void;
  onSecretClear: () => void;
  testDisabled: boolean;
  testResult: string | null;
  testing: boolean;
  onTest: () => void;
  modelField?: {
    id: string;
    label: string;
    value: string;
    options: ProviderModelOption[];
    loading: boolean;
    onChange: (value: string) => void;
    onRefresh: () => void;
  };
  savedVersion: number;
}) {
  const modelItems = Object.fromEntries(
    modelField?.options.map((option) => [option.id, option.name]) ?? []
  );

  return (
    <div className="border-border flex flex-col gap-4 rounded-sm border p-4">
      <header className="flex flex-col gap-1">
        <h3 className="text-foreground font-sans text-base font-semibold">
          {title}
        </h3>
        <p className="text-muted-foreground font-sans text-sm">{description}</p>
      </header>

      <div className="flex flex-col gap-2">
        <label
          htmlFor={baseUrlId}
          className="text-foreground font-sans text-sm font-medium"
        >
          Base URL
        </label>
        <Input
          id={baseUrlId}
          value={baseUrl}
          onChange={(event) => onBaseUrlChange(event.target.value)}
          data-testid={baseUrlId}
        />
      </div>

      <SecretInput
        key={savedVersion}
        id={secretId}
        label={secretLabel}
        isSet={secretIsSet}
        value={secretValue}
        onChange={onSecretChange}
        onClear={onSecretClear}
        data-testid={secretId}
      />

      {modelField ? (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label
              htmlFor={modelField.id}
              className="text-foreground font-sans text-sm font-medium"
            >
              {modelField.label}
            </label>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={modelField.onRefresh}
              disabled={modelField.loading}
            >
              {modelField.loading ? "Loading…" : "Refresh models"}
            </Button>
          </div>
          <Select
            value={modelField.value || null}
            onValueChange={(value) => {
              if (value) modelField.onChange(value);
            }}
            items={modelItems}
          >
            <SelectTrigger id={modelField.id} data-testid={modelField.id}>
              <SelectValue placeholder="Select a model" />
            </SelectTrigger>
            <SelectContent>
              {modelField.options.map((option) => (
                <SelectItem key={option.id} value={option.id}>
                  {option.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onTest}
          disabled={testDisabled || testing}
          title={testDisabled ? "Save to test" : undefined}
          data-testid={`${baseUrlId}-test`}
        >
          {testing ? "Testing…" : "Test connection"}
        </Button>
        {testResult ? (
          <p className="text-muted-foreground font-sans text-sm">
            {testResult}
          </p>
        ) : null}
      </div>
    </div>
  );
}

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
  const [openCodeModels, setOpenCodeModels] = useState<ProviderModelOption[]>(
    []
  );
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
