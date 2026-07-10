"use client";

import { useEffect, useRef, useState } from "react";
import { MarkdownContent } from "@/app/item/[id]/markdown-content";
import { cn } from "@/lib/utils";
import {
  formatTokenCount,
  formatRelativeTime,
} from "@/lib/chat/model-metadata";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ChatMessage {
  id?: string;
  role: "user" | "assistant";
  content: string;
  targetModel?: string;
  promptTokens?: number | null;
  completionTokens?: number | null;
  createdAt?: string;
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
}: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const [hoveredTimestamp, setHoveredTimestamp] = useState<string | null>(null);

  // Auto-scroll to bottom when new content arrives
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingContent]);

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
                  <div className="prose-sm prose-invert max-w-none">
                    <MarkdownContent content={msg.content} />
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
              </div>
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
            </div>
          </div>
        )}

        {/* Loading indicator while waiting for first token */}
        {streaming && !streamingContent && (
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

        <div ref={bottomRef} />
      </div>
    </div>
  );
}
