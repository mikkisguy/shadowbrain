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
 * Output is React text children only — react-markdown never injects
 * raw HTML, so there is no `dangerouslySetInnerHTML` in the path and
 * markup in the source content is rendered as literal text, not HTML.
 */

import { memo } from "react";
import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

import { cn } from "@/lib/utils";

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
      className="text-foreground leading-relaxed break-words"
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
      className="text-foreground marker:text-muted-foreground flex list-disc flex-col gap-1 pl-6"
      {...rest(props)}
    />
  ),
  ol: (props) => (
    <ol
      className="text-foreground marker:text-muted-foreground flex list-decimal flex-col gap-1 pl-6"
      {...rest(props)}
    />
  ),
  li: (props) => (
    <li
      className="text-foreground leading-relaxed break-words"
      {...rest(props)}
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
        className="border-border w-full border-collapse text-sm break-words"
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
  // remark-gfm task-list items get a checkbox. The source content is
  // read-only, so the checkbox is disabled (presentational only).
  input: (props) => (
    <input
      {...rest(props)}
      type={props.type ?? "checkbox"}
      disabled
      className="accent-primary size-3.5 align-middle"
    />
  ),
};

export interface MarkdownContentProps {
  content: string;
  className?: string;
}

export const MarkdownContent = memo(function MarkdownContent({
  content,
  className,
}: MarkdownContentProps) {
  return (
    <div
      data-testid="item-content"
      className={cn(
        "text-foreground font-sans text-base",
        "flex flex-col gap-4",
        className
      )}
    >
      <Markdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </Markdown>
    </div>
  );
});
