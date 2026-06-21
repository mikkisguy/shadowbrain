"use client";

/**
 * Feed card for a single content item.
 *
 * The card is a presentational component — it does not own any
 * state and does not route the user anywhere (the item detail page
 * does not exist yet, so a click target would be a dead link). The
 * spec calls for type-coloured badges, a serif title, a sans
 * preview line-clamped to ~3 lines, a tag strip, and a relative
 * timestamp. All of those are derived from the props; the parent
 * (the feed) passes them in.
 *
 * The card is wrapped in a `<article>` with a `data-testid` so the
 * feed tests can assert on the rendered shape without coupling to
 * the visual classes.
 */

import { useMemo } from "react";

import { cn } from "@/lib/utils";
import type { BrowseItem } from "./types";

export interface ContentCardProps {
  item: BrowseItem;
  /** Optional tags pre-resolved by the feed (saves a per-card
   *  request). When omitted the card renders the tag strip
   *  without entries. */
  tags?: string[];
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

export function ContentCard({ item, tags = [] }: ContentCardProps) {
  const dotClass = TYPE_DOT_CLASS[item.type] ?? "bg-type-raw";
  const typeLabel = TYPE_LABEL[item.type] ?? item.type;
  const relative = useMemo(
    () => formatRelativeTime(item.created_at),
    [item.created_at]
  );

  return (
    <article
      data-testid="content-card"
      data-item-id={item.id}
      data-item-type={item.type}
      className={cn(
        "border-border bg-surface-elevated flex flex-col gap-3 rounded-sm border p-4",
        "hover:border-border-strong transition-colors"
      )}
    >
      <header className="flex items-center justify-between gap-3">
        <span className="text-muted-foreground inline-flex items-center gap-2 font-mono text-[0.65rem] font-medium tracking-[0.16em] uppercase">
          <span aria-hidden className={cn("size-1.5 rounded-full", dotClass)} />
          {typeLabel}
        </span>
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

      {tags.length > 0 ? (
        <ul aria-label="Tags" className="flex flex-wrap items-center gap-1.5">
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
    </article>
  );
}
