"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { CelestialHeader } from "@/components/visual/celestial-motif";
import { AiFeaturesSection } from "./ai-features-section";
import { saveSettings } from "./api";
import { ChatProvidersSection } from "./chat-providers-section";
import { buildSettingsPatch, isSettingsDirty } from "./dirty";
import { ExportSection } from "./export-section";
import { SaveBar } from "./save-bar";
import { SystemInfoSection } from "./system-info-section";
import type { SettingsDraft, SettingsSnapshot } from "./types";
import { useSettings } from "./use-settings";

/* ------------------------------------------------------------------ */
/*  Section registry                                                   */
/*  Single source of truth for tab order + how each section renders.  */
/*  Only the active tab mounts, so each section's effects (model       */
/*  fetches, system-info load) run lazily on first visit.              */
/* ------------------------------------------------------------------ */

interface SectionRenderProps {
  draft: SettingsDraft;
  saved: SettingsSnapshot;
  clearedSecrets: Set<keyof SettingsDraft>;
  setDraft: React.Dispatch<React.SetStateAction<SettingsDraft | null>>;
  clearSecret: (key: keyof SettingsDraft) => void;
  savedVersion: number;
}

interface SectionDef {
  id: string;
  label: string;
  render: (props: SectionRenderProps) => React.ReactNode;
}

const SECTIONS: SectionDef[] = [
  {
    id: "ai-features",
    label: "AI Features",
    render: (p) => (
      <AiFeaturesSection
        draft={p.draft}
        saved={p.saved}
        clearedSecrets={p.clearedSecrets}
        onChange={(patch) =>
          p.setDraft((prev) => (prev ? { ...prev, ...patch } : prev))
        }
        onClearSecret={() => p.clearSecret("openrouter_api_key")}
        savedVersion={p.savedVersion}
      />
    ),
  },
  {
    id: "chat-providers",
    label: "Chat providers",
    render: (p) => (
      <ChatProvidersSection
        saved={p.saved}
        draft={p.draft}
        clearedSecrets={p.clearedSecrets}
        onChange={(patch) =>
          p.setDraft((prev) => (prev ? { ...prev, ...patch } : prev))
        }
        onClearHermesSecret={() => p.clearSecret("hermes_api_key")}
        onClearOpenCodeSecret={() => p.clearSecret("opencode_go_api_key")}
        savedVersion={p.savedVersion}
      />
    ),
  },
  {
    id: "data",
    label: "Data",
    render: () => (
      <div className="flex flex-col gap-8">
        <ExportSection />
        <SystemInfoSection />
      </div>
    ),
  },
];

/* ------------------------------------------------------------------ */
/*  Tab bar                                                            */
/* ------------------------------------------------------------------ */

function SettingsTabs({
  active,
  onChange,
}: {
  active: string;
  onChange: (id: string) => void;
}) {
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const idx = SECTIONS.findIndex((s) => s.id === active);
      if (event.key === "ArrowRight" || event.key === "ArrowDown") {
        event.preventDefault();
        const next = (idx + 1) % SECTIONS.length;
        onChange(SECTIONS[next].id);
        tabRefs.current[next]?.focus();
      } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
        event.preventDefault();
        const prev = (idx - 1 + SECTIONS.length) % SECTIONS.length;
        onChange(SECTIONS[prev].id);
        tabRefs.current[prev]?.focus();
      }
    },
    [active, onChange]
  );

  return (
    <div
      role="tablist"
      aria-label="Settings sections"
      onKeyDown={handleKeyDown}
      className="border-border flex gap-1 overflow-x-auto border-b"
    >
      {SECTIONS.map((section, i) => {
        const isActive = section.id === active;
        return (
          <button
            key={section.id}
            ref={(el) => {
              tabRefs.current[i] = el;
            }}
            type="button"
            role="tab"
            id={`tab-${section.id}`}
            aria-selected={isActive}
            aria-controls={`tabpanel-${section.id}`}
            tabIndex={isActive ? 0 : -1}
            onClick={() => onChange(section.id)}
            className={`shrink-0 border-b-2 px-4 py-2.5 font-sans text-sm font-medium transition-colors ${
              isActive
                ? "border-foreground bg-surface-elevated text-foreground"
                : "text-muted-foreground hover:text-foreground border-transparent"
            }`}
          >
            {section.label}
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

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
    savedVersion,
  } = useSettings();

  const [active, setActive] = useState(SECTIONS[0].id);

  const saveMutation = useMutation({
    mutationFn: (patch: Parameters<typeof saveSettings>[0]) =>
      saveSettings(patch),
    onSuccess: (snapshot) => {
      applySaved(snapshot);
      toast.success("Settings saved.");
    },
    onError: () => {
      toast.error("Couldn't save your settings. Please try again.");
    },
  });

  const dirty = useMemo(() => {
    if (!saved || !draft) return false;
    return isSettingsDirty(saved, draft, clearedSecrets);
  }, [saved, draft, clearedSecrets]);

  function handleSave() {
    if (!saved || !draft) return;
    const patch = buildSettingsPatch(saved, draft, clearedSecrets);
    saveMutation.mutate(patch);
  }

  function handleDiscard() {
    if (!saved) return;
    applySaved(saved);
  }

  // Draft state is shared across tabs, so switching tabs preserves
  // unsaved edits and the global SaveBar keeps working.
  const sectionProps: SectionRenderProps | null =
    draft && saved
      ? { draft, saved, clearedSecrets, setDraft, clearSecret, savedVersion }
      : null;

  const activeSection = SECTIONS.find((s) => s.id === active) ?? SECTIONS[0];

  return (
    <main
      id="main-content"
      data-testid="settings-page"
      className="mx-auto flex w-full max-w-screen-md flex-col gap-8 px-4 py-8 sm:px-6 sm:py-12"
    >
      <header className="relative flex flex-col gap-3 overflow-hidden pb-2">
        <CelestialHeader headerShift={-15} />
        <p className="text-muted-foreground relative z-10 font-mono text-[0.7rem] font-medium tracking-[0.16em] uppercase">
          Configuration
        </p>
        <h1 className="text-foreground relative z-10 font-serif text-3xl font-semibold tracking-[-0.01em] sm:text-4xl">
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

      {status === "loading" || !sectionProps ? (
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
          <SettingsTabs active={active} onChange={setActive} />

          <div
            role="tabpanel"
            id={`tabpanel-${activeSection.id}`}
            aria-labelledby={`tab-${activeSection.id}`}
            className="flex flex-col"
          >
            {activeSection.render(sectionProps)}
          </div>
        </>
      )}

      <SaveBar
        dirty={dirty}
        saving={saveMutation.isPending}
        onSave={() => void handleSave()}
        onDiscard={handleDiscard}
      />
    </main>
  );
}
