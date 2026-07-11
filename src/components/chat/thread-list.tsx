"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ThreadInfo {
  id: string;
  title: string;
  target_provider: string;
  target_model: string;
  grounded?: number;
  include_private_in_ai?: number;
  updated_at: string;
}

interface ThreadListProps {
  threads: ThreadInfo[];
  activeThreadId: string | null;
  onSelectThread: (id: string) => void;
  onNewChat: () => void;
  onDeleteThread: (id: string) => void;
  onRenameThread: (id: string, title: string) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ThreadList({
  threads,
  activeThreadId,
  onSelectThread,
  onNewChat,
  onDeleteThread,
  onRenameThread,
}: ThreadListProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");

  const startRename = useCallback((id: string, currentTitle: string) => {
    setEditingId(id);
    setEditTitle(currentTitle);
  }, []);

  const submitRename = useCallback(
    (id: string) => {
      if (editTitle.trim()) {
        onRenameThread(id, editTitle.trim());
      }
      setEditingId(null);
    },
    [editTitle, onRenameThread]
  );

  return (
    <aside className="border-border bg-card/50 flex h-full w-64 shrink-0 flex-col border-r">
      {/* Top controls */}
      <div className="border-border border-b p-3">
        <Button
          variant="default"
          size="sm"
          className="w-full"
          onClick={onNewChat}
        >
          + New Chat
        </Button>
      </div>

      {/* Thread list */}
      <div className="flex-1 overflow-y-auto">
        {threads.length === 0 ? (
          <p className="text-muted-foreground p-4 text-center text-sm">
            No threads yet
          </p>
        ) : (
          <ul className="space-y-0.5 p-1">
            {threads.map((thread) => (
              <li key={thread.id}>
                {editingId === thread.id ? (
                  <form
                    className="flex gap-1 px-1"
                    onSubmit={(e) => {
                      e.preventDefault();
                      submitRename(thread.id);
                    }}
                  >
                    <Input
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      className="h-7 flex-1 text-xs"
                      autoFocus
                      onBlur={() => submitRename(thread.id)}
                    />
                  </form>
                ) : (
                  <div
                    className={cn(
                      "group hover:bg-accent/50 flex cursor-pointer items-center justify-between rounded-md px-2 py-1.5 text-sm transition-colors",
                      activeThreadId === thread.id &&
                        "bg-accent text-accent-foreground"
                    )}
                    onClick={() => onSelectThread(thread.id)}
                  >
                    <span className="truncate text-xs">{thread.title}</span>
                    <div className="flex shrink-0 opacity-0 transition-opacity group-hover:opacity-100">
                      <button
                        className="text-muted-foreground hover:text-foreground rounded p-0.5"
                        title="Rename"
                        onClick={(e) => {
                          e.stopPropagation();
                          startRename(thread.id, thread.title);
                        }}
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="12"
                          height="12"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                        </svg>
                      </button>
                      <button
                        className="text-muted-foreground hover:text-destructive rounded p-0.5"
                        title="Delete"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteThread(thread.id);
                        }}
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="12"
                          height="12"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M3 6h18" />
                          <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                          <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                        </svg>
                      </button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}
