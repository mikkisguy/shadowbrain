"use client";

import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { AiFeaturesSection } from "./ai-features-section";
import { saveSettings } from "./api";
import { ChatProvidersSection } from "./chat-providers-section";
import { buildSettingsPatch, isSettingsDirty } from "./dirty";
import { ExportSection } from "./export-section";
import { SaveBar } from "./save-bar";
import { SystemInfoSection } from "./system-info-section";
import { useSettings } from "./use-settings";

export function SettingsPage() {
  const {
    saved,
    draft,
    status,
    error,
    clearedSecrets,
    setDraft,
    clearSecret,
    applySaved,
    refresh,
  } = useSettings();

  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const dirty = useMemo(() => {
    if (!saved || !draft) return false;
    return isSettingsDirty(saved, draft, clearedSecrets);
  }, [saved, draft, clearedSecrets]);

  // Auto-dismiss the "Settings saved." confirmation so it doesn't linger.
  useEffect(() => {
    if (!saveMessage) return;
    const timer = setTimeout(() => setSaveMessage(null), 4000);
    return () => clearTimeout(timer);
  }, [saveMessage]);

  async function handleSave() {
    if (!saved || !draft) return;
    setSaving(true);
    setSaveError(null);
    setSaveMessage(null);
    try {
      const patch = buildSettingsPatch(saved, draft, clearedSecrets);
      const snapshot = await saveSettings(patch);
      applySaved(snapshot);
      setSaveMessage("Settings saved.");
    } catch {
      setSaveError("Couldn't save your settings. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  function handleDiscard() {
    if (!saved) return;
    applySaved(saved);
    setSaveError(null);
    setSaveMessage(null);
  }

  return (
    <main
      id="main-content"
      data-testid="settings-page"
      className="mx-auto flex w-full max-w-screen-md flex-col gap-8 px-4 py-8 sm:px-6 sm:py-12"
    >
      <header className="flex flex-col gap-3 pb-2">
        <p className="text-muted-foreground font-mono text-[0.7rem] font-medium tracking-[0.16em] uppercase">
          Configuration
        </p>
        <h1 className="text-foreground font-serif text-3xl font-semibold tracking-[-0.01em] sm:text-4xl">
          Settings
        </h1>
      </header>

      {status === "error" ? (
        <div
          data-testid="settings-error"
          className="border-border bg-surface-elevated flex flex-col items-start gap-3 rounded-sm border p-6"
        >
          <p className="text-error font-sans text-sm font-medium">
            {error ?? "Couldn't load your settings right now."}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={refresh}
            data-testid="settings-retry"
          >
            Try again
          </Button>
        </div>
      ) : null}

      {status === "loading" || !draft || !saved ? (
        <div
          data-testid="settings-loading"
          role="status"
          aria-label="Loading settings"
          className="border-border bg-surface-elevated/40 flex flex-col gap-4 rounded-sm border p-6"
        >
          <div className="bg-surface-muted h-4 w-48 rounded-sm" />
          <div className="bg-surface-muted h-8 w-full rounded-sm" />
          <div className="bg-surface-muted h-8 w-full rounded-sm" />
        </div>
      ) : (
        <>
          {saveMessage ? (
            <p
              className="text-foreground border-border bg-surface-elevated rounded-sm border px-3 py-2 font-sans text-sm"
              data-testid="settings-save-success"
            >
              {saveMessage}
            </p>
          ) : null}
          {saveError ? (
            <p
              className="text-error border-border bg-surface-elevated rounded-sm border px-3 py-2 font-sans text-sm"
              data-testid="settings-save-error"
            >
              {saveError}
            </p>
          ) : null}

          <AiFeaturesSection
            draft={draft}
            saved={saved}
            clearedSecrets={clearedSecrets}
            onChange={(patch) =>
              setDraft((prev) => (prev ? { ...prev, ...patch } : prev))
            }
            onClearSecret={() => clearSecret("openrouter_api_key")}
          />

          <ChatProvidersSection
            saved={saved}
            draft={draft}
            clearedSecrets={clearedSecrets}
            onChange={(patch) =>
              setDraft((prev) => (prev ? { ...prev, ...patch } : prev))
            }
            onClearHermesSecret={() => clearSecret("hermes_api_key")}
            onClearOpenCodeSecret={() => clearSecret("opencode_go_api_key")}
          />

          <ExportSection />
          <SystemInfoSection />
        </>
      )}

      <SaveBar
        visible={dirty}
        saving={saving}
        onSave={() => void handleSave()}
        onDiscard={handleDiscard}
      />
    </main>
  );
}
