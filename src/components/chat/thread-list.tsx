"use client";

import { useState, useCallback, useMemo, useEffect, useRef } from "react";
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
  allow_model_save?: number;
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
// Constants
// ---------------------------------------------------------------------------

type FilterTab = "hermes" | "opencode-go" | "all";

const TABS: { id: FilterTab; label: string }[] = [
  { id: "hermes", label: "Hermes" },
  { id: "opencode-go", label: "OpenCode" },
  { id: "all", label: "All" },
];

const STORAGE_KEY_FILTER = "shadowbrain:thread-filter-tab";

type TimeBucket = "Today" | "Yesterday" | "This week" | "This month" | "Older";

const BUCKET_ORDER: TimeBucket[] = [
  "Today",
  "Yesterday",
  "This week",
  "This month",
  "Older",
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getTimeBucket(iso: string): TimeBucket {
  const now = new Date();
  const d = new Date(iso);

  // Today: same calendar date
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (d >= todayStart) return "Today";

  // Yesterday: the previous calendar date
  const yesterdayStart = new Date(todayStart);
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);
  if (d >= yesterdayStart) return "Yesterday";

  // This week: previous 7 calendar days
  const weekStart = new Date(todayStart);
  weekStart.setDate(weekStart.getDate() - 7);
  if (d >= weekStart) return "This week";

  // This month: since the 1st of the current calendar month
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  if (d >= monthStart) return "This month";

  return "Older";
}

function groupByBucket(
  threads: ThreadInfo[]
): { bucket: TimeBucket; items: ThreadInfo[] }[] {
  const groups = new Map<TimeBucket, ThreadInfo[]>();
  for (const t of threads) {
    const bucket = getTimeBucket(t.updated_at);
    const list = groups.get(bucket);
    if (list) {
      list.push(t);
    } else {
      groups.set(bucket, [t]);
    }
  }
  return BUCKET_ORDER.filter((b) => groups.has(b)).map((b) => ({
    bucket: b,
    items: groups.get(b)!,
  }));
}

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

function ClearIcon() {
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
      aria-hidden="true"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-muted-foreground"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function EditIcon() {
  return (
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
      aria-hidden="true"
    >
      <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
    </svg>
  );
}

function DeleteIcon() {
  return (
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
      aria-hidden="true"
    >
      <path d="M3 6h18" />
      <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
      <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
    </svg>
  );
}

