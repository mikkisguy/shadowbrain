"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { ThreadList } from "@/components/chat/thread-list";
import { MessageList } from "@/components/chat/message-list";
import { ChatInput } from "@/components/chat/chat-input";
import { ChatControls } from "@/components/chat/chat-controls";
import type { ThreadInfo } from "@/components/chat/thread-list";
import type { ModelOption } from "@/components/chat/chat-controls";
import type { ChatMessage } from "@/components/chat/message-list";
import { getModelContextWindow } from "@/lib/chat/model-metadata";

const DEFAULT_PROVIDER = "opencode-go";

export default function ChatPage() {
  // ------------------------------------------------------------------
  // State
  // ------------------------------------------------------------------
  const [threads, setThreads] = useState<ThreadInfo[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streamingContent, setStreamingContent] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [temporary, setTemporary] = useState(false);
  const [provider, setProvider] = useState(DEFAULT_PROVIDER);
  const [model, setModel] = useState("");
  const [models, setModels] = useState<ModelOption[]>([]);
  const [defaultModel, setDefaultModel] = useState("");
  const [savingChat, setSavingChat] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const streamingContentRef = useRef("");
  const modelRef = useRef(model);
  const defaultModelRef = useRef(defaultModel);
  const titlePollTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Sync refs with state (post-render, no extra renders)
  useEffect(() => {
    modelRef.current = model;
    defaultModelRef.current = defaultModel;
  });

  // Clear title-poll timers on unmount
  useEffect(() => {
    return () => {
      for (const t of titlePollTimersRef.current) clearTimeout(t);
    };
  }, []);

  // ------------------------------------------------------------------
  // Derived: context window usage — use the largest prompt_tokens seen,
  // since each turn's prompt already includes all prior history.
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

  // Fetch threads on mount with cleanup
  useEffect(() => {
    const controller = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mounted data fetch
    fetchThreads(controller.signal);
    return () => controller.abort();
  }, [fetchThreads]);
  useEffect(() => {
    fetch("/api/chat/models")
      .then((res) => res.json())
      .then((data) => {
        const allModels: Record<string, ModelOption[]> = data.models ?? {};
        const goModels = allModels["opencode-go"] ?? [];
        setModels(goModels);
        if (data.defaultOpenCodeGoModel) {
          setDefaultModel(data.defaultOpenCodeGoModel);
          setModel(data.defaultOpenCodeGoModel);
        } else if (goModels.length > 0) {
          setModel(goModels[0].id);
        }
      })
      .catch(() => {});
  }, []);

  // ------------------------------------------------------------------
  // Update models when provider changes
  // ------------------------------------------------------------------
  const providerEffectSkipRef = useRef(true);

  useEffect(() => {
    // Skip the initial mount — model selection is handled by the [] effect above.
    if (providerEffectSkipRef.current) {
      providerEffectSkipRef.current = false;
      return;
    }

    const currentModel = modelRef.current;
    const currentDefaultModel = defaultModelRef.current;
    fetch("/api/chat/models")
      .then((res) => res.json())
      .then((data) => {
        const allModels: Record<string, ModelOption[]> = data.models ?? {};
        const providerModels = allModels[provider] ?? [];
        setModels(providerModels);
        // Auto-select first model if current not in list
        if (
          providerModels.length > 0 &&
          !providerModels.some((m) => m.id === currentModel)
        ) {
          const preferred =
            provider === "opencode-go" && currentDefaultModel
              ? providerModels.find((m) => m.id === currentDefaultModel)
              : null;
          setModel(preferred?.id ?? providerModels[0].id);
        }
      })
      .catch(() => {});
  }, [provider, modelRef, defaultModelRef]);

  // ------------------------------------------------------------------
  // Select a thread — auto-selects last-used model + loads messages
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
        created_at: string;
      }>;

      setActiveThreadId(id);
      setTemporary(false);

      // Auto-select provider + model from thread
      if (thread.target_provider) {
        setProvider(thread.target_provider);
      }
      if (thread.target_model) {
        setModel(thread.target_model);
      }

      // Map messages with metadata
      setMessages(
        rawMessages.map((m) => ({
          id: m.id,
          role: m.role as ChatMessage["role"],
          content: m.content,
          targetModel: m.target_model ?? undefined,
          promptTokens: m.prompt_tokens ?? null,
          completionTokens: m.completion_tokens ?? null,
          createdAt: m.created_at,
        }))
      );
    } catch {
      // silent
    }
  }, []);

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
      setActiveThreadId(data.thread.id);
      setTemporary(false);
      fetchThreads();
    } catch {
      // silent
    } finally {
      setSavingChat(false);
    }
  }, [messages, provider, model, fetchThreads]);

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
            } else if (event.type === "done") {
              const finalContent = streamingContentRef.current;
              if (finalContent) {
                if (isRegenerate) {
                  // Replace the last assistant message
                  setMessages((msgs) => {
                    const lastAssistantIdx = msgs
                      .map((m) => m.role)
                      .lastIndexOf("assistant");
                    if (lastAssistantIdx >= 0) {
                      const updated = [...msgs];
                      updated[lastAssistantIdx] = {
                        role: "assistant",
                        content: finalContent,
                        targetModel: model,
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
                        role: "assistant",
                        content: finalContent,
                        targetModel: model,
                        promptTokens: (event.promptTokens as number) ?? null,
                        completionTokens:
                          (event.completionTokens as number) ?? null,
                        createdAt: new Date().toISOString(),
                      },
                    ];
                  });
                } else {
                  setMessages((msgs) => [
                    ...msgs,
                    {
                      role: "assistant",
                      content: finalContent,
                      targetModel: model,
                      promptTokens: (event.promptTokens as number) ?? null,
                      completionTokens:
                        (event.completionTokens as number) ?? null,
                      createdAt: new Date().toISOString(),
                    },
                  ]);
                }
              }
              streamingContentRef.current = "";
              setStreamingContent("");
              setStreaming(false);
              setRegenerating(false);

              if (
                !isRegenerate &&
                event.threadId &&
                !activeThreadId &&
                !temporary
              ) {
                setActiveThreadId(event.threadId as string);
                fetchThreads();
                // Title generation runs async (can take 5-10s for reasoning
                // models). Poll a few times to pick up the generated title.
                // Clear any prior timers to avoid stacking on rapid sends.
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
            }
          } catch {
            // Skip unparseable lines
          }
        }
      }
    },
    [activeThreadId, temporary, fetchThreads, model]
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
      streamingContentRef.current = "";

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            threadId: activeThreadId,
            target: { provider, model },
            grounded: false,
            allowModelSave: false,
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
        abortRef.current = null;
      }
    },
    [activeThreadId, provider, model, temporary, readSseStream]
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
    streamingContentRef.current = "";

    const controller = new AbortController();
    abortRef.current = controller;

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
      abortRef.current = null;
    }
  }, [activeThreadId, streaming, readSseStream, provider, model]);

  // ------------------------------------------------------------------
  // Is there a temporary chat with messages to show "Save chat"?
  // ------------------------------------------------------------------
  const showSaveChat = temporary && messages.length > 0 && !activeThreadId;

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------
  return (
    <div className="flex flex-1 overflow-hidden">
      <ThreadList
        threads={threads}
        activeThreadId={activeThreadId}
        onSelectThread={handleSelectThread}
        onNewChat={handleNewChat}
        onDeleteThread={handleDeleteThread}
        onRenameThread={handleRenameThread}
      />
      <main className="flex flex-1 flex-col overflow-hidden">
        <MessageList
          messages={messages}
          streaming={streaming}
          streamingContent={streamingContent || undefined}
          totalTokens={totalTokens}
          contextWindow={contextWindow}
          onRegenerate={
            activeThreadId && !temporary ? handleRegenerate : undefined
          }
          regenerating={regenerating}
          streamError={streamError}
        />
        <ChatControls
          provider={provider}
          onProviderChange={setProvider}
          model={model}
          onModelChange={setModel}
          models={models}
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
        />
        <ChatInput onSend={handleSend} disabled={streaming} />
      </main>
    </div>
  );
}
