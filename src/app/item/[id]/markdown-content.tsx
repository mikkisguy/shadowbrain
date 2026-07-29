"use client";

/**
 * Render item content as GitHub-flavoured markdown.
 *
 * The item detail page (issue #25) reads `content_items.content` as a
 * server component and hands the raw string to this client component.
 * `react-markdown` is client-side by design (it relies on React
 * context for its component overrides), so the page stays a server
 * component and this is the leaf that renders the body.
 *
 * Styling is expressed through the design-system tokens declared in
 * `globals.css` (no `@tailwindcss/typography` plugin — every element
 * is styled explicitly so the markdown matches the rest of the app's
 * editorial look: serif headings, sans body, mono code).
 *
 * Limited raw HTML is enabled for native details/summary collapsibles,
 * then sanitized with rehype-sanitize while preserving its defaults.
 */
import {
  createContext,
  memo,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ComponentPropsWithoutRef,
} from "react";
import Markdown, { type Components } from "react-markdown";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { toggleTaskAt } from "@/lib/markdown/toggle-task";
import { cn } from "@/lib/utils";

const sanitizeSchema = {
  ...defaultSchema,
  tagNames: [...(defaultSchema.tagNames ?? []), "details", "summary"],
  attributes: {
    ...defaultSchema.attributes,
    details: [...(defaultSchema.attributes?.details ?? []), "open"],
    input: [
      ...(defaultSchema.attributes?.input ?? []),
      "dataSbTask",
      "ariaLabel",
    ],
  },
};

interface HastNode {
  value?: unknown;
  type?: string;
  tagName?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
}

function taskLabel(ancestors: HastNode[]): string {
  const listItem = [...ancestors]
    .reverse()
    .find((node) => node.type === "element" && node.tagName === "li");
  if (!listItem) return "";
  const firstBlock = (listItem.children ?? []).find(
    (child) =>
      child.type === "element" &&
      child.tagName !== "input" &&
      child.tagName !== "ul" &&
      child.tagName !== "ol"
  );

  const visibleText = (node: HastNode): string => {
    if (
      node.type === "element" &&
      (node.tagName === "ul" ||
        node.tagName === "ol" ||
        node.tagName === "input")
    ) {
      return "";
    }
    if (node.type === "text") return String(node.value ?? "");
    return (node.children ?? []).map(visibleText).join("");
  };

  const source =
    firstBlock?.tagName === "p"
      ? [firstBlock]
      : (listItem.children ?? []).filter(
          (child) =>
            !(
              child.type === "element" &&
              (child.tagName === "ul" ||
                child.tagName === "ol" ||
                child.tagName === "input")
            )
        );
  return source.map(visibleText).join(" ").replace(/\s+/g, " ").trim();
}

function stampGfmTasks(nonce: string) {
  return function attacher() {
    return function transformer(tree: HastNode) {
      let index = 0;
      const walk = (node: HastNode, ancestors: HastNode[] = []) => {
        if (
          node.type === "element" &&
          node.tagName === "input" &&
          node.properties?.type === "checkbox"
        ) {
          const label = taskLabel(ancestors);
          node.properties["data-sb-task"] = `${nonce}:${index}`;
          node.properties["aria-label"] = label || `Task ${index + 1}`;
          index += 1;
        }
        for (const child of node.children ?? [])
          walk(child, [...ancestors, node]);
      };
      walk(tree);
    };
  };
}

function createTaskNonce(): string {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
  );
}

interface MarkdownTaskContextValue {
  interactive: boolean;
  taskNonce: string;
  onToggleTask: (index: number) => void;
}

const MarkdownTaskContext = createContext<MarkdownTaskContextValue | null>(
  null
);

/**
 * Strip react-markdown's `node` prop (the underlying hast node) before
 * spreading the remaining props onto a DOM element. React would
 * otherwise warn about the unrecognised `node` attribute. Done with a
 * copy + delete rather than a destructure so no unused binding is
 * introduced (the linter treats rest siblings as unused by default).
 */
function rest<T extends { node?: unknown }>(props: T): Omit<T, "node"> {
  const copy: Record<string, unknown> = { ...props };
  delete copy.node;
  return copy as Omit<T, "node">;
}

/** Inline-code styling, applied to every `<code>`. Block code is a
 *  `<pre><code>`; the `pre` override below neutralises these classes
 *  on its direct child so fenced blocks read as a solid code panel. */
