"use client";

/**
 * Timestamp tooltip for a content card.
 *
 * Shows a relative time phrase ("just now", "12m ago", "3h ago") and
 * reveals the absolute date+time on hover via a Base UI Tooltip.
 */

import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatRelativeTime, formatAbsoluteTime } from "./card-time-format";

export function CardTimestamp({
  createdAt,
  hasCoverBg,
}: {
  createdAt: string;
  hasCoverBg: boolean;
}) {
  const relative = formatRelativeTime(createdAt);
  const absolute = formatAbsoluteTime(createdAt);

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <time
            dateTime={createdAt}
            className={cn(
              "pointer-events-auto relative z-20 cursor-help font-mono text-[0.7rem] transition-colors",
              hasCoverBg
                ? "text-white/60 hover:text-white"
                : "text-muted-foreground hover:text-foreground"
            )}
          />
        }
      >
        {relative}
      </TooltipTrigger>
      <TooltipContent side="top">{absolute}</TooltipContent>
    </Tooltip>
  );
}
