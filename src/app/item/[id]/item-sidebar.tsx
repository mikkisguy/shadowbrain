import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";

import { cn } from "@/lib/utils";
import { typeColorClass, typeLabel } from "@/lib/content-types";
import type { OutboundLink, InboundLink, Tag } from "@/db/index";

/**
 * Links / backlinks sidebar for the item detail page (issue #26).
 *
 * Presentational, server-rendered: it takes the enriched link rows
 * from `findWithRelations` (each carrying the connected item's id,
 * title, and type) and renders two sections — outbound **Links** and
 * inbound **Backlinks**. Every row links to the connected item's
 * detail page. The show/hide toggle, width, and responsive behaviour
 * live in the surrounding `DetailLayout` client component; this file
 * is just the content so it can stay a server component.
 *
 * Note on the data model: `/api/links` stores every link as two rows
 * (a forward `source→target` and a reverse `target→source`), so under
 * the current schema a link is mutual and the Backlinks section
 * mirrors Links. The two sections are still rendered independently so
 * the UI is correct if directional (one-way) links are ever
 * introduced.
 */

/** Human-readable label for a `content_links.link_type`. The stored
 *  values use kebab/snake case (`depends-on`, `happened_during`); we
 *  show them as spaced words. Unknown values pass through unchanged. */
export function formatLinkType(linkType: string): string {
  return linkType.replace(/[-_]+/g, " ").trim();
}

function LinkRow({
  href,
  title,
  type,
  linkType,
  direction,
}: {
  href: string;
  title: string | null;
  type: string;
  linkType: string;
  direction: "outbound" | "inbound";
}) {
  const Arrow = direction === "outbound" ? ArrowRight : ArrowLeft;
  return (
    <li>
      <Link
        href={href}
        data-testid="sidebar-link"
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
          <span className="text-foreground line-clamp-2 font-sans text-sm leading-snug font-medium break-words">
            {title?.trim() ? title : "Untitled"}
          </span>
        </span>
        <span className="text-muted-foreground flex items-center gap-1.5 font-mono text-[0.65rem] tracking-wide uppercase">
          <Arrow className="size-3 shrink-0" aria-hidden />
          <span>{formatLinkType(linkType)}</span>
          <span aria-hidden>·</span>
          <span>{typeLabel(type)}</span>
        </span>
      </Link>
    </li>
  );
}

function Section({
  title,
  emptyText,
  children,
}: {
  title: string;
  emptyText: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2.5">
      <h2 className="text-muted-foreground font-mono text-xs font-medium tracking-wide uppercase">
        {title}
      </h2>
      {children ?? (
        <p className="text-muted-foreground font-sans text-sm">{emptyText}</p>
      )}
    </section>
  );
}

export interface ItemSidebarProps {
  tags: Tag[];
  outbound: OutboundLink[];
  inbound: InboundLink[];
}

export function ItemSidebar({ tags, outbound, inbound }: ItemSidebarProps) {
  return (
    <div className="flex flex-col gap-6" data-testid="item-sidebar-content">
      {tags.length > 0 ? (
        <Section title="Tags" emptyText="No tags yet.">
          <ul aria-label="Tags" className="flex flex-wrap items-center gap-1.5">
            {tags.map((tag) => (
              <li key={tag.id}>
                <Link
                  href={`/?tag=${encodeURIComponent(tag.name)}`}
                  className="border-border bg-background text-muted-foreground hover:text-foreground hover:border-border-strong rounded-sm border px-2 py-0.5 font-mono text-[0.7rem] tracking-wide transition-colors"
                >
                  #{tag.name}
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      <Section title="Links" emptyText="No outbound links yet.">
        {outbound.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {outbound.map((link) => (
              <LinkRow
                key={link.id}
                href={`/item/${link.target.id}`}
                title={link.target.title}
                type={link.target.type}
                linkType={link.link_type}
                direction="outbound"
              />
            ))}
          </ul>
        ) : null}
      </Section>

      <Section title="Backlinks" emptyText="No backlinks yet.">
        {inbound.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {inbound.map((link) => (
              <LinkRow
                key={link.id}
                href={`/item/${link.source.id}`}
                title={link.source.title}
                type={link.source.type}
                linkType={link.link_type}
                direction="inbound"
              />
            ))}
          </ul>
        ) : null}
      </Section>
    </div>
  );
}
