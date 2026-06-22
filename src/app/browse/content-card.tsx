"use client";

/**
 * Feed card for a single content item.
 *
 * The card is a presentational component — it does not own any
 * state and does not route the user anywhere (the item detail
 * page does not exist yet, so a click target would be a dead
 * link). The spec calls for type-coloured badges, a serif
 * title, a sans preview line-clamped to ~3 lines, a tag strip,
 * and a relative timestamp. All of those are derived from the
 * props; the parent (the feed) passes them in.
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

import { useMemo, useState } from "react";

import { cn } from "@/lib/utils";
import type { BrowseItem } from "./types";

export interface ContentCardProps {
  item: BrowseItem;
  /** Optional tags pre-resolved by the feed (saves a per-card
   *  request). When omitted the card renders the tag strip
   *  without entries. */
  tags?: string[];
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
  tags = [],
  variant = "larger-dot",
}: ContentCardProps) {
  const dotClass = TYPE_DOT_CLASS[item.type] ?? "bg-type-raw";
  const typeLabel = TYPE_LABEL[item.type] ?? item.type;
  const relative = useMemo(
    () => formatRelativeTime(item.created_at),
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
        "border-border bg-surface-elevated relative flex flex-col overflow-hidden rounded-sm border",
        "hover:border-border-strong transition-colors"
      )}
    >
      {item.image_url && !imageError ? (
        <div className="border-border bg-surface-muted relative aspect-video w-full overflow-hidden border-b">
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
          className="border-border bg-surface-muted flex aspect-video w-full items-center justify-center border-b"
          data-testid="content-card-image-error"
        >
          <p className="text-muted-foreground font-sans text-xs">
            Image unavailable
          </p>
        </div>
      ) : null}

      <div className="flex flex-1 flex-col gap-3 p-4">
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
          <time
            dateTime={item.created_at}
            title={item.created_at}
            className="text-muted-foreground font-mono text-[0.7rem]"
          >
            {relative}
          </time>
        </header>

        {item.title ? (
          <h3 className="text-foreground font-serif text-lg leading-snug font-semibold tracking-[-0.01em]">
            {item.title}
          </h3>
        ) : null}

        <p className="text-muted-foreground line-clamp-3 font-sans text-sm leading-relaxed">
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

        {tags.length > 0 ? (
          <ul
            aria-label="Tags"
            className="mt-auto flex flex-wrap items-center gap-1.5 pt-2"
          >
            {tags.slice(0, 4).map((tag) => (
              <li
                key={tag}
                className="border-border bg-background text-muted-foreground rounded-sm border px-1.5 py-0.5 font-mono text-[0.65rem] tracking-wide"
              >
                #{tag}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </article>
  );
}
