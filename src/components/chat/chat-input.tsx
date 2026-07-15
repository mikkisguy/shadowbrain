"use client";

import { useState, useRef, useCallback, type KeyboardEvent } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { ModelSelector } from "@/components/chat/model-selector";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { formatTokenCount } from "@/lib/chat/model-metadata";
import type { ModelOption } from "@/lib/chat/providers";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ChatInputProps {
  onSend: (message: string) => void;
  disabled: boolean;
  /** Callback when the user clicks the stop button (visible during streaming). */
  onStop?: () => void;
  provider: string;
  model: string;
  allModels: Record<string, ModelOption[]>;
  onModelSelect: (provider: string, model: string) => void;
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
  /** Total tokens used in the current conversation (prompt + completion). */
  totalTokens?: number;
  /** Model context window limit in tokens. */
  contextWindow?: number;
}

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

function TemporaryIcon({ active }: { active?: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn(active && "text-primary")}
    >
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function GroundedIcon({ active }: { active?: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn(active && "text-primary")}
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  );
}

function IncludePrivateIcon({ active }: { active?: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn(active && "text-primary")}
    >
      <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Context window ring (small donut chart)
// ---------------------------------------------------------------------------

function ContextWindowRing({
  totalTokens,
  contextWindow,
}: {
  totalTokens?: number;
  contextWindow?: number;
}) {
  const contextUsed =
    totalTokens != null && contextWindow != null && contextWindow > 0
      ? Math.min(100, Math.round((totalTokens / contextWindow) * 100))
      : null;

  const size = 20;
  const strokeWidth = 2.5;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;

  let colorClass = "text-muted-foreground";
  if (contextUsed != null) {
    if (contextUsed > 80) colorClass = "text-destructive";
    else if (contextUsed >= 60) colorClass = "text-amber-500";
  }

  const dashOffset =
    contextUsed != null
      ? circumference * (1 - contextUsed / 100)
      : circumference;

  const label =
    contextUsed != null && totalTokens != null && contextWindow != null
      ? `${contextUsed}% of ${formatTokenCount(contextWindow)} used (${formatTokenCount(totalTokens)} / ${formatTokenCount(contextWindow)} tokens)`
      : "";

  return (
    <Tooltip>
      <TooltipTrigger
        className="inline-flex items-center justify-center"
        aria-label="Context window usage"
      >
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          className={cn("shrink-0", colorClass)}
        >
          {/* Background track */}
          <circle
            cx={center}
            cy={center}
            r={radius}
            stroke="currentColor"
            className="opacity-20"
          />
          {/* Foreground arc */}
          {contextUsed != null && (
            <circle
              cx={center}
              cy={center}
              r={radius}
              stroke="currentColor"
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
              transform={`rotate(-90 ${center} ${center})`}
              className="transition-all duration-300"
            />
          )}
        </svg>
      </TooltipTrigger>
      {label && <TooltipContent side="top">{label}</TooltipContent>}
    </Tooltip>
  );
}

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

function AllowModelSaveIcon({ active }: { active?: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn(active && "text-primary")}
    >
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
      <polyline points="17 21 17 13 7 13 7 21" />
      <polyline points="7 3 7 8 15 8" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ChatInput({
  onSend,
  disabled,
  onStop,
  provider,
  model,
  allModels,
  onModelSelect,
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
  totalTokens,
  contextWindow,
}: ChatInputProps) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue("");
    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [value, disabled, onSend]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  // Auto-resize textarea
  const handleInput = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, []);

  const toggleButtonClass = (active: boolean) =>
    cn(
      "inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors",
      active
        ? "bg-primary/10 text-primary"
        : "text-muted-foreground hover:text-foreground hover:bg-muted"
    );

  return (
    <div className="border-border bg-background border-t px-4 py-3">
      <div className="mx-auto max-w-3xl">
        {/* Single unified composer panel */}
        <div className="border-border bg-card focus-within:ring-ring/50 rounded-xl border focus-within:ring-2">
          {/* Textarea at top */}
          <div className="px-3 pt-3">
            <Textarea
              ref={textareaRef}
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                handleInput();
              }}
              onKeyDown={handleKeyDown}
              placeholder="Type a message..."
              rows={1}
              disabled={disabled}
              className="placeholder:text-muted-foreground min-h-[40px] resize-none border-0 bg-transparent p-0 shadow-none focus-visible:ring-0"
            />
          </div>

          {/* Controls row at bottom */}
          <div className="flex items-center gap-2 px-3 pt-2 pb-2">
            {/* Unified model selector (provider + model in one dropdown) */}
            <ModelSelector
              provider={provider}
              model={model}
              allModels={allModels}
              onSelect={onModelSelect}
              disabled={disabled}
            />

            {/* Toggle icon buttons */}
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                className={toggleButtonClass(temporary)}
                onClick={() => onTemporaryChange(!temporary)}
                title="Temporary chat"
                aria-label="Temporary chat"
                aria-pressed={temporary}
              >
                <TemporaryIcon active={temporary} />
              </button>
              <button
                type="button"
                className={toggleButtonClass(grounded)}
                onClick={() => onGroundedChange(!grounded)}
                title="Grounded (RAG)"
                aria-label="Grounded (RAG)"
                aria-pressed={grounded}
              >
                <GroundedIcon active={grounded} />
              </button>
              <button
                type="button"
                className={cn(
                  toggleButtonClass(includePrivateInAi && grounded),
                  !grounded && "cursor-not-allowed opacity-30"
                )}
                onClick={() =>
                  grounded && onIncludePrivateInAiChange(!includePrivateInAi)
                }
                aria-label="Include private items"
                title={
                  grounded ? "Include private items" : "Enable Grounded first"
                }
                aria-pressed={includePrivateInAi && grounded}
                disabled={!grounded}
              >
                <IncludePrivateIcon active={includePrivateInAi && grounded} />
              </button>
              <button
                type="button"
                className={cn(
                  toggleButtonClass(allowModelSave && grounded),
                  !grounded && "cursor-not-allowed opacity-30"
                )}
                onClick={() =>
                  grounded && onAllowModelSaveChange(!allowModelSave)
                }
                aria-label="Allow model to save"
                title={
                  grounded ? "Allow model to save" : "Enable Grounded first"
                }
                aria-pressed={allowModelSave && grounded}
                disabled={!grounded}
              >
                <AllowModelSaveIcon active={allowModelSave && grounded} />
              </button>
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
                Admin mode
              </span>
            )}

            {/* Save chat button (temporary chats) — alongside the always‑visible controls */}
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

            {/* Spacer pushes the next group to the right */}
            <div className="ml-auto" />

            {/* Context window indicator */}
            <div className="pt-2">
              <ContextWindowRing
                totalTokens={totalTokens}
                contextWindow={contextWindow}
              />
            </div>

            {/* Stop button (visible during streaming) */}
            {onStop && disabled ? (
              <button
                type="button"
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors"
                onClick={onStop}
                title="Stop generating"
                aria-label="Stop generating"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  stroke="none"
                >
                  <rect x="4" y="4" width="16" height="16" rx="2" />
                </svg>
              </button>
            ) : (
              /* Send button — always at the right end */
              <button
                type="button"
                className={cn(
                  "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors",
                  value.trim()
                    ? "bg-primary text-primary-foreground hover:bg-primary/90"
                    : "bg-muted text-muted-foreground"
                )}
                onClick={handleSend}
                disabled={disabled || !value.trim()}
                title="Send message"
                aria-label="Send message"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
