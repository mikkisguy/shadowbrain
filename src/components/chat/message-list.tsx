"use client";

import { useEffect, useRef, useState } from "react";
import { MarkdownContent } from "@/app/item/[id]/markdown-content";
import { cn } from "@/lib/utils";
import {
  formatTokenCount,
  formatRelativeTime,
} from "@/lib/chat/model-metadata";

import type {
  ToolProgressItem,
  ApprovalState,
  HermesApprovalDecision,
} from "@/lib/chat/types";

// ---------------------------------------------------------------------------
// Types (UI-specific)
// ---------------------------------------------------------------------------

export interface ChatMessage {
  id?: string;
  role: "user" | "assistant";
  content: string;
  targetModel?: string;
  promptTokens?: number | null;
  completionTokens?: number | null;
  createdAt?: string;
  /** Hermes tool-progress events captured during this assistant turn. */
  toolProgress?: ToolProgressItem[];
}

interface MessageListProps {
  messages: ChatMessage[];
  streaming: boolean;
  /** The current streaming token content (still accumulating). */
  streamingContent?: string;
  /** Total tokens used across all messages (for context window indicator). */
  totalTokens?: number;
  /** The model's context window size. */
  contextWindow?: number;
  /** Whether regenerate is available on the last assistant message. */
  onRegenerate?: () => void;
  regenerating?: boolean;
  /** Error message from the SSE stream (displayed as a dismissible banner). */
  streamError?: string | null;
  /** Hermes: tool-progress events for the current turn. */
  toolProgress?: ToolProgressItem[];
  /** Hermes: pending approval that needs user decision. */
  approvalState?: ApprovalState;
  /** Hermes: callback when user resolves an approval. */
  onResolveApproval?: (decision: HermesApprovalDecision) => void;
  /** Callback when user saves a message to ShadowBrain. */
  onSaveContent?: (
    content: string,
    title: string | null,
    type: string,
    messageIndex: number
  ) => Promise<void>;
  /** Map of message index → saved item info (itemId, title). */
  savedItems?: Record<number, { itemId: string; title: string }>;
  /** Callback when user creates a branch from a message. */
  onBranch?: (messageIndex: number) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatFullTimestamp(isoString: string): string {
  const d = new Date(isoString);
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ToolActivityBlock({ item }: { item: ToolProgressItem }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border-border bg-card/30 my-1 rounded border text-xs">
      <button
        className="text-muted-foreground hover:text-foreground flex w-full items-center gap-2 px-3 py-1.5 text-left font-mono"
        onClick={() => setExpanded(!expanded)}
      >
        <span
          className={cn(
            "h-1.5 w-1.5 shrink-0 rounded-full",
            item.status === "running"
              ? "animate-pulse bg-amber-400"
              : "bg-emerald-400"
          )}
        />
        <span className="font-semibold">{item.tool}</span>
        <span className="truncate opacity-70">{item.label}</span>
        <span className="ml-auto shrink-0 opacity-50">
          {expanded ? "▲" : "▼"}
        </span>
      </button>
      {expanded && (
        <div className="border-border text-muted-foreground border-t px-3 py-1.5 font-mono">
          <span
            className={cn(
              "mr-1.5 inline-block rounded px-1 py-0.5 text-[10px] font-medium",
              item.status === "running"
                ? "bg-amber-500/20 text-amber-300"
                : "bg-emerald-500/20 text-emerald-300"
            )}
          >
            {item.status}
          </span>
          {item.label}
        </div>
      )}
    </div>
  );
}

/** Labels for Hermes approval choices. */
const CHOICE_LABELS: Record<HermesApprovalDecision, string> = {
  once: "Approve once",
  session: "Approve session",
  always: "Approve always",
  deny: "Deny",
};

function ApprovalPrompt({
  state,
  onResolve,
}: {
  state: ApprovalState;
  onResolve: (decision: HermesApprovalDecision) => void;
}) {
  return (
    <div className="my-2 rounded-lg border border-amber-500/40 bg-amber-500/5 px-4 py-3">
      <div className="mb-2 flex items-center gap-2">
        <svg
          className="h-4 w-4 shrink-0 text-amber-400"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
          />
        </svg>
        <span className="text-sm font-semibold text-amber-300">
          Approval Required
        </span>
      </div>
      <p className="text-muted-foreground mb-3 text-sm">{state.summary}</p>
      {state.command && (
        <pre className="bg-muted mb-3 overflow-x-auto rounded px-3 py-2 font-mono text-xs">
          {state.command}
        </pre>
      )}
      <div className="flex flex-wrap gap-2">
        {state.choices.map((choice) => (
          <button
            key={choice}
            className={cn(
              "rounded px-4 py-1.5 text-xs font-medium text-white transition-colors",
              choice === "deny"
                ? "bg-destructive hover:bg-destructive/80"
                : "bg-emerald-600 hover:bg-emerald-700"
            )}
            onClick={() => onResolve(choice)}
          >
            {CHOICE_LABELS[choice]}
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function MessageList({
  messages,
  streaming,
  streamingContent,
  totalTokens,
  contextWindow,
  onRegenerate,
  regenerating,
  streamError,
  toolProgress,
  approvalState,
  onResolveApproval,
  onSaveContent,
  savedItems,
  onBranch,
}: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const [hoveredTimestamp, setHoveredTimestamp] = useState<string | null>(null);
  const [savePickerIndex, setSavePickerIndex] = useState<number | null>(null);
  const [savePickerType, setSavePickerType] = useState("note");
  const [savePickerTitle, setSavePickerTitle] = useState("");

  // Auto-scroll to bottom when new content arrives
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingContent, toolProgress, approvalState]);

  if (messages.length === 0 && !streaming) {
    return (
      <div className="text-muted-foreground flex h-full items-center justify-center">
        <p>Start a conversation</p>
      </div>
    );
  }

  // Context window indicator
  const contextUsed =
    totalTokens && contextWindow
      ? Math.min(100, Math.round((totalTokens / contextWindow) * 100))
      : null;

  return (
    <div className="flex-1 overflow-y-auto px-4 py-6">
      {/* Context window indicator */}
      {contextUsed !== null && (
        <div className="border-border bg-card/50 mx-auto mb-4 max-w-3xl rounded-lg border px-4 py-2">
          <div className="text-muted-foreground mb-1 flex items-center justify-between text-xs">
            <span>Context window</span>
            <span>
              {contextUsed}% of {formatTokenCount(contextWindow ?? 0)} used
            </span>
          </div>
          <div className="bg-muted h-1.5 w-full overflow-hidden rounded-full">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-300",
                contextUsed > 80
                  ? "bg-destructive"
                  : contextUsed > 50
                    ? "bg-amber-500"
                    : "bg-primary"
              )}
              style={{ width: `${contextUsed}%` }}
            />
          </div>
        </div>
      )}

      {/* Stream error banner */}
      {streamError && (
        <div className="border-destructive/50 bg-destructive/10 text-destructive mx-auto mb-4 max-w-3xl rounded-lg border px-4 py-2 text-sm">
          {streamError}
        </div>
      )}

      <div className="mx-auto max-w-3xl space-y-6">
        {messages.map((msg, i) => {
          const isLast = i === messages.length - 1;
          const isLastAssistant =
            msg.role === "assistant" && isLast && !streaming;

          return (
            <div
              key={msg.id ?? i}
              className={cn(
                "flex flex-col",
                msg.role === "user" ? "items-end" : "items-start"
              )}
            >
              <div
                className={cn(
                  "max-w-[80%] rounded-lg px-4 py-3",
                  msg.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted"
                )}
              >
                {msg.role === "assistant" ? (
                  <div>
                    <div className="prose-sm prose-invert max-w-none">
                      <MarkdownContent content={msg.content} />
                    </div>
                    {/* Tool activity for this turn */}
                    {msg.toolProgress && msg.toolProgress.length > 0 && (
                      <div className="border-border mt-2 space-y-1 border-t pt-2">
                        {msg.toolProgress.map((item) => (
                          <ToolActivityBlock key={item.id} item={item} />
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                )}
              </div>

              {/* Metadata row */}
              <div
                className={cn(
                  "text-muted-foreground mt-1 flex items-center gap-3 text-xs",
                  msg.role === "user" ? "flex-row-reverse" : "flex-row"
                )}
              >
                {/* Model name for assistant messages */}
                {msg.role === "assistant" && msg.targetModel && (
                  <span className="italic">via {msg.targetModel}</span>
                )}

                {/* Token count */}
                {msg.promptTokens != null || msg.completionTokens != null ? (
                  <span>
                    {msg.promptTokens != null
                      ? `in: ${formatTokenCount(msg.promptTokens)}`
                      : ""}
                    {msg.promptTokens != null && msg.completionTokens != null
                      ? " / "
                      : ""}
                    {msg.completionTokens != null
                      ? `out: ${formatTokenCount(msg.completionTokens)}`
                      : ""}
                  </span>
                ) : null}

                {/* Timestamp with hover tooltip */}
                {msg.createdAt && (
                  <span
                    className="relative cursor-default"
                    onMouseEnter={() =>
                      setHoveredTimestamp(msg.createdAt ?? null)
                    }
                    onMouseLeave={() => setHoveredTimestamp(null)}
                  >
                    {formatRelativeTime(msg.createdAt)}
                    {hoveredTimestamp === msg.createdAt && (
                      <span className="bg-popover text-popover-foreground border-border absolute bottom-full left-1/2 -translate-x-1/2 rounded border px-2 py-1 text-xs whitespace-nowrap shadow-sm">
                        {formatFullTimestamp(msg.createdAt!)}
                      </span>
                    )}
                  </span>
                )}

                {/* Regenerate button (only on last assistant, not streaming) */}
                {isLastAssistant && onRegenerate && (
                  <button
                    className="text-muted-foreground hover:text-foreground rounded underline-offset-2 hover:underline disabled:opacity-50"
                    onClick={onRegenerate}
                    disabled={regenerating}
                  >
                    {regenerating ? "Regenerating..." : "Regenerate"}
                  </button>
                )}

                {/* Branch from here button (assistant messages only) */}
                {onBranch && msg.id && msg.role === "assistant" && (
                  <button
                    className="text-muted-foreground hover:text-foreground rounded underline-offset-2 hover:underline"
                    onClick={() => onBranch(i)}
                    title="Branch from here"
                  >
                    Branch
                  </button>
                )}

                {/* Save to ShadowBrain button */}
                {onSaveContent && (
                  <button
                    className="text-muted-foreground hover:text-foreground rounded underline-offset-2 hover:underline"
                    onClick={() => {
                      if (savePickerIndex === i) {
                        setSavePickerIndex(null);
                      } else {
                        setSavePickerIndex(i);
                        setSavePickerType("note");
                        setSavePickerTitle("");
                      }
                    }}
                    title="Save to ShadowBrain"
                  >
                    Save
                  </button>
                )}
              </div>

              {/* Inline confirmation: "Saved as note" */}
              {savedItems?.[i] && (
                <div className="mt-1 flex items-center gap-1.5 text-xs text-emerald-400">
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
                      d="m4.5 12.75 6 6 9-13.5"
                    />
                  </svg>
                  <span>
                    Saved as{" "}
                    <a
                      href={`/item/${savedItems[i].itemId}`}
                      className="underline hover:text-emerald-300"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {savedItems[i].title}
                    </a>
                    <span className="text-muted-foreground">
                      {" "}
                      #{savedItems[i].itemId.slice(0, 8)}
                    </span>
                  </span>
                </div>
              )}

              {/* Type picker for Save to ShadowBrain (only if not already saved) */}
              {onSaveContent && !savedItems?.[i] && savePickerIndex === i && (
                <div className="border-border bg-card/50 mt-2 w-full max-w-[280px] rounded border px-3 py-2">
                  <div className="mb-2 flex items-center gap-2">
                    <select
                      className="bg-background text-foreground border-border h-7 rounded border px-2 text-xs"
                      value={savePickerType}
                      onChange={(e) => setSavePickerType(e.target.value)}
                    >
                      <option value="note">Note</option>
                      <option value="journal">Journal</option>
                      <option value="bookmark">Bookmark</option>
                      <option value="question">Question</option>
                      <option value="raw_text">Raw text</option>
                    </select>
                    <input
                      type="text"
                      placeholder="Title (optional)"
                      className="bg-background text-foreground border-border h-7 flex-1 rounded border px-2 text-xs"
                      value={savePickerTitle}
                      onChange={(e) => setSavePickerTitle(e.target.value)}
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      className="bg-primary text-primary-foreground hover:bg-primary/90 rounded px-3 py-1 text-xs"
                      onClick={async () => {
                        await onSaveContent(
                          msg.content,
                          savePickerTitle || null,
                          savePickerType,
                          i
                        );
                        setSavePickerIndex(null);
                      }}
                    >
                      Save
                    </button>
                    <button
                      className="text-muted-foreground hover:text-foreground rounded px-2 py-1 text-xs"
                      onClick={() => setSavePickerIndex(null)}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {/* Streaming message */}
        {streaming && streamingContent && (
          <div className="flex justify-start">
            <div className="bg-muted max-w-[80%] rounded-lg px-4 py-3">
              <div className="prose-sm prose-invert max-w-none">
                <MarkdownContent content={streamingContent} />
              </div>
              <span className="bg-primary mt-1 inline-block h-4 w-1 animate-pulse" />

              {/* Tool progress inside the streaming bubble */}
              {toolProgress && toolProgress.length > 0 && (
                <div className="border-border mt-2 space-y-1 border-t pt-2">
                  {toolProgress.map((item) => (
                    <ToolActivityBlock key={item.id} item={item} />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Hermes approval prompt (during streaming) */}
        {streaming && approvalState && onResolveApproval && (
          <div className="mx-auto max-w-[80%]">
            <ApprovalPrompt
              state={approvalState}
              onResolve={onResolveApproval}
            />
          </div>
        )}

        {/* Loading indicator while waiting for first token (no tools yet) */}
        {streaming &&
          !streamingContent &&
          !approvalState &&
          !(toolProgress && toolProgress.length > 0) && (
            <div className="flex justify-start">
              <div className="bg-muted rounded-lg px-4 py-3">
                <div className="flex gap-1">
                  <span className="bg-muted-foreground/50 h-2 w-2 animate-bounce rounded-full [animation-delay:0ms]" />
                  <span className="bg-muted-foreground/50 h-2 w-2 animate-bounce rounded-full [animation-delay:150ms]" />
                  <span className="bg-muted-foreground/50 h-2 w-2 animate-bounce rounded-full [animation-delay:300ms]" />
                </div>
              </div>
            </div>
          )}

        {/* Tool progress before text arrives (Hermes: tools run first) */}
        {streaming &&
          !streamingContent &&
          !approvalState &&
          toolProgress &&
          toolProgress.length > 0 && (
            <div className="flex justify-start">
              <div className="bg-muted max-w-[80%] rounded-lg px-4 py-3">
                <div className="space-y-1">
                  {toolProgress.map((item) => (
                    <ToolActivityBlock key={item.id} item={item} />
                  ))}
                </div>
                <span className="bg-primary mt-2 inline-block h-4 w-1 animate-pulse" />
              </div>
            </div>
          )}

        <div ref={bottomRef} />
      </div>
    </div>
  );
}
