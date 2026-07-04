import { notFound } from "next/navigation";

import { getDb, contentItems, contentLinks } from "@/db/index";
import { typeColorClass, typeLabel } from "@/lib/content-types";
import { formatAbsolute } from "@/lib/dates";
import { extractMetadataFields } from "@/lib/metadata-fields";

import { CoverBackground } from "./cover-background";
import { DetailLayout } from "./detail-layout";
import { ItemSidebar } from "./item-sidebar";
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
 * alongside this page. The links / backlinks sidebar (issue #26) is
 * rendered by `ItemSidebar` inside the `DetailLayout` shell, which
 * owns the show/hide toggle and the responsive two-column layout.
 *
 * Auth is enforced by the proxy (`src/proxy.ts`) for every non-public
 * route, so an unauthenticated visitor never reaches this server
 * component. Visibility: the single admin is viewing their own brain,
 * so hidden / private items are shown (both opt-ins on) — mirroring
 * the admin's `?include_hidden=1` / `?include_private=1` opt-in on the
 * API.
 */

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

  const { item, tags, links } = result;
  const badgeColor = typeColorClass(item.type);
  const badgeLabel = typeLabel(item.type);
  const isImageType = item.type === "image";

  // Resolve the page's fading background image: the first linked
  // image-type item (same "earliest linked image" rule as the browse
  // card), else the item's own `image_path`. Both visibility opt-ins
  // are forced on — the single admin is viewing their own brain.
  // Image-type items skip the cover background — the image is shown
  // inline in the content area instead.
  const coverMap = contentLinks.findCoverImagesBySourceIds(db, [id], {
    includeHidden: true,
    includePrivate: true,
  });
  const coverImagePath = coverMap[id] ?? item.image_path;
  const coverImageUrl =
    !isImageType && coverImagePath
      ? `/api/images/${coverImagePath.replace(/^\/+/, "")}`
      : null;

  // For image-type items, resolve the inline image URL.
  const inlineImageUrl =
    isImageType && item.image_path
      ? `/api/images/${item.image_path.replace(/^\/+/, "")}`
      : null;

  return (
    <>
      {coverImageUrl ? <CoverBackground imageUrl={coverImageUrl} /> : null}
      <div className="relative z-10">
        <DetailLayout
          sidebar={
            <ItemSidebar
              tags={tags}
              outbound={links.outbound}
              inbound={links.inbound}
            />
          }
        >
          <header className="flex flex-col gap-3">
            {/* Coloured type badge — the chip background is the type's
            design-system token; the near-black inverted foreground
            (text-foreground-inverted) reads cleanly on the saturated
            type colours. */}
            <span
              data-testid="item-type-badge"
              className={`${badgeColor} text-foreground-inverted inline-flex w-fit items-center rounded-sm px-2 py-0.5 font-mono text-[0.65rem] font-medium tracking-[0.16em] uppercase`}
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

          {/* Image-type items: show the image inline in the content area */}
          {inlineImageUrl ? (
            <figure className="flex flex-col gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={inlineImageUrl}
                alt={item.title ?? ""}
                className="border-border h-auto max-w-full rounded-sm border"
              />
              {item.content ? null : (
                <figcaption className="text-muted-foreground font-mono text-xs">
                  {item.title}
                </figcaption>
              )}
            </figure>
          ) : null}

          <MarkdownContent content={item.content} />

          {/* Type-specific metadata display (issue #103) */}
          {(() => {
            const fields = extractMetadataFields(
              item.type,
              item.metadata,
              formatAbsolute
            );
            if (!fields) return null;
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
          })()}

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
        </DetailLayout>
      </div>
    </>
  );
}
