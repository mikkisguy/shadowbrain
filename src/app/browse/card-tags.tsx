"use client";

/**
 * Tag pills strip for a content card.
 *
 * Renders a mobile compact count + desktop pill strip (up to four tags).
 * Each pill is a clickable button that calls `onTagClick` with the tag name.
 */

import { cn } from "@/lib/utils";

export function CardTags({
  tags,
  onTagClick,
  hasCoverBg,
}: {
  tags: string[];
  onTagClick?: (tag: string) => void;
  hasCoverBg: boolean;
}) {
  if (tags.length === 0) return null;

  return (
    <ul
      aria-label="Tags"
      className="mt-auto flex flex-wrap items-center gap-1.5 pt-2"
    >
      {/* Mobile compact: a tag count replaces the pill strip so a
          dense row of tiny pills doesn't shrink already-small tap
          targets on a narrow card. Pills return at md+ where the
          card has room. */}
      <li
        className={cn(
          "font-mono text-[0.65rem] tracking-wide md:hidden",
          hasCoverBg ? "text-white/60" : "text-muted-foreground"
        )}
      >
        {tags.length} {tags.length === 1 ? "tag" : "tags"}
      </li>
      {tags.slice(0, 4).map((tag) => (
        <li key={tag} className="hidden md:list-item">
          <button
            type="button"
            data-testid="content-card-tag"
            onClick={() => onTagClick?.(tag)}
            aria-label={`Filter by tag ${tag}`}
            className={cn(
              "pointer-events-auto relative z-20 rounded-sm border px-1.5 py-0.5 font-mono text-[0.65rem] tracking-wide transition-colors",
              "focus-visible:ring-ring focus-visible:rounded-sm focus-visible:ring-2 focus-visible:outline-none",
              hasCoverBg
                ? "border-white/20 bg-black/30 text-white/80 hover:border-white/40 hover:text-white"
                : "border-border bg-background text-muted-foreground hover:text-foreground hover:border-border-strong"
            )}
          >
            #{tag}
          </button>
        </li>
      ))}
    </ul>
  );
}
