"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { ThreadList } from "@/components/chat/thread-list";
import { MessageList } from "@/components/chat/message-list";
import type {
  ToolProgressItem,
  ApprovalState,
  HermesApprovalDecision,
} from "@/lib/chat/types";
import { Menu } from "lucide-react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { ChatInput } from "@/components/chat/chat-input";
import type { ThreadInfo } from "@/components/chat/thread-list";
import type { ModelOption } from "@/lib/chat/providers";
import type { ChatMessage } from "@/components/chat/message-list";
import { getModelContextWindow } from "@/lib/chat/model-metadata";

const DEFAULT_PROVIDER = "opencode-go";

function parseToolCalls(
  raw: string | null | undefined
): ToolProgressItem[] | undefined {
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return undefined;
    // Ensure unique IDs — old data may have duplicate tool-name IDs
    const seenIds = new Set<string>();
    return parsed.map((item: Record<string, unknown>, i: number) => {
      let id = String(item.id ?? `tool-${i}`);
      // If this ID was already used, make it unique by appending index
      if (seenIds.has(id)) {
        id = `${id}-${i}`;
      }
      seenIds.add(id);
      return {
        id,
        tool: String(item.tool ?? "unknown"),
        label: String(item.label ?? ""),
        status: item.status === "completed" ? "completed" : "running",
      };
    }) as ToolProgressItem[];
  } catch {
    return undefined;
  }
}

const STORAGE_KEY_ACTIVE_THREAD = "shadowbrain:active-thread-id";

