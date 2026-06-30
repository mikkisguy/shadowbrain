"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BrowseModelsDialog } from "./browse-models-dialog";
import { fetchOpenRouterModels } from "./api";
import { SecretInput } from "./secret-input";
import type { ModelField, SettingsDraft, SettingsSnapshot } from "./types";

function ModelFieldRow({
  id,
  label,
  description,
  value,
  onChange,
  onBrowse,
}: {
  id: string;
  label: string;
  description?: string;
  value: string;
  onChange: (value: string) => void;
  onBrowse: () => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <label
        htmlFor={id}
        className="text-foreground font-sans text-sm font-medium"
      >
        {label}
      </label>
      {description ? (
        <p className="text-muted-foreground -mt-1 font-sans text-xs">
          {description}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <Input
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="provider/model"
          className="min-w-[16rem] flex-1"
          data-testid={id}
        />
        <Button type="button" variant="outline" size="sm" onClick={onBrowse}>
          Browse models
        </Button>
      </div>
    </div>
  );
}

export function AiFeaturesSection({
  draft,
  saved,
  clearedSecrets,
  onChange,
  onClearSecret,
  savedVersion,
}: {
  draft: SettingsDraft;
  saved: SettingsSnapshot;
  clearedSecrets: Set<keyof SettingsDraft>;
  onChange: (patch: Partial<SettingsDraft>) => void;
  onClearSecret: () => void;
  savedVersion: number;
}) {
  const [browseOpen, setBrowseOpen] = useState(false);
  const [browseTarget, setBrowseTarget] = useState<ModelField>("ai_model");
  const [models, setModels] = useState<
    Awaited<ReturnType<typeof fetchOpenRouterModels>>
  >([]);
  const [modelsLoading, setModelsLoading] = useState(false);

  async function openBrowse(target: ModelField) {
    setBrowseTarget(target);
    setBrowseOpen(true);
    setModelsLoading(true);
    try {
      const rows = await fetchOpenRouterModels();
      setModels(rows);
    } catch {
      setModels([]);
    } finally {
      setModelsLoading(false);
    }
  }

  return (
    <section
      className="border-border bg-surface-elevated/40 flex flex-col gap-5 rounded-sm border p-5"
      data-testid="ai-features-section"
    >
      <header className="flex flex-col gap-1">
        <h2 className="text-foreground font-serif text-xl font-semibold">
          AI Features
        </h2>
        <p className="text-muted-foreground font-sans text-sm">
          Powers the AI Processor (nightly compilation, auto-tagging,
          auto-titling, auto-link suggestions).
        </p>
      </header>

      <SecretInput
        key={savedVersion}
        id="openrouter-api-key"
        label="OpenRouter API key"
        isSet={
          saved.openrouter_api_key_is_set &&
          !clearedSecrets.has("openrouter_api_key")
        }
        value={draft.openrouter_api_key}
        onChange={(value) => onChange({ openrouter_api_key: value })}
        onClear={onClearSecret}
        data-testid="openrouter-api-key"
      />

      <ModelFieldRow
        id="ai-model"
        label="Default model"
        description="Fallback when a per-job override is empty."
        value={draft.ai_model}
        onChange={(value) => onChange({ ai_model: value })}
        onBrowse={() => openBrowse("ai_model")}
      />

      <ModelFieldRow
        id="ai-model-journal"
        label="Journal compilation model"
        value={draft.ai_model_journal}
        onChange={(value) => onChange({ ai_model_journal: value })}
        onBrowse={() => openBrowse("ai_model_journal")}
      />

      <ModelFieldRow
        id="ai-model-tagging"
        label="Auto-tagging model"
        value={draft.ai_model_tagging}
        onChange={(value) => onChange({ ai_model_tagging: value })}
        onBrowse={() => openBrowse("ai_model_tagging")}
      />

      <ModelFieldRow
        id="ai-model-titling"
        label="Auto-titling model"
        value={draft.ai_model_titling}
        onChange={(value) => onChange({ ai_model_titling: value })}
        onBrowse={() => openBrowse("ai_model_titling")}
      />

      <ModelFieldRow
        id="ai-model-linking"
        label="Auto-link suggestions model"
        value={draft.ai_model_linking}
        onChange={(value) => onChange({ ai_model_linking: value })}
        onBrowse={() => openBrowse("ai_model_linking")}
      />

      <div className="flex flex-col gap-2">
        <label
          htmlFor="embedding-model"
          className="text-foreground font-sans text-sm font-medium"
        >
          Embedding model
        </label>
        <p className="text-muted-foreground -mt-1 font-sans text-xs">
          Local sentence-transformers model (not OpenRouter).
        </p>
        <Input
          id="embedding-model"
          value={draft.embedding_model}
          onChange={(event) =>
            onChange({ embedding_model: event.target.value })
          }
          data-testid="embedding-model"
        />
      </div>

      <BrowseModelsDialog
        open={browseOpen}
        onOpenChange={setBrowseOpen}
        models={models}
        loading={modelsLoading}
        onSelect={(modelId) => onChange({ [browseTarget]: modelId })}
      />
    </section>
  );
}
