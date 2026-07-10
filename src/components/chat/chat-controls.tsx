"use client";

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
}

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
}: ChatControlsProps) {
  return (
    <div className="border-border bg-background flex items-center gap-3 border-t px-4 py-2">
      {/* Target selector */}
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground text-xs">Model:</span>
        <Select
          value={provider}
          onValueChange={(v) => v && onProviderChange(v)}
        >
          <SelectTrigger className="h-7 w-32 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="opencode-go">OpenCode Go</SelectItem>
            <SelectItem value="hermes">Hermes</SelectItem>
          </SelectContent>
        </Select>
        <Select value={model} onValueChange={(v) => v && onModelChange(v)}>
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
