"use client";

/**
 * Feed card for a single content item.
 *
 * The card is a presentational component — it does not own any
 * state. Two interactions are wired through callbacks / links:
 *   - **Click anywhere on the card** → navigate to the item's
 *     detail page (`/item/[id]`). Implemented with a "stretched
 *     link": an `<Link>` positioned over the whole card whose
 *     `::after`-style overlay is the click target. The body is
 *     `pointer-events-none` so clicks fall through to the link,
 *     while the tag pills and the timestamp tooltip re-enable
 *     pointer events (`pointer-events-auto`) so they stay
 *     interactive above the overlay.
 *   - **Click a tag pill** → `onTagClick(tag)`, which the feed
 *     wires to `setFilters({ tag })` so the feed narrows to that
 *     tag and the URL picks up `?tag=…`.
 *
 * The spec calls for type-coloured badges, a serif title, a sans
 * preview line-clamped to ~3 lines, a tag strip, and a relative
 * timestamp. All of those are derived from the props; the parent
 * (the feed) passes them in.
 *
 * When `image_url` is set, the card renders an `<img>` at the
 * top — fixed 16:9 aspect, `object-fit: cover`, full card
 * width. The image is the visual focal point; the type badge,
 * title, preview, and tags flow underneath in a stacked layout.
 *
 * Layout: the card fills its grid cell height so every card in a
 * row has the same outer height. The inner content body is
 * `flex-1` and the tag strip uses `mt-auto` so it always sticks
 * to the bottom — this distributes content top-to-bottom and
 * makes the grid read as clean, aligned rows.
 *
 * The card is wrapped in a `<article>` with a `data-testid` so
 * the feed tests can assert on the rendered shape without
 * coupling to the visual classes.
 */

import Link from "next/link";
import { useState } from "react";

import { cn } from "@/lib/utils";
import { typeColorClass, typeLabel } from "@/lib/content-types";
import { parseSnippet } from "@/lib/snippet";
import type { BrowseItem } from "./types";
import { CardImage } from "./card-image";
import { CardTags } from "./card-tags";
import { CardTimestamp } from "./card-timestamp";

export interface ContentCardProps {
  item: BrowseItem;
  /** Optional tags pre-resolved by the feed (saves a per-card
   *  request). When omitted the card renders the tag strip
   *  from `item.tags`. */
  tags?: string[];
  /**
   * Called when the user clicks a tag pill. The feed wires this to
   * `setFilters({ tag })` so a click narrows the feed to that tag
   * (and the URL picks up `?tag=…`). Omitted in isolated card tests.
   */
  onTagClick?: (tag: string) => void;
  /**
   * Called when the user clicks the card (regular left-click without
   * modifier keys). The feed wires this to open the item preview sheet.
   * Ctrl/Cmd+Click and middle-click pass through to the native
   * <Link> behavior (open in new tab).
   */
  onItemClick?: (id: string) => void;
  /**
   * Visual treatment for the type indicator. Two options, both
   * live in the card header (no chrome on the card body):
   *   - `"pill"` — the dot + uppercase text become a filled
   *     coloured chip with the type name. Higher visual weight;
   *     pre-attentively scannable in a long feed.
   *   - `"larger-dot"` — the header dot is bumped from 1.5 px to
   *     2.5 px. Minimal change; keeps the editorial whitespace.
   *
   * The two are surfaced together via a toggle on the Browse
   * page; the default is `"larger-dot"`.
   */
  variant?: "pill" | "larger-dot";
}

// Re-exported for backwards compatibility — the canonical
// implementations live in `card-time-format.ts`.
export { formatRelativeTime, formatAbsoluteTime } from "./card-time-format";

/** Truncate a string to `max` characters at a word boundary
 *  and append an ellipsis. Used for the content preview. */
