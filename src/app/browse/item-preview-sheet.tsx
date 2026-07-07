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

import { useCallback } from "react";
import Link from "next/link";
import { ChevronRight, ExternalLink, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { cn } from "@/lib/utils";
import { typeColorClass, typeLabel } from "@/lib/content-types";
import { formatAbsolute } from "@/lib/dates";
import { parseBookmarkMeta } from "@/lib/metadata-fields";
import { queryKeys } from "@/lib/query-config";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { MarkdownContent } from "@/app/item/[id]/markdown-content";
import { EditDialog } from "@/components/edit-dialog/edit-dialog";
import { useEditDialog } from "@/components/edit-dialog/use-edit-dialog";
import { DeleteConfirmationDialog } from "@/components/delete-dialog/delete-confirmation-dialog";
import { useDeleteDialog } from "@/components/delete-dialog/use-delete-dialog";
import { MetadataSection } from "./metadata-section";
import { LinkRow } from "./link-list";
import { SheetSkeleton, SheetError } from "./sheet-states";
import { useItemDetail } from "./use-item-detail";

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

  const { data, status, handleRetry, refetch } = useItemDetail(itemId);

  // Edit dialog state
  const { open: editOpen, setOpen: setEditOpen } = useEditDialog();

  // Delete dialog state
  const { open: deleteOpen, setOpen: setDeleteOpen } = useDeleteDialog();
  const queryClient = useQueryClient();

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/items/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        const msg: string | undefined = payload?.error?.message;
        throw new Error(msg ?? "Failed to delete item");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.browse.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.tags.all });
      toast.success("Item deleted.");
      setDeleteOpen(false);
      onClose();
    },
    onError: (error: Error) => {
      toast.error(error.message ?? "Failed to delete item.");
    },
  });

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
    refetch();
  }, [refetch]);

  const item = data?.item;
  const tags = data?.tags;
  const links = data?.links;
  const isImageType = item?.type === "image";

  // Parse bookmark metadata for rich display
  const bm =
    item?.type === "bookmark" ? parseBookmarkMeta(item.metadata) : null;

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
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => setDeleteOpen(true)}
                      aria-label="Delete item"
                      title="Delete item"
                      className="text-muted-foreground hover:text-foreground shrink-0"
                    >
                      <Trash2 className="size-4" />
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

                {/* Bookmark: og:image preview */}
                {bm?.image ? (
                  <figure className="flex flex-col gap-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`/api/bookmarks/image-proxy?url=${encodeURIComponent(bm.image)}`}
                      alt={item.title ?? ""}
                      className="border-border h-auto max-w-full rounded-sm border"
                    />
                  </figure>
                ) : null}

                {/* Markdown body */}
                <MarkdownContent content={item.content} />

                {/* Type-specific metadata */}
                <MetadataSection type={item.type} metadata={item.metadata} />

                {/* Source URL with favicon */}
                {item.source_url && item.source_url !== item.content ? (
                  <p className="text-foreground flex items-center gap-2 font-sans text-sm">
                    {bm?.favicon ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={`/api/bookmarks/image-proxy?url=${encodeURIComponent(bm.favicon)}`}
                        alt=""
                        className="size-4 shrink-0 rounded"
                      />
                    ) : null}
                    <a
                      href={item.source_url}
                      rel="noopener noreferrer"
                      target="_blank"
                      className="text-primary break-all hover:underline"
                    >
                      {item.source_url}
                    </a>
                    {bm?.siteName ? (
                      <span className="text-muted-foreground">
                        ({bm.siteName})
                      </span>
                    ) : null}
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

      {/* Delete confirmation dialog */}
      {data && (
        <DeleteConfirmationDialog
          open={deleteOpen}
          onOpenChange={setDeleteOpen}
          itemTitle={data.item.title}
          itemType={data.item.type}
          onConfirm={() => deleteMutation.mutate(data.item.id)}
          isDeleting={deleteMutation.isPending}
        />
      )}
    </>
  );
}
