"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { ThreadList } from "@/components/chat/thread-list";
import { MessageList } from "@/components/chat/message-list";
import { ChatInput } from "@/components/chat/chat-input";
import { ChatControls } from "@/components/chat/chat-controls";
import type { ThreadInfo } from "@/components/chat/thread-list";
import type { ModelOption } from "@/components/chat/chat-controls";
import type { ChatMessage } from "@/components/chat/message-list";

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

  const abortRef = useRef<AbortController | null>(null);
  const streamingContentRef = useRef("");
  const modelRef = useRef(model);
  const defaultModelRef = useRef(defaultModel);

  // Sync refs with state (post-render, no extra renders)
  useEffect(() => {
    modelRef.current = model;
    defaultModelRef.current = defaultModel;
  });

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
  useEffect(() => {
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
      setActiveThreadId(id);
      setTemporary(false);
      setMessages(
        (data.messages ?? []).map((m: { role: string; content: string }) => ({
          role: m.role,
          content: m.content,
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
  // Send message
  // ------------------------------------------------------------------
  const handleSend = useCallback(
    async (message: string) => {
      // Add user message to local state
      const userMsg: ChatMessage = { role: "user", content: message };
      setMessages((prev) => [...prev, userMsg]);
      setStreaming(true);
      setStreamingContent("");
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

        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          // Keep the last potentially-incomplete line in the buffer
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
                // Finalize the assistant message
                const finalContent = streamingContentRef.current;
                if (finalContent) {
                  setMessages((msgs) => [
                    ...msgs,
                    { role: "assistant", content: finalContent },
                  ]);
                }
                // Clear streaming state
                streamingContentRef.current = "";
                setStreamingContent("");
                setStreaming(false);

                // Update threadId if new thread was created
                if (event.threadId && !activeThreadId && !temporary) {
                  setActiveThreadId(event.threadId as string);
                  fetchThreads();
                }
              } else if (event.type === "error") {
                setStreaming(false);
              }
            } catch {
              // Skip unparseable lines
            }
          }
        }
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setStreaming(false);
        }
      } finally {
        abortRef.current = null;
      }
    },
    [activeThreadId, provider, model, temporary, fetchThreads]
  );

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
              // Switching to temporary mode with an active thread
              // Just clear the threadId - messages are already loaded
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