export function previewText(content: string, max: number = 180): string {
  if (content.length <= max) return content;
  // Walk back to the nearest whitespace inside the budget so we
  // do not chop a word in half.
  const slice = content.slice(0, max);
  const lastSpace = slice.lastIndexOf(" ");
  const cut = lastSpace > max * 0.6 ? lastSpace : max;
  return `${slice.slice(0, cut).trimEnd()}…`;
}

/** A short one-line summary of an item's type-specific metadata, for
 *  the feed card. Returns null when there is nothing meaningful to
 *  show (no metadata, or a type without a summary field). */
export function metadataSummary(
  type: string,
  metadata: Record<string, unknown> | null | undefined
): string | null {
  if (!metadata) return null;
  switch (type) {
    case "person": {
      const role = metadata.role;
      return typeof role === "string" && role.trim() ? role : null;
    }
    case "project": {
      const status = metadata.status;
      return typeof status === "string" && status.trim() ? status : null;
    }
    case "event": {
      const start = metadata.start_date;
      return typeof start === "string" && start.trim() ? start : null;
    }
    case "dream": {
      const mood = metadata.mood;
      return typeof mood === "string" && mood.trim() ? mood : null;
    }
    default:
      return null;
  }
}

export function ContentCard({
  item,
  tags,
  onTagClick,
  onItemClick,
  variant = "larger-dot",
}: ContentCardProps) {
  const dotClass = typeColorClass(item.type);
  const label = typeLabel(item.type);
  // Prefer an explicit `tags` prop (the feed may pre-resolve them);
  // fall back to the tags attached to the item by the API.
  const tagsList = tags ?? item.tags;
  const summary = metadataSummary(item.type, item.metadata);
  // Parse the FTS5 snippet (search results only) into highlighted
  // segments. `null` when there is no snippet (the regular list view)
  // so the card falls back to the plain content preview.
  const snippetParts = item.snippet ? parseSnippet(item.snippet) : null;
  // When the image 404s, show a text placeholder instead of the
  // browser's default broken-image glyph. The file may genuinely
  // not exist (the image capture pipeline hasn't created it yet),
  // so a soft fallback keeps the card wall looking intentional.
  const [imageError, setImageError] = useState(false);
  const isImageType = item.type === "image";
  const hasCover = Boolean(item.image_url) && !imageError;
  /** Whether the dark scrim is active (background image behind text).
   *  When true, text colors flip to light-on-dark regardless of theme. */
  const hasCoverBg = !isImageType && hasCover;

  return (
    <article
      data-testid="content-card"
      data-item-id={item.id}
      data-item-type={item.type}
      data-has-image={item.image_url ? "true" : "false"}
      data-variant={variant}
      className={cn(
        "group border-border bg-surface-elevated relative flex min-w-0 flex-col overflow-hidden rounded-sm border",
        "group-hover:border-border-strong transition-colors",
        // Isolate each card's layout and paint from its neighbours so
        // the browser (especially Chrome) can skip reflow cascades
        // when a card's content (image, preview, tags) changes.
        "[contain:content]"
      )}
    >
      <CardImage
        imageUrl={item.image_url}
        isImageType={isImageType}
        imageError={imageError}
        onImageError={() => setImageError(true)}
        hasCoverBg={hasCoverBg}
      />

      {/* `pointer-events-none` on the body so a click anywhere on the
          card falls through to the stretched link below. Interactive
          children (tag pills, the timestamp tooltip) re-enable pointer
          events with `pointer-events-auto` + `relative z-20` so they
          stay usable above the link overlay. */}
      <div className="pointer-events-none relative z-20 flex flex-1 flex-col gap-3 p-3 md:p-4">
        <header className="flex items-center justify-between gap-3">
          {variant === "pill" ? (
            // Filled coloured chip — replaces both the dot and
            // the muted-foreground text. The chip background
            // uses the type token; the text uses the near-black
            // inverted foreground for contrast on the fill.
            <span
              data-testid="content-card-pill"
              className={cn(
                "inline-flex items-center rounded-sm px-2 py-0.5 font-mono text-[0.65rem] font-medium tracking-[0.16em] uppercase",
                dotClass,
                "text-foreground-inverted"
              )}
            >
              {label}
            </span>
          ) : (
            // `larger-dot` variant: a slightly chunkier dot
            // (2.5 px instead of 1.5 px) so the type identity
            // reads from across the feed. Keeps the editorial
            // whitespace.
            <span
              className={cn(
                "inline-flex items-center gap-2 font-mono text-[0.65rem] font-medium tracking-[0.16em] uppercase",
                hasCoverBg ? "text-white/70" : "text-muted-foreground"
              )}
            >
              <span
                aria-hidden
                className={cn("size-2.5 rounded-full", dotClass)}
              />
              {label}
            </span>
          )}
          <CardTimestamp createdAt={item.created_at} hasCoverBg={hasCoverBg} />
        </header>

        {item.title ? (
          <h3
            className={cn(
              "font-serif text-base leading-snug font-semibold tracking-[-0.01em] break-words max-md:line-clamp-1 md:text-lg",
              hasCoverBg ? "text-white" : "text-foreground"
            )}
          >
            {item.title}
          </h3>
        ) : null}

        {snippetParts ? (
          // Search result: render the FTS5 snippet with `<mark>`
          // highlighting the matched terms. Segments are React text
          // children (auto-escaped), so markup in the source content
          // is neutralised — see `parseSnippet`.
          <p
            data-testid="content-card-snippet"
            className={cn(
              "line-clamp-1 font-sans text-sm leading-relaxed break-words md:line-clamp-3",
              hasCoverBg ? "text-white/80" : "text-muted-foreground"
            )}
          >
            {snippetParts.map((part, i) =>
              part.highlight ? (
                <mark key={i}>{part.text}</mark>
              ) : (
                <span key={i}>{part.text}</span>
              )
            )}
          </p>
        ) : (
          <p
            className={cn(
              "line-clamp-1 font-sans text-sm leading-relaxed break-words md:line-clamp-3",
              hasCoverBg ? "text-white/80" : "text-muted-foreground"
            )}
          >
            {previewText(item.content)}
          </p>
        )}

        {summary ? (
          <p
            data-testid="content-card-metadata-summary"
            className={cn(
              "font-mono text-[0.7rem] tracking-wide",
              hasCoverBg ? "text-white/60" : "text-muted-foreground"
            )}
          >
            {summary}
          </p>
        ) : null}

        <CardTags
          tags={tagsList}
          onTagClick={onTagClick}
          hasCoverBg={hasCoverBg}
        />
      </div>

      {/* Stretched link: covers the whole card so a click anywhere
          navigates to the item's detail page. Sits beneath the body
          (body is z-20 with pointer-events-none), so clicks pass
          through to this link except on the tag pills and the
          timestamp (which re-enable pointer events above it).

          Click behavior:
          - Regular left-click → open in the preview sheet (onItemClick)
          - Ctrl/Cmd+Click → native browser new-tab behavior
          - Middle-click → native browser new-tab behavior (onClick
            doesn't fire for button 1, so the <a> handles it) */}
      <Link
        href={`/item/${item.id}`}
        className="focus-visible:ring-ring absolute inset-0 z-10 rounded-sm focus-visible:ring-2 focus-visible:outline-none"
        aria-label={`Open ${item.title ?? label}`}
        onClick={(e) => {
          // Ctrl/Cmd+Click → let the browser open in a new tab natively.
          if (e.ctrlKey || e.metaKey) return;
          // Regular click → open in the preview sheet instead of
          // navigating to the detail page.
          if (onItemClick) {
            e.preventDefault();
            onItemClick(item.id);
          }
        }}
      >
        <span className="sr-only">Open item</span>
      </Link>
    </article>
  );
}
