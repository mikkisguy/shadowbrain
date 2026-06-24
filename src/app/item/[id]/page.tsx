import Link from "next/link";
import { notFound } from "next/navigation";

import { getDb, contentItems } from "@/db/index";
import { typeColorClass, typeLabel } from "@/lib/content-types";

import { BackButton } from "./back-button";
import { MarkdownContent } from "./markdown-content";

/**
 * Item detail page (`/item/[id]`).
 *
 * The full detail experience (issue #25): a coloured type badge, the
 * title, markdown-rendered content, tags, and metadata (created /
 * updated / source, plus the type-specific metadata section). The
 * body is rendered by the `MarkdownContent` client component
 * (react-markdown + remark-gfm); everything else is server-rendered.
 *
 * Loading (`loading.tsx`) and not-found (`not-found.tsx`) states live
 * alongside this page. The links / backlinks sidebar is a separate
 * concern owned by issue #26.
 *
 * Auth is enforced by the proxy (`src/proxy.ts`) for every non-public
 * route, so an unauthenticated visitor never reaches this server
 * component. Visibility: the single admin is viewing their own brain,
 * so hidden / private items are shown (both opt-ins on) — mirroring
 * the admin's `?include_hidden=1` / `?include_private=1` opt-in on the
 * API.
 */

const ABSOLUTE = new Intl.DateTimeFormat("en", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

function formatAbsolute(iso: string): string {
  const ms = new Date(iso).getTime();
  if (Number.isNaN(ms)) return iso;
  return ABSOLUTE.format(new Date(iso));
}

type MetadataField = {
  label: string;
  value: string;
};

/** Render a type-specific metadata section for the item detail page
 *  (issue #103). Returns null when the item has no metadata or the
 *  type doesn't have structured fields to display. */
function renderMetadataSection(
  type: string,
  metadata: string | null
): React.ReactNode {
  if (!metadata) return null;
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(metadata);
  } catch {
    return null;
  }
  if (Object.keys(parsed).length === 0) return null;

  const fields: MetadataField[] = [];

  switch (type) {
    case "person": {
      const email = parsed.email;
      if (typeof email === "string" && email.trim()) {
        fields.push({ label: "Email", value: email.trim() });
      }
      const phoneNumber = parsed.phone_number;
      if (typeof phoneNumber === "string" && phoneNumber.trim()) {
        fields.push({ label: "Phone", value: phoneNumber.trim() });
      }
      const socialLinks = parsed.social_links;
      if (Array.isArray(socialLinks) && socialLinks.length > 0) {
        fields.push({
          label: "Social links",
          value: socialLinks.join(", "),
        });
      }
      const role = parsed.role;
      if (typeof role === "string" && role.trim()) {
        fields.push({ label: "Role", value: role.trim() });
      }
      break;
    }
    case "project": {
      const status = parsed.status;
      if (typeof status === "string" && status.trim()) {
        fields.push({ label: "Status", value: status.trim() });
      }
      const repo = parsed.repo;
      if (typeof repo === "string" && repo.trim()) {
        fields.push({ label: "Repository", value: repo.trim() });
      }
      const started = parsed.started;
      if (typeof started === "string" && started.trim()) {
        fields.push({ label: "Started", value: formatAbsolute(started) });
      }
      const goalEndDate = parsed.goal_end_date;
      if (typeof goalEndDate === "string" && goalEndDate.trim()) {
        fields.push({
          label: "Goal end date",
          value: formatAbsolute(goalEndDate),
        });
      }
      break;
    }
    case "event": {
      const startDate = parsed.start_date;
      if (typeof startDate === "string" && startDate.trim()) {
        fields.push({ label: "Start", value: formatAbsolute(startDate) });
      }
      const endDate = parsed.end_date;
      if (typeof endDate === "string" && endDate.trim()) {
        fields.push({ label: "End", value: formatAbsolute(endDate) });
      }
      const duration = parsed.duration;
      if (duration !== null && duration !== undefined) {
        fields.push({ label: "Duration", value: String(duration) });
      }
      break;
    }
    case "dream": {
      const mood = parsed.mood;
      if (typeof mood === "string" && mood.trim()) {
        fields.push({ label: "Mood", value: mood.trim() });
      }
      break;
    }
    default:
      return null;
  }

  if (fields.length === 0) return null;

  return (
    <section
      className="border-border bg-surface-elevated flex flex-col gap-3 rounded-sm border p-4"
      aria-label="Metadata"
    >
      <h3 className="text-muted-foreground font-mono text-xs font-medium tracking-wide uppercase">
        Metadata
      </h3>
      <dl className="text-sm">
        {fields.map((f) => (
          <div key={f.label} className="flex gap-4 py-0.5">
            <dt className="text-muted-foreground min-w-[5rem] font-medium">
              {f.label}
            </dt>
            <dd className="text-foreground break-words">{f.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export default async function ItemDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const db = getDb();
  const result = contentItems.findWithRelations(db, id, {
    includeHidden: true,
    includePrivate: true,
  });
  if (!result) notFound();

  const { item, tags } = result;
  const badgeColor = typeColorClass(item.type);
  const badgeLabel = typeLabel(item.type);

  return (
    <main
      id="main-content"
      data-testid="item-detail-page"
      className="mx-auto flex w-full max-w-screen-md flex-col gap-6 px-4 py-8 sm:px-6 sm:py-12"
    >
      <BackButton fallbackHref="/" />

      <header className="flex flex-col gap-3">
        {/* Coloured type badge — the chip background is the type's
            design-system token; near-black text (text-background)
            reads cleanly on the saturated type colours. */}
        <span
          data-testid="item-type-badge"
          className={`${badgeColor} text-background inline-flex w-fit items-center rounded-sm px-2 py-0.5 font-mono text-[0.65rem] font-medium tracking-[0.16em] uppercase`}
        >
          {badgeLabel}
        </span>
        {item.title ? (
          <h1 className="text-foreground font-serif text-3xl font-semibold tracking-[-0.01em] sm:text-4xl">
            {item.title}
          </h1>
        ) : null}
        <dl className="text-muted-foreground flex flex-wrap gap-x-6 gap-y-1 font-mono text-xs">
          <div className="flex gap-1.5">
            <dt>Created</dt>
            <dd className="text-foreground">
              {formatAbsolute(item.created_at)}
            </dd>
          </div>
          <div className="flex gap-1.5">
            <dt>Updated</dt>
            <dd className="text-foreground">
              {formatAbsolute(item.updated_at)}
            </dd>
          </div>
          <div className="flex gap-1.5">
            <dt>Source</dt>
            <dd className="text-foreground">{item.source}</dd>
          </div>
        </dl>
      </header>

      <MarkdownContent content={item.content} />

      {tags.length > 0 ? (
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
      ) : null}

      {/* Type-specific metadata display (issue #103) */}
      {renderMetadataSection(item.type, item.metadata)}

      {item.source_url ? (
        <p className="font-sans text-sm">
          <a
            href={item.source_url}
            rel="noopener noreferrer"
            target="_blank"
            className="text-primary break-all hover:underline"
          >
            {item.source_url}
          </a>
        </p>
      ) : null}
    </main>
  );
}
