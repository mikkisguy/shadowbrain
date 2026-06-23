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
 * Layout: the article is `h-full` so it fills the grid cell's
 * height. The inner content body is `flex-1` so the body grows
 * to match the tallest card in the row, and the tag strip is
 * `mt-auto` so it always sticks to the bottom — even when the
 * preview is short. This is what gives the grid the "fluid"
 * feel: every card in a row has the same outer height, with
 * internal content distributed top-to-bottom.
 *
 * The card is wrapped in a `<article>` with a `data-testid` so
 * the feed tests can assert on the rendered shape without
 * coupling to the visual classes.
 */

import Link from "next/link";
import { useMemo, useState } from "react";

import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { BrowseItem } from "./types";

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

const TYPE_DOT_CLASS: Record<string, string> = {
  note: "bg-type-note",
  journal: "bg-type-journal",
  bookmark: "bg-type-bookmark",
  question: "bg-type-question",
  project: "bg-type-project",
  person: "bg-type-person",
  event: "bg-type-event",
  dream: "bg-type-dream",
  raw: "bg-type-raw",
  raw_text: "bg-type-raw",
  image: "bg-type-image",
};

const TYPE_LABEL: Record<string, string> = {
  note: "Note",
  journal: "Journal",
  bookmark: "Bookmark",
  question: "Question",
  project: "Project",
  person: "Person",
  event: "Event",
  dream: "Dream",
  raw: "Raw",
  raw_text: "Raw",
  image: "Image",
};

const RELATIVE = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

/** Shared absolute formatter for the timestamp tooltip. `medium`
 *  date + `short` time reads as "Jun 22, 2026, 9:55 PM" — precise
 *  enough to disambiguate, compact enough for a one-line tip. */
const ABSOLUTE = new Intl.DateTimeFormat("en", {
  dateStyle: "medium",
  timeStyle: "short",
});

/** Format a created_at timestamp as a short relative phrase
 *  ("just now", "12m ago", "3h ago", "2d ago", or the absolute
 *  date for anything older than a month). Falls back to the raw
 *  ISO string when the input is unparseable. */
export function formatRelativeTime(
  iso: string,
  now: Date = new Date()
): string {
  const then = new Date(iso);
  const thenMs = then.getTime();
  if (Number.isNaN(thenMs)) return iso;
  const diffMs = thenMs - now.getTime();
  if (!Number.isFinite(diffMs)) return iso;
  const absMs = Math.abs(diffMs);

  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  const week = 7 * day;
  const month = 30 * day;
  const year = 365 * day;

  if (absMs < minute) return "just now";
  if (absMs < hour)
    return RELATIVE.format(Math.round(diffMs / minute), "minute");
  if (absMs < day) return RELATIVE.format(Math.round(diffMs / hour), "hour");
  if (absMs < week) return RELATIVE.format(Math.round(diffMs / day), "day");
  if (absMs < month) return RELATIVE.format(Math.round(diffMs / week), "week");
  if (absMs < year) return RELATIVE.format(Math.round(diffMs / month), "month");
  return RELATIVE.format(Math.round(diffMs / year), "year");
}

/** Format a created_at timestamp as an absolute, human-readable
 *  date+time ("Jun 22, 2026, 9:55 PM"). Surfaced via the
 *  timestamp's hover/focus tooltip so the exact time is one hover
 *  away from the relative phrase. Falls back to the raw ISO string
 *  when the input is unparseable. */