const INLINE_CODE_CLASS =
  "bg-surface-muted border-border rounded-sm border px-1.5 py-0.5 font-mono text-[0.85em]";

type MarkdownInputProps = ComponentPropsWithoutRef<"input"> & {
  node?: unknown;
};

function MarkdownInput(props: MarkdownInputProps) {
  const taskContext = useContext(MarkdownTaskContext);
  const inputType = props.type ?? "checkbox";
  const rawProps = props as Record<string, unknown>;
  const taskTokenValue =
    rawProps["data-sb-task"] ?? rawProps.dataSbTask ?? rawProps["dataSbTask"];
  const taskToken =
    taskTokenValue === undefined || taskTokenValue === null
      ? ""
      : String(taskTokenValue);
  const tokenParts = taskToken.split(":");
  const taskIndex =
    tokenParts[0] === taskContext?.taskNonce &&
    tokenParts.length === 2 &&
    /^\d+$/.test(tokenParts[1])
      ? Number(tokenParts[1])
      : -1;
  const enabled =
    inputType === "checkbox" &&
    taskContext?.interactive === true &&
    taskIndex >= 0;

  const handleChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      if (!enabled) return;
      event.preventDefault();
      taskContext?.onToggleTask(taskIndex);
    },
    [enabled, taskContext, taskIndex]
  );

  // GFM unchecked tasks often omit the `checked` attribute, so spreading
  // props leaves `checked={undefined}` (uncontrolled). After a toggle the
  // same input can receive `checked={true}` and React warns about flipping
  // uncontrolled → controlled. Always coerce checkbox checked to a boolean.
  // Visual chrome lives in `.app-checkbox` (globals.css) so the checkmark
  // background-image is not wiped by Tailwind `bg-*` shorthand.
  return (
    <input
      {...rest(props)}
      type={inputType}
      {...(inputType === "checkbox" ? { checked: Boolean(props.checked) } : {})}
      disabled={!enabled}
      onChange={enabled ? handleChange : undefined}
      data-interactive={
        inputType === "checkbox" ? String(Boolean(enabled)) : undefined
      }
      className={
        inputType === "checkbox" ? "app-checkbox app-checkbox--task" : undefined
      }
    />
  );
}

