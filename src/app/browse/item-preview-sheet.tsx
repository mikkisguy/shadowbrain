"use client";

/**
 * Item preview sheet.
 *
 * A right-side Sheet panel that shows an item's full detail without
 * navigating away from the browse feed. Opened by a regular (no modifier)
 * click on a card; the URL picks up `?item=<id>` for shareable deep links.
 *
 * Layout (top to bottom):
 *   1. Cover image banner (non-image types) or inline image (image type)
 *   2. Header: type badge, title, dates, source
 *   3. Scrollable body: markdown content + metadata section
 *   4. Bottom: tags, outbound links, backlinks
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ChevronRight, ExternalLink, Pencil } from "lucide-react";

import { cn } from "@/lib/utils";
import { typeColorClass, typeLabel } from "@/lib/content-types";
import { formatAbsolute } from "@/lib/dates";
import { extractMetadataFields } from "@/lib/metadata-fields";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { MarkdownContent } from "@/app/item/[id]/markdown-content";
import { formatLinkType } from "@/app/item/[id]/item-sidebar";
import { EditDialog } from "@/components/edit-dialog/edit-dialog";
import { useEditDialog } from "@/components/edit-dialog/use-edit-dialog";

/* ------------------------------------------------------------------ */
/*  Types matching the API response from GET /api/items/[id]          */
/* ------------------------------------------------------------------ */

interface ItemDetail {
  id: string;
  type: string;
  title: string | null;
  content: string;
  image_path: string | null;
  source: string;
  source_url: string | null;
  /** JSON string stored in the DB; must be parsed before use. */
  metadata: string | null;
  is_private: number;
  is_hidden: number;
  created_at: string;
  updated_at: string;
}

interface Tag {
  id: string;
  name: string;
  color: string | null;
  created_at: string;
}

interface LinkedItem {
  id: string;
  title: string | null;
  type: string;
}

interface OutboundLink {
  id: string;
  target: LinkedItem;
  link_type: string;
}

interface InboundLink {
  id: string;
  source: LinkedItem;
  link_type: string;
}

interface ItemDetailResponse {
  item: ItemDetail;
  tags: Tag[];
  links: {
    outbound: OutboundLink[];
    inbound: InboundLink[];
  };
}

/* ------------------------------------------------------------------ */
/*  Metadata section                                                  */
/* ------------------------------------------------------------------ */