export default function ChatPage() {
  // ------------------------------------------------------------------
  // State
  // ------------------------------------------------------------------
  const [threads, setThreads] = useState<ThreadInfo[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streamingContent, setStreamingContent] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [temporary, setTemporary] = useState(false);
  const [provider, setProvider] = useState(DEFAULT_PROVIDER);
  const [model, setModel] = useState("");
  const [allModels, setAllModels] = useState<Record<string, ModelOption[]>>({});
  const [savingChat, setSavingChat] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [toolProgress, setToolProgress] = useState<ToolProgressItem[]>([]);
  const [approvalState, setApprovalState] = useState<ApprovalState | undefined>(
    undefined
  );
  const [grounded, setGrounded] = useState(false);
  const [includePrivateInAi, setIncludePrivateInAi] = useState(false);
  const [allowModelSave, setAllowModelSave] = useState(false);
  const [savedItems, setSavedItems] = useState<
    Record<number, { itemId: string; title: string }>
  >({});

  const [isMobile, setIsMobile] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [highlightMessageId, setHighlightMessageId] = useState<string | null>(
    null
  );

  const abortRef = useRef<AbortController | null>(null);
  const stopRequestedRef = useRef(false);
  const currentStreamIdRef = useRef(0);
  const streamingContentRef = useRef("");
  const modelRef = useRef(model);
  const titlePollTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const messagesRef = useRef(messages);
  const pendingSavedRef = useRef<{ itemId: string; title: string } | null>(
    null
  );
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerHeight, setContainerHeight] = useState<number | undefined>(
    undefined
  );

  // Constrain the chat page to the available viewport height so internal
  // overflow-y-auto containers scroll independently.
  // Watch container resizes directly, plus window.resize and
  // visualViewport events for mobile dynamic toolbars.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const update = () => {
      const rect = container.getBoundingClientRect();
      setContainerHeight(window.innerHeight - rect.top);
    };
    update();

    const observer = new ResizeObserver(update);
    observer.observe(container);
    window.addEventListener("resize", update);
    window.visualViewport?.addEventListener("resize", update);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("resize", update);
    };
  }, []);

  // Track viewport size for responsive thread-list sidebar
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mql = window.matchMedia("(min-width: 768px)");
    setIsMobile(!mql.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(!e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Sync refs with state (post-render, no extra renders)
  useEffect(() => {
    modelRef.current = model;
    messagesRef.current = messages;
  });

  // Clear title-poll timers on unmount
  useEffect(() => {
    return () => {
      for (const t of titlePollTimersRef.current) clearTimeout(t);
    };
  }, []);

  // ------------------------------------------------------------------
  // Derived: context window usage
  // ------------------------------------------------------------------
  const totalTokens = useMemo(() => {
    let maxPrompt = 0;
    let lastCompletion = 0;
    for (const msg of messages) {
      if (msg.promptTokens != null && msg.promptTokens > maxPrompt) {
        maxPrompt = msg.promptTokens;
      }
      if (msg.completionTokens != null) {
        lastCompletion = msg.completionTokens;
      }
    }
    return maxPrompt + lastCompletion;
  }, [messages]);

  const contextWindow = getModelContextWindow(model);

  // ------------------------------------------------------------------
  // Fetch threads
  // ------------------------------------------------------------------
  const fetchThreads = useCallback(async (signal?: AbortSignal) => {
    try {
      const res = await fetch("/api/chat/threads", { signal });
      if (!res.ok) return;
      const data = await res.json();
      setThreads(data.threads as ThreadInfo[]);
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      // silent
    }
  }, []);

  // Mark mounted (for localStorage guards)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount flag
    setMounted(true);
  }, []);

  // Fetch threads on mount with cleanup
  useEffect(() => {
    const controller = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mounted data fetch
    fetchThreads(controller.signal);
    return () => controller.abort();
  }, [fetchThreads]);
  // Persist active thread ID
  useEffect(() => {
    if (!mounted) return;
    try {
      if (activeThreadId) {
        localStorage.setItem(STORAGE_KEY_ACTIVE_THREAD, activeThreadId);
      }
    } catch {
      // ignore
    }
  }, [activeThreadId, mounted]);

  // Fetch available models on mount
  useEffect(() => {
    fetch("/api/chat/models")
      .then((res) => res.json())
      .then((data) => {
        const remote: Record<string, ModelOption[]> = data.models ?? {};
        setAllModels(remote);
        // Pick an initial model: prefer the configured default, then
        // first OpenCode Go model, then Hermes, then empty.
        const goModels = remote["opencode-go"] ?? [];
        const hermesModels = remote["hermes"] ?? [];
        const preferred =
          data.defaultOpenCodeGoModel &&
          goModels.find(
            (m: ModelOption) => m.id === data.defaultOpenCodeGoModel
          )
            ? data.defaultOpenCodeGoModel
            : (goModels[0]?.id ?? hermesModels[0]?.id ?? "");
        setModel(preferred);
      })
      .catch(() => {});
  }, []);

  // ------------------------------------------------------------------
  // Model selection (unified provider + model picker)
  // ------------------------------------------------------------------
  const handleModelSelect = useCallback((p: string, m: string) => {
    setProvider(p);
    setModel(m);
  }, []);

  // ------------------------------------------------------------------
  // Select a thread
  // ------------------------------------------------------------------
  const handleSelectThread = useCallback(async (id: string) => {
    // Abort any in-flight stream
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
      setStreaming(false);
      setStreamingContent("");
      streamingContentRef.current = "";
    }

    try {
      const res = await fetch(`/api/chat/threads/${id}`);
      if (!res.ok) return;
      const data = await res.json();
      const thread = data.thread as ThreadInfo;
      const rawMessages = data.messages as Array<{
        id: string;
        role: string;
        content: string;
        target_provider?: string;
        target_model?: string;
        prompt_tokens?: number | null;
        completion_tokens?: number | null;
        tool_calls?: string | null;
        created_at: string;
      }>;

      setActiveThreadId(id);
      setTemporary(false);
      setSavedItems({});

      // Auto-select provider + model from thread
      if (thread.target_provider) {
        setProvider(thread.target_provider);
      }
      if (thread.target_model) {
        setModel(thread.target_model);
      }

      // Load RAG settings from thread
      setGrounded(thread.grounded === 1);
      setIncludePrivateInAi(thread.include_private_in_ai === 1);
      setAllowModelSave(thread.allow_model_save === 1);

      // Map messages with metadata
      setMessages(
        rawMessages.map((m) => ({
          id: m.id,
          role: m.role as ChatMessage["role"],
          content: m.content,
          targetModel: m.target_model ?? undefined,
          promptTokens: m.prompt_tokens ?? null,
          completionTokens: m.completion_tokens ?? null,
          toolProgress: parseToolCalls(m.tool_calls),
          createdAt: m.created_at,
        }))
      );
    } catch {
      // silent
    }
  }, []);

  // ------------------------------------------------------------------
  // Select search result — navigate to thread and highlight message
  // ------------------------------------------------------------------
  const handleSelectSearchResult = useCallback(
    async (threadId: string, messageId: string) => {
      await handleSelectThread(threadId);
      setHighlightMessageId(messageId);
    },
    [handleSelectThread]
  );

  // ------------------------------------------------------------------
  // Restore saved active thread on first thread load
  // ------------------------------------------------------------------
  const restoredRef = useRef(false);
  useEffect(() => {
    if (restoredRef.current || threads.length === 0) return;
    restoredRef.current = true;
    let savedId: string | null = null;
    try {
      savedId = localStorage.getItem(STORAGE_KEY_ACTIVE_THREAD);
    } catch {
      // ignore
    }
    if (savedId && threads.some((t) => t.id === savedId)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- mount restore
      handleSelectThread(savedId);
    }
  }, [threads, handleSelectThread]);

  // ------------------------------------------------------------------
  // New chat
  // ------------------------------------------------------------------
  const handleNewChat = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setActiveThreadId(null);
    setMessages([]);
    setStreaming(false);
    setStreamingContent("");
    streamingContentRef.current = "";
    setGrounded(false);
    setIncludePrivateInAi(false);
    setAllowModelSave(false);
    setSavedItems({});
    try {
      localStorage.removeItem(STORAGE_KEY_ACTIVE_THREAD);
    } catch {
      // ignore
    }
  }, []);

  // ------------------------------------------------------------------
  // Delete thread
  // ------------------------------------------------------------------
  const handleDeleteThread = useCallback(
    async (id: string) => {
      try {
        await fetch(`/api/chat/threads/${id}`, { method: "DELETE" });
        if (activeThreadId === id) {
          setActiveThreadId(null);
          setMessages([]);
          try {
            localStorage.removeItem(STORAGE_KEY_ACTIVE_THREAD);
          } catch {
            // ignore
          }
        }
        fetchThreads();
      } catch {
        // silent
      }
    },
    [activeThreadId, fetchThreads]
  );

  // ------------------------------------------------------------------
  // Rename thread
  // ------------------------------------------------------------------
  const handleRenameThread = useCallback(
    async (id: string, title: string) => {
      try {
        await fetch(`/api/chat/threads/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title }),
        });
        fetchThreads();
      } catch {
        // silent
      }
    },
    [fetchThreads]
  );

  // ------------------------------------------------------------------
  // Save temporary chat
  // ------------------------------------------------------------------
  const handleSaveChat = useCallback(async () => {
    if (messages.length === 0) return;
    setSavingChat(true);
    try {
      const res = await fetch("/api/chat/threads/save-temporary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          target: { provider, model },
          messages,
        }),
      });
      if (!res.ok) return;
      const data = await res.json();
      await handleSelectThread(data.thread.id);
      fetchThreads();
    } catch {
      // silent
    } finally {
      setSavingChat(false);
    }
  }, [messages, provider, model, fetchThreads, handleSelectThread]);

  // ------------------------------------------------------------------
  // Resolve Hermes approval
  // ------------------------------------------------------------------
  const handleResolveApproval = useCallback(
    async (decision: HermesApprovalDecision) => {
      if (!approvalState?.runId) return;
      const runId = approvalState.runId;
      setApprovalState(undefined);

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: decision,
            runId,
          }),
        });
        if (!res.ok) throw new Error("HTTP " + res.status);
      } catch {
        setStreamError("Failed to resolve approval");
      }
    },
    [approvalState]
  );

  // ------------------------------------------------------------------
  // SSE stream reader helper
  // ------------------------------------------------------------------
  const readSseStream = useCallback(
    async (
      reader: ReadableStreamDefaultReader<Uint8Array>,
      isRegenerate: boolean
    ) => {
      const decoder = new TextDecoder();
      let buffer = "";
      const localToolProgress: ToolProgressItem[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const payload = line.slice(6);

          try {
            const event = JSON.parse(payload);

            if (event.type === "text-delta") {
              const newContent =
                streamingContentRef.current + (event.content as string);
              streamingContentRef.current = newContent;
              setStreamingContent(newContent);
            } else if (event.type === "tool-progress") {
              const tool = String(event.tool ?? "unknown");
              const existing = localToolProgress.find((t) => t.tool === tool);
              if (existing) {
                existing.status =
                  event.status === "completed" ? "completed" : "running";
                existing.label = String(event.label ?? existing.label);
              } else {
                localToolProgress.push({
                  id: `${tool}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                  tool,
                  label: String(event.label ?? ""),
                  status:
                    event.status === "completed" ? "completed" : "running",
                });
              }
              setToolProgress([...localToolProgress]);
            } else if (event.type === "approval-requested") {
              const choices: HermesApprovalDecision[] = Array.isArray(
                event.choices
              )
                ? event.choices
                : ["once", "session", "always", "deny"];
              setApprovalState({
                runId: String(event.runId ?? ""),
                summary: String(event.summary ?? "Action requires approval"),
                command: event.command ? String(event.command) : undefined,
                choices,
              });
            } else if (event.type === "saved") {
              pendingSavedRef.current = {
                itemId: String(event.itemId ?? ""),
                title: String(event.title ?? ""),
              };
            } else if (event.type === "done") {
              // If the user clicked stop, skip the done handler — the
              // finally block will persist the partial content.
              if (stopRequestedRef.current) {
                break;
              }

              const finalContent =
                streamingContentRef.current ||
                (event.output as string | undefined) ||
                "";
              const capturedToolProgress =
                localToolProgress.length > 0
                  ? [...localToolProgress]
                  : undefined;

              // Determine the message index for any pending saved item
              let savedMsgIndex: number | null = null;
              if (pendingSavedRef.current) {
                if (isRegenerate) {
                  savedMsgIndex = messagesRef.current
                    .map((m) => m.role)
                    .lastIndexOf("assistant");
                  if (savedMsgIndex < 0) savedMsgIndex = null;
                } else {
                  savedMsgIndex = messagesRef.current.length;
                }
              }

              if (finalContent) {
                if (isRegenerate) {
                  const assistantId =
                    typeof event.assistantMessageId === "string"
                      ? event.assistantMessageId
                      : undefined;
                  setMessages((msgs) => {
                    const lastAssistantIdx = msgs
                      .map((m) => m.role)
                      .lastIndexOf("assistant");
                    if (lastAssistantIdx >= 0) {
                      const updated = [...msgs];
                      updated[lastAssistantIdx] = {
                        ...updated[lastAssistantIdx],
                        id: assistantId ?? updated[lastAssistantIdx].id,
                        role: "assistant",
                        content: finalContent,
                        targetModel: model,
                        toolProgress: capturedToolProgress,
                        promptTokens: (event.promptTokens as number) ?? null,
                        completionTokens:
                          (event.completionTokens as number) ?? null,
                        createdAt: new Date().toISOString(),
                      };
                      return updated;
                    }
                    return [
                      ...msgs,
                      {
                        id: assistantId,
                        role: "assistant",
                        content: finalContent,
                        targetModel: model,
                        toolProgress: capturedToolProgress,
                        promptTokens: (event.promptTokens as number) ?? null,
                        completionTokens:
                          (event.completionTokens as number) ?? null,
                        createdAt: new Date().toISOString(),
                      },
                    ];
                  });
                } else {
                  const userId =
                    typeof event.userMessageId === "string"
                      ? event.userMessageId
                      : undefined;
                  const assistantId =
                    typeof event.assistantMessageId === "string"
                      ? event.assistantMessageId
                      : undefined;
                  setMessages((msgs) => {
                    const updated = [...msgs];
                    const lastUserIdx = updated
                      .map((m) => m.role)
                      .lastIndexOf("user");
                    if (lastUserIdx >= 0 && userId) {
                      updated[lastUserIdx] = {
                        ...updated[lastUserIdx],
                        id: userId,
                      };
                    }
                    return [
                      ...updated,
                      {
                        id: assistantId,
                        role: "assistant",
                        content: finalContent,
                        targetModel: model,
                        toolProgress: capturedToolProgress,
                        promptTokens: (event.promptTokens as number) ?? null,
                        completionTokens:
                          (event.completionTokens as number) ?? null,
                        createdAt: new Date().toISOString(),
                      },
                    ];
                  });
                }
              }

              // Assign saved item info to the computed message index
              if (pendingSavedRef.current && savedMsgIndex !== null) {
                setSavedItems((prev) => ({
                  ...prev,
                  [savedMsgIndex!]: {
                    itemId: pendingSavedRef.current!.itemId,
                    title: pendingSavedRef.current!.title,
                  },
                }));
                pendingSavedRef.current = null;
              }

              streamingContentRef.current = "";
              setStreamingContent("");
              setStreaming(false);
              setRegenerating(false);
              setToolProgress([]);
              setApprovalState(undefined);

              if (
                !isRegenerate &&
                event.threadId &&
                !activeThreadId &&
                !temporary
              ) {
                setActiveThreadId(event.threadId as string);
                fetchThreads();
                for (const t of titlePollTimersRef.current) clearTimeout(t);
                titlePollTimersRef.current = [];
                for (const delay of [3_000, 7_000, 12_000, 20_000]) {
                  titlePollTimersRef.current.push(
                    setTimeout(() => fetchThreads(), delay)
                  );
                }
              }
            } else if (event.type === "error") {
              setStreamError(
                (event.message as string) ?? "Stream error — try regenerating"
              );
              setStreaming(false);
              setRegenerating(false);
              setToolProgress([]);
              setApprovalState(undefined);
            }
          } catch {
            // Skip unparseable lines
          }
        }
      }
    },
    [activeThreadId, temporary, fetchThreads, model]
  );

  const persistPartialAssistantContent = useCallback(
    (partialContent: string) => {
      if (!partialContent) return;
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: partialContent,
          targetModel: modelRef.current,
          createdAt: new Date().toISOString(),
        } as ChatMessage,
      ]);
      if (!temporary && activeThreadId) {
        fetch("/api/chat/messages/stop", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            threadId: activeThreadId,
            content: partialContent,
          }),
        }).catch(() => {});
      }
    },
    [temporary, activeThreadId]
  );

  // ------------------------------------------------------------------
  // Send message
  // ------------------------------------------------------------------
  const handleSend = useCallback(
    async (message: string) => {
      const userMsg: ChatMessage = {
        role: "user",
        content: message,
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, userMsg]);
      setStreaming(true);
      setStreamingContent("");
      setStreamError(null);
      setToolProgress([]);
      setApprovalState(undefined);
      streamingContentRef.current = "";

      const controller = new AbortController();
      abortRef.current = controller;

      const streamId = ++currentStreamIdRef.current;
      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            threadId: activeThreadId,
            target: { provider, model },
            grounded,
            includePrivateInAi,
            allowModelSave,
            message,
            temporary,
          }),
          signal: controller.signal,
        });

        if (!res.ok) {
          setStreaming(false);
          return;
        }

        const reader = res.body?.getReader();
        if (!reader) {
          setStreaming(false);
          return;
        }

        await readSseStream(reader, false);
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setStreaming(false);
        }
      } finally {
        if (streamId !== currentStreamIdRef.current) return;

        if (stopRequestedRef.current) {
          persistPartialAssistantContent(streamingContentRef.current);
          stopRequestedRef.current = false;
        }
        abortRef.current = null;
        setStreaming(false);
        setStreamingContent("");
        streamingContentRef.current = "";
      }
    },
    [
      activeThreadId,
      provider,
      model,
      temporary,
      allowModelSave,
      readSseStream,
      grounded,
      includePrivateInAi,
      persistPartialAssistantContent,
    ]
  );

  // ------------------------------------------------------------------
  // Regenerate (retry last assistant response)
  // ------------------------------------------------------------------
  const handleRegenerate = useCallback(async () => {
    if (!activeThreadId || streaming) return;
    setRegenerating(true);
    setStreaming(true);
    setStreamingContent("");
    setStreamError(null);
    setToolProgress([]);
    setApprovalState(undefined);
    streamingContentRef.current = "";

    const controller = new AbortController();
    abortRef.current = controller;

    const streamId = ++currentStreamIdRef.current;
    try {
      const res = await fetch("/api/chat/regenerate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          threadId: activeThreadId,
          target: { provider, model },
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        setStreaming(false);
        setRegenerating(false);
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) {
        setStreaming(false);
        setRegenerating(false);
        return;
      }

      await readSseStream(reader, true);
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setStreaming(false);
        setRegenerating(false);
      }
    } finally {
      if (streamId !== currentStreamIdRef.current) return;

      if (stopRequestedRef.current) {
        persistPartialAssistantContent(streamingContentRef.current);
        stopRequestedRef.current = false;
      }
      abortRef.current = null;
      setStreaming(false);
      setRegenerating(false);
      setStreamingContent("");
      streamingContentRef.current = "";
    }
  }, [
    activeThreadId,
    streaming,
    readSseStream,
    provider,
    model,
    persistPartialAssistantContent,
  ]);

  // ------------------------------------------------------------------
  // Save message content to ShadowBrain (explicit "Save" button)
  // ------------------------------------------------------------------
  const handleSaveContent = useCallback(
    async (
      content: string,
      title: string | null,
      type: string,
      messageIndex: number
    ) => {
      try {
        const res = await fetch("/api/items", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type,
            content,
            title,
            source: "chat",
          }),
        });
        if (!res.ok) return;
        const data = await res.json();
        setSavedItems((prev) => ({
          ...prev,
          [messageIndex]: {
            itemId: data.id as string,
            title: (data.title as string) ?? content.slice(0, 80),
          },
        }));
      } catch {
        // silent
      }
    },
    []
  );

  // ------------------------------------------------------------------
  // Branch a thread from a specific message
  // ------------------------------------------------------------------
  const handleBranch = useCallback(
    async (messageIndex: number) => {
      const msg = messagesRef.current[messageIndex];
      if (!activeThreadId || !msg?.id) return;

      try {
        const res = await fetch(`/api/chat/threads/${activeThreadId}/branch`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fromMessageId: msg.id }),
        });
        if (!res.ok) return;
        const data = await res.json();
        const newThread = data.thread as ThreadInfo;
        await fetchThreads();
        await handleSelectThread(newThread.id);
      } catch {
        // silent
      }
    },
    [activeThreadId, fetchThreads, handleSelectThread]
  );

  // ------------------------------------------------------------------
  // Stop assistant stream
  // ------------------------------------------------------------------
  const handleStop = useCallback(() => {
    stopRequestedRef.current = true;
    if (abortRef.current) {
      abortRef.current.abort();
      // Don't null abortRef here — the finally block in handleSend
      // will do it. The catch block uses stopRequestedRef to know
      // this was an intentional stop and should commit the partial.
    }
  }, []);

  // ------------------------------------------------------------------
  // Edit user message (truncate + regenerate)
  // ------------------------------------------------------------------
  const handleEditMessage = useCallback(
    async (messageIndex: number, messageId: string, newContent: string) => {
      // 0. Abort any in-flight stream (don't null abortRef — the
      //    existing stream's finally block handles cleanup).
      if (abortRef.current) {
        abortRef.current.abort();
      }

      // 1. Truncate local messages to this index
      setMessages((msgs) => {
        const truncated = msgs.slice(0, messageIndex + 1);
        truncated[messageIndex] = {
          ...truncated[messageIndex],
          content: newContent,
        };
        return truncated;
      });

      // 2. Start streaming
      setStreaming(true);
      setStreamingContent("");
      setStreamError(null);
      setToolProgress([]);
      setApprovalState(undefined);
      streamingContentRef.current = "";

      const controller = new AbortController();
      abortRef.current = controller;

      const streamId = ++currentStreamIdRef.current;
      try {
        const res = await fetch(`/api/chat/messages/${messageId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content: newContent,
            target: { provider, model },
          }),
          signal: controller.signal,
        });

        if (!res.ok) {
          setStreaming(false);
          return;
        }

        const reader = res.body?.getReader();
        if (!reader) {
          setStreaming(false);
          return;
        }

        // Re-use readSseStream — set isRegenerate=false so the "done"
        // handler appends a new assistant message (we already truncated).
        await readSseStream(reader, false);
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setStreaming(false);
        }
      } finally {
        if (streamId !== currentStreamIdRef.current) return;

        if (stopRequestedRef.current) {
          persistPartialAssistantContent(streamingContentRef.current);
          stopRequestedRef.current = false;
        }
        abortRef.current = null;
        setStreaming(false);
        setStreamingContent("");
        streamingContentRef.current = "";
      }
    },
    [provider, model, readSseStream, persistPartialAssistantContent]
  );

  // ------------------------------------------------------------------
  // Is there a temporary chat with messages to show "Save chat"?
  // ------------------------------------------------------------------
  const showSaveChat = temporary && messages.length > 0 && !activeThreadId;

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------
  return (
    <div
      ref={containerRef}
      className="flex flex-1 overflow-hidden"
      style={{
        maxHeight: containerHeight ? `${containerHeight}px` : undefined,
      }}
    >
      {/* Desktop: inline sidebar */}
      {!isMobile && (
        <ThreadList
          threads={threads}
          activeThreadId={activeThreadId}
          onSelectThread={(id) => {
            handleSelectThread(id);
            setMobileSidebarOpen(false);
          }}
          onNewChat={() => {
            handleNewChat();
            setMobileSidebarOpen(false);
          }}
          onDeleteThread={handleDeleteThread}
          onRenameThread={handleRenameThread}
          onSelectSearchResult={handleSelectSearchResult}
        />
      )}

      <main className="flex flex-1 flex-col overflow-hidden">
        {/* Mobile: hamburger + Sheet for thread list */}
        {isMobile && (
          <div className="border-border flex shrink-0 items-center gap-2 border-b px-2 py-1.5 md:hidden">
            <Sheet open={mobileSidebarOpen} onOpenChange={setMobileSidebarOpen}>
              <SheetTrigger
                className="text-muted-foreground hover:bg-muted hover:text-foreground inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors"
                aria-label="Open threads"
              >
                <Menu className="h-4 w-4" />
              </SheetTrigger>
              <SheetContent side="left" className="p-0" showCloseButton={false}>
                <ThreadList
                  className="h-full border-0"
                  threads={threads}
                  activeThreadId={activeThreadId}
                  onSelectThread={(id) => {
                    handleSelectThread(id);
                    setMobileSidebarOpen(false);
                  }}
                  onNewChat={() => {
                    handleNewChat();
                    setMobileSidebarOpen(false);
                  }}
                  onDeleteThread={handleDeleteThread}
                  onRenameThread={handleRenameThread}
                  onSelectSearchResult={handleSelectSearchResult}
                />
              </SheetContent>
            </Sheet>
            <span className="text-foreground text-sm font-medium">
              {activeThreadId
                ? (threads.find((t) => t.id === activeThreadId)?.title ??
                  "Chat")
                : "New Chat"}
            </span>
          </div>
        )}

        <MessageList
          messages={messages}
          streaming={streaming}
          streamingContent={streamingContent || undefined}
          onRegenerate={
            activeThreadId && !temporary ? handleRegenerate : undefined
          }
          regenerating={regenerating}
          streamError={streamError}
          toolProgress={toolProgress.length > 0 ? toolProgress : undefined}
          approvalState={approvalState}
          onResolveApproval={handleResolveApproval}
          onSaveContent={handleSaveContent}
          savedItems={savedItems}
          onBranch={activeThreadId ? handleBranch : undefined}
          onEditMessage={handleEditMessage}
          temporary={temporary}
          highlightMessageId={highlightMessageId}
        />
        <ChatInput
          onSend={handleSend}
          disabled={streaming}
          onStop={handleStop}
          provider={provider}
          model={model}
          allModels={allModels}
          onModelSelect={handleModelSelect}
          temporary={temporary}
          onTemporaryChange={(v: boolean) => {
            setTemporary(v);
            if (v && activeThreadId) {
              setActiveThreadId(null);
            }
          }}
          showSaveChat={showSaveChat}
          onSaveChat={handleSaveChat}
          savingChat={savingChat}
          isHermesMode={provider === "hermes"}
          grounded={grounded}
          onGroundedChange={(v: boolean) => {
            setGrounded(v);
            if (!v) {
              setIncludePrivateInAi(false);
              setAllowModelSave(false);
            }
          }}
          includePrivateInAi={includePrivateInAi}
          onIncludePrivateInAiChange={setIncludePrivateInAi}
          allowModelSave={allowModelSave}
          onAllowModelSaveChange={setAllowModelSave}
          totalTokens={totalTokens}
          contextWindow={contextWindow}
        />
      </main>
    </div>
  );
}