const components: Components = {
  h1: (props) => (
    <h1
      className="text-foreground mt-2 font-serif text-2xl leading-tight font-semibold tracking-[-0.01em] break-words"
      {...rest(props)}
    />
  ),
  h2: (props) => (
    <h2
      className="text-foreground mt-2 font-serif text-xl leading-snug font-semibold tracking-[-0.01em] break-words"
      {...rest(props)}
    />
  ),
  h3: (props) => (
    <h3
      className="text-foreground mt-2 font-sans text-lg leading-snug font-semibold break-words"
      {...rest(props)}
    />
  ),
  h4: (props) => (
    <h4
      className="text-foreground mt-2 font-sans text-base font-semibold break-words"
      {...rest(props)}
    />
  ),
  h5: (props) => (
    <h5
      className="text-foreground mt-2 font-sans text-sm font-semibold"
      {...rest(props)}
    />
  ),
  h6: (props) => (
    <h6
      className="text-muted-foreground mt-2 font-sans text-sm font-semibold"
      {...rest(props)}
    />
  ),
  p: (props) => (
    <p
      className="text-foreground leading-relaxed wrap-break-word"
      {...rest(props)}
    />
  ),
  a: (props) => {
    // External / absolute links open in a new tab with a safe rel.
    // Relative links and in-page anchors stay in-tab so internal
    // navigation behaves like the rest of the app.
    const external =
      typeof props.href === "string" && /^https?:\/\//i.test(props.href);
    return (
      <a
        {...rest(props)}
        target={external ? "_blank" : undefined}
        rel={external ? "noopener noreferrer" : undefined}
        className="text-primary break-all hover:underline"
      />
    );
  },
  ul: (props) => (
    <ul
      {...rest(props)}
      className={cn(
        "text-foreground marker:text-muted-foreground flex list-disc flex-col gap-1 pl-6",
        // remark-gfm task lists: drop disc markers and tighten the
        // checkbox + label row so checklists read like app controls.
        "[&.contains-task-list]:list-none [&.contains-task-list]:gap-1.5 [&.contains-task-list]:pl-0",
        props.className
      )}
    />
  ),
  ol: (props) => (
    <ol
      {...rest(props)}
      className={cn(
        "text-foreground marker:text-muted-foreground flex list-decimal flex-col gap-1 pl-6",
        "[&.contains-task-list]:list-none [&.contains-task-list]:gap-1.5 [&.contains-task-list]:pl-0",
        props.className
      )}
    />
  ),
  li: (props) => (
    <li
      {...rest(props)}
      className={cn(
        "text-foreground leading-relaxed wrap-break-word",
        "[&.task-list-item]:pl-0 [&.task-list-item>input]:mr-2.5 [&.task-list-item>input]:align-baseline",
        props.className
      )}
    />
  ),
  // Inline `<code>` gets the chip styling; fenced code is `<pre><code>`.
  // Spread the forwarded props first, then merge the chip class with
  // any `language-*` class so the `pre` override below actually has
  // something to neutralise (and a future syntax-highlighter keeps the
  // language hook).
  code: (props) => (
    <code {...rest(props)} className={cn(INLINE_CODE_CLASS, props.className)} />
  ),
  pre: (props) => (
    <pre
      {...rest(props)}
      className={
        "bg-surface-muted border-border overflow-x-auto rounded-sm border p-4 font-mono text-sm leading-relaxed " +
        // Neutralise the inline-code chip on the wrapped `<code>`:
        // the `code` override keeps the chip classes, so fenced blocks
        // would otherwise inherit them — these reset them.
        "[&>code]:border-0 [&>code]:bg-transparent [&>code]:p-0 [&>code]:text-[0.95em]"
      }
    />
  ),
  blockquote: (props) => (
    <blockquote
      className="border-border-strong text-muted-foreground border-l-2 pl-4 italic"
      {...rest(props)}
    />
  ),
  hr: (props) => <hr className="border-border border-t" {...rest(props)} />,
  table: (props) => (
    <div className="overflow-x-auto">
      <table
        className="border-border w-full border-collapse text-sm wrap-break-word"
        {...rest(props)}
      />
    </div>
  ),
  thead: (props) => <thead className="text-left" {...rest(props)} />,
  th: (props) => (
    <th
      className="border-border text-foreground border-b px-3 py-1.5 text-left align-top font-semibold"
      {...rest(props)}
    />
  ),
  td: (props) => (
    <td
      className="border-border text-foreground border-b px-3 py-1.5 align-top"
      {...rest(props)}
    />
  ),
  // `alt=""` is the decorative default; react-markdown forwards the
  // real `alt` (from `![alt](src)`) through the spread, overriding it.
  // Note: external images load directly (no proxy), which reveals the
  // viewer's IP to the image host — acceptable for this single-user app.
  img: (props) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      alt=""
      loading="lazy"
      decoding="async"
      className="border-border h-auto max-w-full rounded-sm border"
      {...rest(props)}
    />
  ),
  details: (props) => (
    <details
      className="border-border rounded-sm border-l-2 px-4 py-1.5"
      {...rest(props)}
    />
  ),
  summary: (props) => (
    <summary
      className="text-foreground cursor-pointer py-1.5 leading-snug font-semibold"
      {...rest(props)}
    />
  ),
  // remark-gfm task-list items get a checkbox. The input component uses
  // context to keep read-only previews disabled while interactive item
  // pages toggle the corresponding source task.
  input: MarkdownInput,
};

class SaveConflictError extends Error {}

export interface MarkdownContentProps {
  content: string;
  updatedAt?: string;
  className?: string;
  interactive?: boolean;
  itemId?: string;
  onContentSaved?: (content: string, updatedAt?: string) => void;
  onContentReloadNeeded?: () => void;
}

