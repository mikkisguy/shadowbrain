"use client";

import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatModelName } from "@/lib/chat/format-model-name";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ModelOption {
  id: string;
  name: string;
}

interface ChatControlsProps {
  provider: string;
  onProviderChange: (provider: string) => void;
  model: string;
  onModelChange: (model: string) => void;
  models: ModelOption[];
  temporary: boolean;
  onTemporaryChange: (temporary: boolean) => void;
  showSaveChat: boolean;
  onSaveChat: () => void;
  savingChat: boolean;
  /** Show an "Admin mode (Hermes)" indicator when the Hermes toolset is live. */
  isHermesMode?: boolean;
  grounded: boolean;
  onGroundedChange: (grounded: boolean) => void;
  includePrivateInAi: boolean;
  onIncludePrivateInAiChange: (includePrivate: boolean) => void;
  allowModelSave: boolean;
  onAllowModelSaveChange: (allow: boolean) => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const providerLabels: Record<string, string> = {
  "opencode-go": "OpenCode Go",
  hermes: "Hermes",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ChatControls({
  provider,
  onProviderChange,
  model,
  onModelChange,
  models,
  temporary,
  onTemporaryChange,
  showSaveChat,
  onSaveChat,
  savingChat,
  isHermesMode,
  grounded,
  onGroundedChange,
  includePrivateInAi,
  onIncludePrivateInAiChange,
  allowModelSave,
  onAllowModelSaveChange,
}: ChatControlsProps) {
  const modelLabels = useMemo(
    () => Object.fromEntries(models.map((m) => [m.id, formatModelName(m.id)])),
    [models]
  );

  return (
    <div className="border-border bg-background flex items-center gap-3 border-t px-4 py-2">
      {/* Target selector */}
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground text-xs">Model:</span>
        <Select
          value={provider}
          onValueChange={(v) => v && onProviderChange(v)}
          items={providerLabels}
        >
          <SelectTrigger className="h-7 w-32 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="opencode-go">OpenCode Go</SelectItem>
            <SelectItem value="hermes">Hermes</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={model}
          onValueChange={(v) => v && onModelChange(v)}
          items={modelLabels}
        >
          <SelectTrigger className="h-7 w-40 text-xs">
            <SelectValue placeholder="Select model" />
          </SelectTrigger>
          <SelectContent>
            {models.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {formatModelName(m.id)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Admin mode indicator */}
      {isHermesMode && (
        <span className="inline-flex items-center gap-1 rounded border border-amber-500/30 bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-300">
          <svg
            className="h-3 w-3"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z"
            />
          </svg>
          Admin mode (Hermes)
        </span>
      )}

      {/* Temporary toggle */}
      <label className="text-muted-foreground flex cursor-pointer items-center gap-2 text-xs">
        <input
          type="checkbox"
          checked={temporary}
          onChange={(e) => onTemporaryChange(e.target.checked)}
          className="accent-primary h-3.5 w-3.5 rounded"
        />
        Temporary
      </label>

      {/* Grounded (RAG) toggle */}
      <label className="text-muted-foreground flex cursor-pointer items-center gap-2 text-xs">
        <input
          type="checkbox"
          checked={grounded}
          onChange={(e) => onGroundedChange(e.target.checked)}
          className="accent-primary h-3.5 w-3.5 rounded"
        />
        Grounded
      </label>

      {/* Include private in AI toggle */}
      <label className="text-muted-foreground flex cursor-pointer items-center gap-2 text-xs">
        <input
          type="checkbox"
          checked={includePrivateInAi}
          onChange={(e) => onIncludePrivateInAiChange(e.target.checked)}
          className="accent-primary h-3.5 w-3.5 rounded"
        />
        Include private
      </label>

      {/* Allow model save toggle */}
      <label className="text-muted-foreground flex cursor-pointer items-center gap-2 text-xs">
        <input
          type="checkbox"
          checked={allowModelSave}
          onChange={(e) => onAllowModelSaveChange(e.target.checked)}
          className="accent-primary h-3.5 w-3.5 rounded"
        />
        Allow model save
      </label>

      {/* Save chat button (temporary chats) */}
      {showSaveChat && (
        <Button
          variant="secondary"
          size="sm"
          className="h-7 text-xs"
          onClick={onSaveChat}
          disabled={savingChat}
        >
          {savingChat ? "Saving..." : "Save chat"}
        </Button>
      )}
    </div>
  );
}