function MetadataSection({
  type,
  metadata,
}: {
  type: string;
  metadata: string | null;
}) {
  const fields = useMemo(
    () => extractMetadataFields(type, metadata, formatAbsolute),
    [type, metadata]
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
            <dt className="text-muted-foreground min-w-20 font-medium">
              {f.label}
            </dt>
            <dd className="text-foreground wrap-break-word">{f.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Link row (simplified version of LinkRow from item-sidebar)        */
/* ------------------------------------------------------------------ */

function LinkRow({
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

/* ------------------------------------------------------------------ */
/*  Loading skeleton                                                   */
/* ------------------------------------------------------------------ */

function SheetSkeleton() {
  return (
    <div className="flex flex-col gap-6 p-6" data-testid="sheet-loading">
      {/* Image placeholder */}
      <div className="bg-surface-muted h-40 w-full animate-pulse rounded-sm" />
      {/* Badge + title */}
      <div className="flex flex-col gap-3">
        <div className="bg-surface-muted h-5 w-16 animate-pulse rounded-sm" />
        <div className="bg-surface-muted h-8 w-3/4 animate-pulse rounded-sm" />
      </div>
      {/* Date/source row */}
      <div className="flex gap-4">
        <div className="bg-surface-muted h-4 w-24 animate-pulse rounded-sm" />
        <div className="bg-surface-muted h-4 w-28 animate-pulse rounded-sm" />
      </div>
      {/* Content paragraphs */}
      <div className="flex flex-col gap-2">
        <div className="bg-surface-muted h-4 w-full animate-pulse rounded-sm" />
        <div className="bg-surface-muted h-4 w-5/6 animate-pulse rounded-sm" />
        <div className="bg-surface-muted h-4 w-4/6 animate-pulse rounded-sm" />
        <div className="bg-surface-muted h-4 w-full animate-pulse rounded-sm" />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Error state                                                        */
/* ------------------------------------------------------------------ */

function SheetError({ onRetry }: { onRetry: () => void }) {
  return (
    <div
      className="flex flex-col items-start gap-3 p-6"
      data-testid="sheet-error"
    >
      <p className="text-error font-sans text-sm font-medium">
        Couldn&apos;t load this item right now.
      </p>
      <button
        type="button"
        onClick={onRetry}
        data-testid="sheet-retry"
        className="text-primary font-sans text-sm hover:underline"
      >
        Try again
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

export interface ItemPreviewSheetProps {
  /** The selected item id, or `null` to keep the sheet closed. */
  itemId: string | null;
  /** Called when the sheet is dismissed (Escape / outside-click / close
   *  button). The parent removes `?item=` from the URL. */
  onClose: () => void;
}

export function ItemPreviewSheet({ itemId, onClose }: ItemPreviewSheetProps) {
  // Derive `open` from `itemId` — no local toggle state, the parent
  // controls visibility via the URL param.
  const open = itemId !== null;

  const [data, setData] = useState<ItemDetailResponse | null>(null);
  const [status, setStatus] = useState<
    "idle" | "loading" | "success" | "error"
  >("idle");

  // Edit dialog state
  const { open: editOpen, setOpen: setEditOpen } = useEditDialog();

  // Shared fetch helper — used by both the effect (on itemId change)
  // and the retry button. The `cancelled` ref lets the effect's cleanup
  // suppress setState after unmount; the retry handler shares the same
  // ref so a rapid close after retry does not setState on a closed sheet.
  const cancelledRef = useRef(false);

  const fetchItem = useCallback((id: string, { reset }: { reset: boolean }) => {
    if (reset) {
      setStatus("loading");
      setData(null);
    }
    fetch(`/api/items/${id}`, {
      credentials: "same-origin",
      headers: { Accept: "application/json" },
    })
      .then(async (res) => {
        if (!res.ok) {
          const text = await res.text().catch(() => "Request failed");
          throw new Error(text);
        }
        return res.json() as Promise<ItemDetailResponse>;
      })
      .then((json) => {
        if (!cancelledRef.current) {
          setData(json);
          setStatus("success");
        }
      })
      .catch(() => {
        if (!cancelledRef.current) {
          setStatus("error");
        }
      });
  }, []);

  // When `itemId` changes, fetch the item detail. When it becomes null
  // the sheet closes (via `open` being false) so there is no need to
  // reset local state — the next non-null `itemId` will overwrite it.
  // The synchronous setState calls here are the standard React pattern
  // for data-fetching effects (same pattern in use-browse-state.ts).
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!itemId) return;
    cancelledRef.current = false;
    fetchItem(itemId, { reset: true });
    return () => {
      cancelledRef.current = true;
    };
  }, [itemId, fetchItem]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const handleRetry = useCallback(() => {
    if (!itemId) return;
    cancelledRef.current = false;
    fetchItem(itemId, { reset: false });
  }, [itemId, fetchItem]);

  const handleOpenChange = useCallback(
    (newOpen: boolean) => {
      if (!newOpen) {
        onClose();
      }
    },
    [onClose]
  );

  // Refresh item data after edit
  const handleEditSaved = useCallback(() => {
    if (itemId) {
      fetchItem(itemId, { reset: true });
    }
  }, [itemId, fetchItem]);

  const item = data?.item;
  const tags = data?.tags;
  const links = data?.links;
  const isImageType = item?.type === "image";

  return (
    <>
      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetContent
          side="right"
          className="flex w-[min(640px,90vw)] flex-col gap-0 p-0 sm:max-w-[min(640px,90vw)]"
        >
          <SheetHeader className="sr-only">
            <SheetTitle>{item?.title ?? "Item preview"}</SheetTitle>
          </SheetHeader>

          {status === "loading" ? <SheetSkeleton /> : null}
          {status === "error" ? <SheetError onRetry={handleRetry} /> : null}

          {status === "success" && item ? (
            <div className="flex h-full flex-col overflow-hidden">
              {/* Cover image banner (non-image types) */}
              {!isImageType && item.image_path ? (
                <div className="shrink-0 overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/images/${item.image_path.replace(/^\//, "")}`}
                    alt=""
                    className="size-full object-cover"
                    style={{ height: 160 }}
                  />
                </div>
              ) : null}

              {/* Image-type: show inline in content area */}
              {isImageType && item.image_path ? (
                <div className="border-border shrink-0 overflow-hidden border-b">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/images/${item.image_path.replace(/^\//, "")}`}
                    alt={item.title ?? ""}
                    className="h-auto max-w-full"
                  />
                </div>
              ) : null}

              {/* Scrollable content area */}
              <div className="flex flex-1 flex-col gap-6 overflow-y-auto p-6">
                {/* Header */}
                <header className="flex flex-col gap-3">
                  <div className="mb-4 flex items-center gap-2">
                    <Link
                      href={`/item/${item.id}`}
                      className="text-muted-foreground hover:text-foreground inline-flex w-fit items-center gap-1.5 rounded-sm font-sans text-sm transition-colors"
                      aria-label="Open full page"
                    >
                      <ExternalLink className="size-4" />
                      <span>Open full page</span>
                    </Link>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => setEditOpen(true)}
                      aria-label="Edit item"
                      title="Edit item"
                      className="text-muted-foreground hover:text-foreground shrink-0"
                    >
                      <Pencil className="size-4" />
                    </Button>
                  </div>
                  <span
                    data-testid="sheet-type-badge"
                    className={cn(
                      typeColorClass(item.type),
                      "text-foreground-inverted inline-flex w-fit items-center rounded-sm px-2 py-0.5 font-mono text-[0.65rem] font-medium tracking-[0.16em] uppercase"
                    )}
                  >
                    {typeLabel(item.type)}
                  </span>
                  {item.title ? (
                    <h2 className="text-foreground flex items-center gap-2 font-serif text-2xl font-semibold tracking-[-0.01em] wrap-break-word">
                      {item.title}
                    </h2>
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

                {/* Markdown body */}
                <MarkdownContent content={item.content} />

                {/* Type-specific metadata */}
                <MetadataSection type={item.type} metadata={item.metadata} />

                {/* Source URL */}
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
              </div>

              {/* Sticky bottom section: tags, links, backlinks */}
              {(tags && tags.length > 0) ||
              (links && links.outbound.length > 0) ||
              (links && links.inbound.length > 0) ? (
                <div className="border-border bg-background shrink-0 border-t p-4">
                  <div className="flex max-h-64 flex-col gap-3 overflow-y-auto">
                    {/* Tags */}
                    {tags && tags.length > 0 ? (
                      <details className="group [&>summary::-webkit-details-marker]:hidden [&>summary::marker]:hidden">
                        <summary className="text-muted-foreground hover:text-foreground border-border flex cursor-pointer items-center justify-between border-b pb-2 font-mono text-xs font-medium tracking-wide uppercase transition-colors">
                          <span>Tags ({tags.length})</span>
                          <ChevronRight className="size-3.5 transition-transform group-open:rotate-90" />
                        </summary>
                        <ul
                          aria-label="Tags"
                          className="mt-3 flex flex-wrap items-center gap-1.5"
                        >
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
                      </details>
                    ) : null}

                    {/* Outbound links */}
                    {links && links.outbound.length > 0 ? (
                      <details className="group [&>summary::-webkit-details-marker]:hidden [&>summary::marker]:hidden">
                        <summary className="text-muted-foreground hover:text-foreground border-border flex cursor-pointer items-center justify-between border-b pb-2 font-mono text-xs font-medium tracking-wide uppercase transition-colors">
                          <span>Links ({links.outbound.length})</span>
                          <ChevronRight className="size-3.5 transition-transform group-open:rotate-90" />
                        </summary>
                        <ul className="mt-3 flex flex-col gap-2">
                          {links.outbound.map((link) => (
                            <LinkRow
                              key={link.id}
                              href={`/item/${link.target.id}`}
                              title={link.target.title}
                              type={link.target.type}
                              linkType={link.link_type}
                            />
                          ))}
                        </ul>
                      </details>
                    ) : null}

                    {/* Backlinks */}
                    {links && links.inbound.length > 0 ? (
                      <details className="group [&>summary::-webkit-details-marker]:hidden [&>summary::marker]:hidden">
                        <summary className="text-muted-foreground hover:text-foreground border-border flex cursor-pointer items-center justify-between border-b pb-2 font-mono text-xs font-medium tracking-wide uppercase transition-colors">
                          <span>Backlinks ({links.inbound.length})</span>
                          <ChevronRight className="size-3.5 transition-transform group-open:rotate-90" />
                        </summary>
                        <ul className="mt-3 flex flex-col gap-2">
                          {links.inbound.map((link) => (
                            <LinkRow
                              key={link.id}
                              href={`/item/${link.source.id}`}
                              title={link.source.title}
                              type={link.source.type}
                              linkType={link.link_type}
                            />
                          ))}
                        </ul>
                      </details>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </SheetContent>
      </Sheet>

      {/* Edit dialog rendered outside the sheet to avoid stacking context issues */}
      {data && (
        <EditDialog
          item={data.item}
          tags={data.tags}
          open={editOpen}
          onOpenChange={setEditOpen}
          onSaved={handleEditSaved}
        />
      )}
    </>
  );
}