export const MarkdownContent = memo(function MarkdownContent({
  content,
  updatedAt,
  className,
  interactive,
  itemId,
  onContentSaved,
  onContentReloadNeeded,
}: MarkdownContentProps) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  // Stable per-mount nonce so generated GFM task stamps survive remounts
  // of child markdown while remaining distinct from raw HTML inputs.
  const [taskNonce] = useState(createTaskNonce);
  const [displayContent, setDisplayContent] = useState(content);
  const displayContentRef = useRef(content);
  const displayUpdatedAtRef = useRef(updatedAt ?? "");
  const lastSavedContentRef = useRef(content);
  const lastSavedUpdatedAtRef = useRef(updatedAt ?? "");
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const pendingSaveCountRef = useRef(0);
  const [pendingSaveCount, setPendingSaveCount] = useState(0);
  const saveGenerationRef = useRef(0);
  const isReconcilingRef = useRef(false);
  const isInteractive =
    interactive === true &&
    typeof itemId === "string" &&
    itemId.trim().length > 0;
  const itemUrl = useMemo(
    () =>
      `/api/items/${encodeURIComponent(itemId ?? "")}?include_hidden=1&include_private=1`,
    [itemId]
  );

  const scrollRestoreRef = useRef<{
    parent: HTMLElement | "window";
    top: number;
  } | null>(null);
  const captureScroll = useCallback(() => {
    const root = containerRef.current;
    let scrollParent: HTMLElement | null = root?.parentElement ?? null;
    while (scrollParent && scrollParent !== document.body) {
      const style = window.getComputedStyle(scrollParent);
      if (
        style.overflowY === "auto" ||
        style.overflowY === "scroll" ||
        style.overflowY === "overlay"
      ) {
        break;
      }
      scrollParent = scrollParent.parentElement;
    }
    const useWindow =
      !scrollParent ||
      scrollParent === document.body ||
      scrollParent === document.documentElement;
    scrollRestoreRef.current = {
      parent: useWindow ? "window" : (scrollParent as HTMLElement),
      top: useWindow ? window.scrollY : (scrollParent as HTMLElement).scrollTop,
    };
  }, []);

  const preserveScroll = useCallback(
    (mutate: () => void) => {
      captureScroll();
      mutate();
    },
    [captureScroll]
  );

  useLayoutEffect(() => {
    const restore = scrollRestoreRef.current;
    if (!restore) return;
    scrollRestoreRef.current = null;
    if (restore.parent === "window") {
      window.scrollTo({ top: restore.top, left: window.scrollX });
    } else {
      restore.parent.scrollTop = restore.top;
    }
  }, [displayContent]);

  useEffect(() => {
    if (pendingSaveCountRef.current > 0 || isReconcilingRef.current) return;

    const incomingUpdatedAt = updatedAt ?? "";
    const committedUpdatedAt = lastSavedUpdatedAtRef.current;

    // Chat streaming / add+edit live previews omit revisions and treat
    // `content` as a fully controlled prop. Keep that path content-driven.
    // Interactive surfaces pass updatedAt and stay revision-gated so a
    // stale A/t0 prop cannot clobber a committed B/t1 save.
    if (incomingUpdatedAt === "" && committedUpdatedAt === "") {
      if (content === displayContentRef.current) return;
      preserveScroll(() => {
        displayContentRef.current = content;
        lastSavedContentRef.current = content;
        setDisplayContent(content);
      });
      return;
    }

    const isNewer =
      incomingUpdatedAt !== "" &&
      (committedUpdatedAt === "" || incomingUpdatedAt > committedUpdatedAt);

    if (content === displayContentRef.current) {
      if (isNewer) {
        displayUpdatedAtRef.current = incomingUpdatedAt;
        lastSavedUpdatedAtRef.current = incomingUpdatedAt;
      }
      return;
    }

    if (!isNewer) return;

    preserveScroll(() => {
      displayContentRef.current = content;
      displayUpdatedAtRef.current = incomingUpdatedAt;
      lastSavedContentRef.current = content;
      lastSavedUpdatedAtRef.current = incomingUpdatedAt;
      setDisplayContent(content);
    });
  }, [content, pendingSaveCount, preserveScroll, updatedAt]);

  const enqueueSave = useCallback(
    (nextContent: string) => {
      if (!isInteractive || !itemId || isReconcilingRef.current) return;

      const generation = saveGenerationRef.current;
      pendingSaveCountRef.current += 1;
      setPendingSaveCount((count) => count + 1);
      const save = async () => {
        if (
          isReconcilingRef.current ||
          generation !== saveGenerationRef.current
        ) {
          return;
        }

        const expectedUpdatedAt = displayUpdatedAtRef.current;
        const response = await fetch(itemUrl, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content: nextContent,
            ...(expectedUpdatedAt
              ? { expected_updated_at: expectedUpdatedAt }
              : {}),
          }),
        });
        if (response.status === 409) {
          saveGenerationRef.current += 1;
          isReconcilingRef.current = true;
          throw new SaveConflictError();
        }
        if (!response.ok) {
          throw new Error("Failed to save checklist changes.");
        }

        const saved = (await response.json()) as {
          item?: { content?: unknown; updated_at?: unknown };
        } | null;
        const savedContent =
          typeof saved?.item?.content === "string"
            ? saved.item.content
            : nextContent;
        const savedUpdatedAt =
          typeof saved?.item?.updated_at === "string"
            ? saved.item.updated_at
            : expectedUpdatedAt;
        displayUpdatedAtRef.current = savedUpdatedAt;
        lastSavedContentRef.current = savedContent;
        lastSavedUpdatedAtRef.current = savedUpdatedAt;
        onContentSaved?.(savedContent, savedUpdatedAt);
        if (!onContentSaved) {
          preserveScroll(() => router.refresh());
        }
      };

      saveQueueRef.current = saveQueueRef.current
        .catch(() => undefined)
        .then(save)
        .catch(async (error: unknown) => {
          if (error instanceof SaveConflictError) {
            toast.error(
              "This item changed elsewhere. The latest content was loaded."
            );
            try {
              const latestResponse = await fetch(itemUrl);
              if (!latestResponse.ok) throw new Error("Failed to reload item.");
              const latest = (await latestResponse.json()) as {
                item?: { content?: unknown; updated_at?: unknown };
              } | null;
              const latestContent =
                typeof latest?.item?.content === "string"
                  ? latest.item.content
                  : null;
              if (latestContent === null) {
                throw new Error("Missing item content.");
              }
              const latestUpdatedAt =
                typeof latest?.item?.updated_at === "string"
                  ? latest.item.updated_at
                  : "";
              preserveScroll(() => {
                displayContentRef.current = latestContent;
                displayUpdatedAtRef.current = latestUpdatedAt;
                lastSavedContentRef.current = latestContent;
                lastSavedUpdatedAtRef.current = latestUpdatedAt;
                setDisplayContent(latestContent);
              });
              onContentSaved?.(latestContent, latestUpdatedAt);
              if (!onContentSaved) router.refresh();
            } catch {
              preserveScroll(() => {
                displayContentRef.current = lastSavedContentRef.current;
                displayUpdatedAtRef.current = lastSavedUpdatedAtRef.current;
                setDisplayContent(lastSavedContentRef.current);
              });
              onContentReloadNeeded?.();
              router.refresh();
            } finally {
              isReconcilingRef.current = false;
            }
            return;
          }

          toast.error(
            error instanceof Error
              ? error.message
              : "Failed to save checklist changes."
          );
          preserveScroll(() => {
            setDisplayContent((currentContent) => {
              if (currentContent !== nextContent) return currentContent;
              const revertedContent = lastSavedContentRef.current;
              displayContentRef.current = revertedContent;
              displayUpdatedAtRef.current = lastSavedUpdatedAtRef.current;
              return revertedContent;
            });
          });
        })
        .finally(() => {
          pendingSaveCountRef.current -= 1;
          setPendingSaveCount((count) => Math.max(0, count - 1));
        });
    },
    [
      isInteractive,
      itemId,
      itemUrl,
      onContentReloadNeeded,
      onContentSaved,
      preserveScroll,
      router,
    ]
  );

  const handleToggleTask = useCallback(
    (index: number) => {
      if (!isInteractive || isReconcilingRef.current) return;
      const nextContent = toggleTaskAt(displayContentRef.current, index);
      if (nextContent === null) return;
      preserveScroll(() => {
        displayContentRef.current = nextContent;
        setDisplayContent(nextContent);
      });
      enqueueSave(nextContent);
    },
    [enqueueSave, isInteractive, preserveScroll]
  );

  const taskContextValue = useMemo(
    () => ({
      interactive: isInteractive,
      taskNonce,
      onToggleTask: handleToggleTask,
    }),
    [handleToggleTask, isInteractive, taskNonce]
  );

  return (
    <MarkdownTaskContext.Provider value={taskContextValue}>
      <div
        ref={containerRef}
        data-testid="item-content"
        className={cn(
          "text-foreground font-sans text-base",
          "flex flex-col gap-4",
          className
        )}
      >
        <Markdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[
            stampGfmTasks(taskNonce),
            rehypeRaw,
            [rehypeSanitize, sanitizeSchema],
          ]}
          components={components}
        >
          {displayContent}
        </Markdown>
      </div>
    </MarkdownTaskContext.Provider>
  );
});
