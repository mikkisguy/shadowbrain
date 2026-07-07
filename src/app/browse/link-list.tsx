"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { typeColorClass, typeLabel } from "@/lib/content-types";
import { formatLinkType } from "@/app/item/[id]/item-sidebar";

export function LinkRow({
  href,
  title,
  type,
  linkType,
}: {
  href: string;
  title: string | null;
  type: string;
  linkType: string;
}) {
  return (
    <li>
      <Link
        href={href}
        className={cn(
          "group border-border bg-background hover:border-border-strong flex flex-col gap-1.5 rounded-sm border px-3 py-2 transition-colors",
          "focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none"
        )}
      >
        <span className="flex items-center gap-2">
          <span
            aria-hidden
            className={cn("size-2 shrink-0 rounded-full", typeColorClass(type))}
          />
          <span className="text-foreground line-clamp-2 font-sans text-sm leading-snug font-medium wrap-break-word">
            {title?.trim() ? title : "Untitled"}
          </span>
        </span>
        <span className="text-muted-foreground flex items-center gap-1.5 font-mono text-[0.65rem] tracking-wide uppercase">
          <span>{formatLinkType(linkType)}</span>
          <span aria-hidden>·</span>
          <span>{typeLabel(type)}</span>
        </span>
      </Link>
    </li>
  );
}
