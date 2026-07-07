/**
 * Shared time-formatting utilities for content cards.
 *
 * Extracted to break the circular dependency between `content-card.tsx`
 * and `card-timestamp.tsx` — both need these formatters.
 */

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