export function formatAbsoluteTime(iso: string): string {
  const then = new Date(iso);
  const thenMs = then.getTime();
  if (Number.isNaN(thenMs)) return iso;
  return ABSOLUTE.format(then);
}

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
      const d = metadata.event_date;
      return typeof d === "string" && d.trim() ? d : null;
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
  variant = "larger-dot",
}: ContentCardProps) {
  const dotClass = TYPE_DOT_CLASS[item.type] ?? "bg-type-raw";
  const typeLabel = TYPE_LABEL[item.type] ?? item.type;
  // Prefer an explicit `tags` prop (the feed may pre-resolve them);
  // fall back to the tags attached to the item by the API.
  const tagsList = tags ?? item.tags;
  const relative = useMemo(
    () => formatRelativeTime(item.created_at),
    [item.created_at]
  );
  const absolute = useMemo(
    () => formatAbsoluteTime(item.created_at),
    [item.created_at]
  );
  const summary = metadataSummary(item.type, item.metadata);
  // When the image 404s, show a text placeholder instead of the
  // browser's default broken-image glyph. The file may genuinely
  // not exist (the image capture pipeline hasn't created it yet),
  // so a soft fallback keeps the card wall looking intentional.
  const [imageError, setImageError] = useState(false);

  return (
    <article
      data-testid="content-card"
      data-item-id={item.id}
      data-item-type={item.type}
      data-has-image={item.image_url ? "true" : "false"}
      data-variant={variant}
      className={cn(
        "group border-border bg-surface-elevated relative flex min-w-0 flex-col overflow-hidden rounded-sm border",
        "group-hover:border-border-strong transition-colors"
      )}
    >
      {item.image_url && !imageError ? (
        <div className="border-border bg-surface-muted pointer-events-none relative aspect-video w-full overflow-hidden border-b">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={item.image_url}
            alt=""
            loading="lazy"
            decoding="async"
            onError={() => setImageError(true)}
            className="absolute inset-0 size-full object-cover"
            data-testid="content-card-image"
          />
        </div>
      ) : null}

      {/* Fallback for broken / missing images: a subtle placeholder
          so cards with and without images still feel like part of
          the same grid, rather than showing a browser broken-icon. */}
      {item.image_url && imageError ? (
        <div
          className="border-border bg-surface-muted pointer-events-none flex aspect-video w-full items-center justify-center border-b"
          data-testid="content-card-image-error"
        >
          <p className="text-muted-foreground font-sans text-xs">
            Image unavailable
          </p>
        </div>
      ) : null}

      {/* `pointer-events-none` on the body so a click anywhere on the
          card falls through to the stretched link below. Interactive
          children (tag pills, the timestamp tooltip) re-enable pointer
          events with `pointer-events-auto` + `relative z-20` so they
          stay usable above the link overlay. */}
      <div className="pointer-events-none relative z-20 flex flex-1 flex-col gap-3 p-4">
        <header className="flex items-center justify-between gap-3">
          {variant === "pill" ? (
            // Filled coloured chip — replaces both the dot and
            // the muted-foreground text. The chip background
            // uses the type token; the text uses the surface
            // foreground (cream) for contrast.
            <span
              data-testid="content-card-pill"
              className={cn(
                "inline-flex items-center rounded-sm px-2 py-0.5 font-mono text-[0.65rem] font-medium tracking-[0.16em] uppercase",
                dotClass,
                "text-background"
              )}
            >
              {typeLabel}
            </span>
          ) : (
            // `larger-dot` variant: a slightly chunkier dot
            // (2.5 px instead of 1.5 px) so the type identity
            // reads from across the feed. Keeps the editorial
            // whitespace.
            <span className="text-muted-foreground inline-flex items-center gap-2 font-mono text-[0.65rem] font-medium tracking-[0.16em] uppercase">
              <span
                aria-hidden
                className={cn("size-2.5 rounded-full", dotClass)}
              />
              {typeLabel}
            </span>
          )}
          <Tooltip>
            <TooltipTrigger
              render={
                <time
                  dateTime={item.created_at}
                  className="text-muted-foreground hover:text-foreground pointer-events-auto relative z-20 cursor-help font-mono text-[0.7rem] transition-colors"
                />
              }
            >
              {relative}
            </TooltipTrigger>
            <TooltipContent side="top">{absolute}</TooltipContent>
          </Tooltip>
        </header>

        {item.title ? (
          <h3 className="text-foreground font-serif text-lg leading-snug font-semibold tracking-[-0.01em] break-words">
            {item.title}
          </h3>
        ) : null}

        <p className="text-muted-foreground line-clamp-3 font-sans text-sm leading-relaxed break-words">
          {previewText(item.content)}
        </p>

        {summary ? (
          <p
            data-testid="content-card-metadata-summary"
            className="text-muted-foreground font-mono text-[0.7rem] tracking-wide"
          >
            {summary}
          </p>
        ) : null}

        {tagsList.length > 0 ? (
          <ul
            aria-label="Tags"
            className="mt-auto flex flex-wrap items-center gap-1.5 pt-2"
          >
            {tagsList.slice(0, 4).map((tag) => (
              <li key={tag}>
                <button
                  type="button"
                  data-testid="content-card-tag"
                  onClick={() => onTagClick?.(tag)}
                  aria-label={`Filter by tag ${tag}`}
                  className={cn(
                    "border-border bg-background text-muted-foreground hover:text-foreground hover:border-border-strong pointer-events-auto relative z-20 rounded-sm border px-1.5 py-0.5 font-mono text-[0.65rem] tracking-wide transition-colors",
                    "focus-visible:ring-ring focus-visible:rounded-sm focus-visible:ring-2 focus-visible:outline-none"
                  )}
                >
                  #{tag}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {/* Stretched link: covers the whole card so a click anywhere
          navigates to the item's detail page. Sits beneath the body
          (body is z-20 with pointer-events-none), so clicks pass
          through to this link except on the tag pills and the
          timestamp (which re-enable pointer events above it). */}
      <Link
        href={`/item/${item.id}`}
        className="focus-visible:ring-ring absolute inset-0 z-10 rounded-sm focus-visible:ring-2 focus-visible:outline-none"
        aria-label={`Open ${item.title ?? typeLabel}`}
      >
        <span className="sr-only">Open item</span>
      </Link>
    </article>
  );
}
