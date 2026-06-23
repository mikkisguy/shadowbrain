import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { getDb, contentItems } from "@/db/index";

/**
 * Item detail page (`/item/[id]`).
 *
 * Minimal destination for the Browse card's click-through (issue #22).
 * The card navigates here via a stretched link; this page renders the
 * item's identity (type, title, content, tags, timestamps) so the link
 * is never a dead end.
 *
 * Scope note: issue #25 ("Item detail page foundation") owns the full
 * detail experience — markdown rendering via react-markdown, a
 * dedicated loading state, the 404 styling, and the sidebar with
 * links / backlinks (#26). This stub intentionally renders the content
 * as plain preformatted text and omits the sidebar so #25 can replace
 * it without unpicking bespoke work. When #25 lands, this page is the
 * starting point it transforms.
 *
 * Auth is enforced by the proxy (`src/proxy.ts`) for every non-public
 * route, so an unauthenticated visitor never reaches this server
 * component. Visibility: the single admin is viewing their own brain,
 * so hidden / private items are shown (both opt-ins on) — mirroring
 * the admin's `?include_hidden=1` / `?include_private=1` opt-in on the
 * API.
 */

/** Type-token dot classes, mirroring the Browse card's mapping. Kept
 *  local (not imported from the client card component) so this server
 *  component has no client-module dependency. #25 may extract a shared
 *  token map. */
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

const ABSOLUTE = new Intl.DateTimeFormat("en", {
  dateStyle: "medium",
  timeStyle: "short",
});

function formatAbsolute(iso: string): string {
  const ms = new Date(iso).getTime();
  if (Number.isNaN(ms)) return iso;
  return ABSOLUTE.format(new Date(iso));
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
  const dotClass = TYPE_DOT_CLASS[item.type] ?? "bg-type-raw";
  const typeLabel = TYPE_LABEL[item.type] ?? item.type;

  return (
    <main
      id="main-content"
      data-testid="item-detail-page"
      className="mx-auto flex w-full max-w-screen-md flex-col gap-6 px-4 py-8 sm:px-6 sm:py-12"
    >
      <div>
        <Link
          href="/"
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 font-sans text-sm transition-colors"
        >
          <ArrowLeft className="size-3.5" />
          Back to Browse
        </Link>
      </div>

      <header className="flex flex-col gap-3">
        <span className="text-muted-foreground inline-flex items-center gap-2 font-mono text-[0.7rem] font-medium tracking-[0.16em] uppercase">
          <span aria-hidden className={cnDot(dotClass)} />
          {typeLabel}
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

      {/* Plain-text content. #25 replaces this with react-markdown
          (code blocks, wikilinks, the works). */}
      <div className="text-foreground font-sans text-base leading-relaxed break-words whitespace-pre-wrap">
        {item.content}
      </div>

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

/** Tiny helper so the dot class string composes cleanly with the
 *  shared shape (`size-2.5 rounded-full <token>`). Keeps the JSX
 *  readable without a full `cn` import for one element. */
function cnDot(token: string): string {
  return `size-2.5 rounded-full ${token}`;
}