function ChatEmptyIcon() {
  return (
    <svg
      width="32"
      height="32"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-muted-foreground/30"
      aria-hidden="true"
    >
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ProviderTabs({
  active,
  onChange,
}: {
  active: FilterTab;
  onChange: (id: FilterTab) => void;
}) {
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const idx = TABS.findIndex((t) => t.id === active);
      if (event.key === "ArrowRight" || event.key === "ArrowDown") {
        event.preventDefault();
        const next = (idx + 1) % TABS.length;
        onChange(TABS[next].id);
        tabRefs.current[next]?.focus();
      } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
        event.preventDefault();
        const prev = (idx - 1 + TABS.length) % TABS.length;
        onChange(TABS[prev].id);
        tabRefs.current[prev]?.focus();
      }
    },
    [active, onChange]
  );

  return (
    <div
      role="tablist"
      aria-label="Filter threads by provider"
      onKeyDown={handleKeyDown}
      className="border-border flex border-b"
    >
      {TABS.map((tab, i) => {
        const isActive = tab.id === active;
        return (
          <button
            key={tab.id}
            ref={(el) => {
              tabRefs.current[i] = el;
            }}
            type="button"
            role="tab"
            id={`tab-${tab.id}`}
            aria-selected={isActive}
            aria-controls="thread-list-panel"
            tabIndex={isActive ? 0 : -1}
            onClick={() => onChange(tab.id)}
            className={cn(
              "flex-1 border-b-2 py-2 text-center font-sans text-xs font-medium transition-colors",
              isActive
                ? "border-foreground text-foreground"
                : "text-muted-foreground hover:text-foreground/80 border-transparent"
            )}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

function SearchInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="px-3 pt-2.5 pb-2" role="search">
      <div className="relative">
        <span className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2">
          <SearchIcon />
        </span>
        <Input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Search threads..."
          aria-label="Search threads"
          className="h-8 pr-7 pl-7 text-xs"
        />
        {value.length > 0 && (
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground absolute top-1/2 right-1.5 -translate-y-1/2 rounded p-1 transition-colors"
            onClick={() => {
              onChange("");
              inputRef.current?.focus();
            }}
            aria-label="Clear search"
          >
            <ClearIcon />
          </button>
        )}
      </div>
    </div>
  );
}

function SectionHeader({ bucket }: { bucket: TimeBucket }) {
  return (
    <li className="pointer-events-none">
      <span className="text-muted-foreground/70 block px-3.5 pt-3 pb-1 font-sans text-[10px] font-medium tracking-wider uppercase">
        {bucket}
      </span>
    </li>
  );
}

function EmptyState({
  isSearching,
  activeTab,
}: {
  isSearching: boolean;
  activeTab: FilterTab;
}) {
  if (isSearching) {
    return (
      <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
        <ChatEmptyIcon />
        <p className="text-foreground text-sm font-medium">No matching chats</p>
        <p className="text-muted-foreground text-xs">
          Try a different search term.
        </p>
      </div>
    );
  }

  const tabLabel = TABS.find((t) => t.id === activeTab)?.label ?? "any";

  return (
    <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
      <ChatEmptyIcon />
      <p className="text-foreground text-sm font-medium">
        {activeTab === "all" ? "No chats yet" : `No ${tabLabel} chats yet`}
      </p>
      <p className="text-muted-foreground text-xs">
        {activeTab === "all"
          ? "Start a new conversation to begin."
          : `Switch to All or start a new ${tabLabel} chat.`}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ThreadList
// ---------------------------------------------------------------------------

export function ThreadList({
  threads,
  activeThreadId,
  onSelectThread,
  onNewChat,
  onDeleteThread,
  onRenameThread,
}: ThreadListProps) {
  const [filterTab, setFilterTab] = useState<FilterTab>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [mounted, setMounted] = useState(false);
  const originalTitleRef = useRef("");

  // Restore saved filter tab on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_FILTER);
      if (saved && TABS.some((t) => t.id === saved)) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- mount restore
        setFilterTab(saved as FilterTab);
      }
    } catch {
      // localStorage unavailable — ignore
    }
     
    setMounted(true);
  }, []);

  // Persist filter tab on change
  useEffect(() => {
    if (!mounted) return;
    try {
      localStorage.setItem(STORAGE_KEY_FILTER, filterTab);
    } catch {
      // ignore
    }
  }, [filterTab, mounted]);

  // Filter threads by tab + search
  const filteredThreads = useMemo(() => {
    let result = threads;
    if (filterTab !== "all") {
      result = result.filter((t) => t.target_provider === filterTab);
    }
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      result = result.filter((t) => t.title.toLowerCase().includes(q));
    }
    return result;
  }, [threads, filterTab, searchQuery]);

  const isSearching = searchQuery.trim().length > 0;

  // Group filtered threads into time buckets
  const buckets = useMemo(
    () => groupByBucket(filteredThreads),
    [filteredThreads]
  );

  const startRename = useCallback((id: string, currentTitle: string) => {
    setEditingId(id);
    setEditTitle(currentTitle);
    originalTitleRef.current = currentTitle;
  }, []);

  const submitRename = useCallback(
    (id: string) => {
      const trimmed = editTitle.trim();
      if (trimmed && trimmed !== originalTitleRef.current) {
        onRenameThread(id, trimmed);
      }
      setEditingId(null);
    },
    [editTitle, onRenameThread]
  );

  // Build a flat item list with section headers interleaved for animation indexing
  const flatList = useMemo(() => {
    const items: (
      | { type: "header"; bucket: TimeBucket }
      | { type: "thread"; thread: ThreadInfo }
    )[] = [];
    for (const { bucket, items: bucketItems } of buckets) {
      items.push({ type: "header", bucket });
      for (const t of bucketItems) {
        items.push({ type: "thread", thread: t });
      }
    }
    return items;
  }, [buckets]);

  return (
    <aside className="border-border bg-card flex min-h-0 w-64 shrink-0 flex-col border-r">
      {/* New Chat button */}
      <div className="p-3 pb-2">
        <Button
          variant="secondary"
          size="sm"
          className="w-full justify-start gap-2 transition-[transform,box-shadow] duration-150 hover:-translate-y-px hover:shadow-sm active:translate-y-0"
          onClick={onNewChat}
        >
          <PlusIcon />
          New Chat
        </Button>
      </div>

      {/* Provider tabs */}
      <ProviderTabs active={filterTab} onChange={setFilterTab} />

      {/* Search */}
      <SearchInput value={searchQuery} onChange={setSearchQuery} />

      {/* Thread list */}
      <div
        className="flex-1 overflow-y-auto"
        role="tabpanel"
        id="thread-list-panel"
        aria-labelledby={`tab-${filterTab}`}
      >
        {filteredThreads.length === 0 ? (
          <EmptyState isSearching={isSearching} activeTab={filterTab} />
        ) : (
          <ul className="space-y-0.5 p-1">
            {flatList.map((item, idx) => {
              if (item.type === "header") {
                return (
                  <SectionHeader
                    key={`h-${item.bucket}`}
                    bucket={item.bucket}
                  />
                );
              }

              const thread = item.thread;
              return (
                <li
                  key={thread.id}
                  style={{
                    animation: `thread-enter 180ms ease-out forwards`,
                    animationDelay: `${Math.min(idx, 15) * 20}ms`,
                    opacity: 0,
                  }}
                >
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
                    <button
                      type="button"
                      className={cn(
                        "group relative mx-2 flex w-[calc(100%-16px)] cursor-pointer items-center gap-2 rounded-md py-2 pr-2 pl-1.5 text-left transition-all duration-150",
                        activeThreadId === thread.id
                          ? "bg-accent text-accent-foreground shadow-[inset_2px_0_0_0_currentColor]"
                          : "text-foreground hover:bg-accent/40"
                      )}
                      onClick={() => onSelectThread(thread.id)}
                      aria-current={
                        activeThreadId === thread.id ? "true" : undefined
                      }
                    >
                      {/* Provider accent — visible on hover or when searching (suppressed on active) */}
                      {activeThreadId !== thread.id && (
                        <span
                          className={cn(
                            "absolute top-1 bottom-1 left-0 w-0.5 rounded-full transition-opacity duration-150",
                            thread.target_provider === "hermes"
                              ? "bg-amber-500"
                              : "bg-slate-400",
                            isSearching || filterTab === "all"
                              ? "opacity-100"
                              : "opacity-0 group-hover:opacity-100"
                          )}
                          aria-hidden="true"
                        />
                      )}

                      {/* Title */}
                      <span className="min-w-0 flex-1 truncate pl-1.5 text-sm">
                        {thread.title}
                      </span>

                      {/* Action buttons — absolute overlaid on right side, faded bg */}
                      <span
                        className={cn(
                          "bg-card/80 absolute top-1/2 right-1 z-10 flex -translate-y-1/2 items-center gap-0.5 rounded px-0.5 py-0.5 backdrop-blur-sm transition-opacity duration-150",
                          "opacity-0 group-focus-within:opacity-100 group-hover:opacity-100"
                        )}
                      >
                        <span
                          className="text-muted-foreground hover:text-foreground hover:bg-accent-foreground/10 inline-flex h-6 w-6 items-center justify-center rounded transition-colors"
                          role="button"
                          tabIndex={0}
                          aria-label="Rename"
                          onClick={(e) => {
                            e.stopPropagation();
                            startRename(thread.id, thread.title);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              e.stopPropagation();
                              startRename(thread.id, thread.title);
                            }
                          }}
                        >
                          <EditIcon />
                        </span>
                        <span
                          className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 inline-flex h-6 w-6 items-center justify-center rounded transition-colors"
                          role="button"
                          tabIndex={0}
                          aria-label="Delete"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteThread(thread.id);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              e.stopPropagation();
                              onDeleteThread(thread.id);
                            }
                          }}
                        >
                          <DeleteIcon />
                        </span>
                      </span>
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </aside>
  );
}
