"use client";

/**
 * Item preview sheet.
 *
 * A right-side Sheet panel that shows a compact peek of an item without
 * navigating away from the browse feed. Opened by a regular (no modifier)
 * click on a card; the URL picks up `?item=<id>` for shareable deep links.
 *
 * Layout (top to bottom):
 *   1. Image (image items) + header/title/metadata/content/tags in one scroll
 *   2. Workflow status strip (task/event only)
 *   3. Dates / type-specific metadata (status omitted when strip is shown)
 *   4. Full markdown content with interactive task checkboxes
 *   5. Tags
 *   6. Outbound links / backlinks (pinned footer with its own scroll)
 */

import { useCallback, useMemo } from "react";
import Link from "next/link";
import { ChevronRight, ExternalLink, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { cn } from "@/lib/utils";
import { typeColorClass, typeLabel } from "@/lib/content-types";
import { formatAbsolute } from "@/lib/dates";
import {
  extractMetadataFields,
  parseBookmarkMeta,
} from "@/lib/metadata-fields";
import { queryKeys } from "@/lib/query-config";
import {
  parseWorkflowStatus,
  type WorkflowStatusValue,
} from "@/lib/workflow-status";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { WorkflowStatusStrip } from "@/components/workflow-status-strip";
import { EditDialog } from "@/components/edit-dialog/edit-dialog";
import { useEditDialog } from "@/components/edit-dialog/use-edit-dialog";
import { DeleteConfirmationDialog } from "@/components/delete-dialog/delete-confirmation-dialog";
import { useDeleteDialog } from "@/components/delete-dialog/use-delete-dialog";
import { MarkdownContent } from "@/app/item/[id]/markdown-content";
import { MetadataSection } from "./metadata-section";
import { LinkRow } from "./link-list";
import { SheetSkeleton, SheetError } from "./sheet-states";
import { useItemDetail } from "./use-item-detail";
import type { ItemDetailResponse } from "./use-item-detail";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function invalidateViewsQueries(
  queryClient: ReturnType<typeof useQueryClient>
) {
  queryClient.invalidateQueries({ queryKey: queryKeys.views.all });
}

function parseMetadataObject(metadata: string | null): Record<string, unknown> {
  if (!metadata) return {};
  try {
    const parsed = JSON.parse(metadata);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    /* fall through */
  }
  return {};
}

interface ParentCrumb {
  id: string;
  title: string | null;
  type: string;
}

function resolveParentCrumb(
  links: ItemDetailResponse["links"] | undefined
): ParentCrumb | null {
  if (!links) return null;

  const outboundParent = links.outbound.find(
    (link) =>
      link.link_type === "happened_during" &&
      (link.target.type === "event" || link.target.type === "project")
  );
  if (outboundParent) {
    return outboundParent.target;
  }

  const inboundParent = links.inbound.find(
    (link) =>
      link.link_type === "happened_during" &&
      (link.source.type === "event" || link.source.type === "project")
  );
  if (inboundParent) {
    return inboundParent.source;
  }

  return null;
}

function visibilityQuery(
  includeHidden: boolean,
  includePrivate: boolean
): string {
  const params = new URLSearchParams();
  if (includeHidden) params.set("include_hidden", "1");
  if (includePrivate) params.set("include_private", "1");
  const query = params.toString();
  return query ? `?${query}` : "";
}

function hasWorkflowStatus(type: string): boolean {
  return type === "task" || type === "event";
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
  includeHidden?: boolean;
  includePrivate?: boolean;
}

export function ItemPreviewSheet({
  itemId,
  onClose,
  includeHidden = false,
  includePrivate = false,
}: ItemPreviewSheetProps) {
  const open = itemId !== null;

  const { data, status, handleRetry, refetch, updateContent } = useItemDetail(
    itemId,
    { includeHidden, includePrivate }
  );

  const { open: editOpen, setOpen: setEditOpen } = useEditDialog();
  const { open: deleteOpen, setOpen: setDeleteOpen } = useDeleteDialog();
  const queryClient = useQueryClient();

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(
        `/api/items/${id}${visibilityQuery(includeHidden, includePrivate)}`,
        {
          method: "DELETE",
        }
      );
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        const msg: string | undefined = payload?.error?.message;
        throw new Error(msg ?? "Failed to delete item");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.browse.all });
      invalidateViewsQueries(queryClient);
      queryClient.invalidateQueries({ queryKey: queryKeys.tags.all });
      toast.success("Item deleted.");
      setDeleteOpen(false);
      onClose();
    },
    onError: (error: Error) => {
      toast.error(error.message ?? "Failed to delete item.");
    },
  });

  const statusMutation = useMutation({
    mutationFn: async ({
      id,
      type,
      metadata,
      nextStatus,
    }: {
      id: string;
      type: string;
      metadata: string | null;
      nextStatus: WorkflowStatusValue;
    }) => {
      const merged = {
        ...parseMetadataObject(metadata),
        status: nextStatus,
      };
      const res = await fetch(
        `/api/items/${id}${visibilityQuery(includeHidden, includePrivate)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type, metadata: merged }),
        }
      );
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        const msg: string | undefined = payload?.error?.message;
        throw new Error(msg ?? "Failed to update status");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.browse.all });
      invalidateViewsQueries(queryClient);
      refetch();
    },
    onError: (error: Error) => {
      toast.error(error.message ?? "Failed to update status.");
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

  const handleEditSaved = useCallback(() => {
    refetch();
  }, [refetch]);

  const item = data?.item;
  const tags = data?.tags;
  const links = data?.links;
  const isImageType = item?.type === "image";
  const showWorkflowStatus = item ? hasWorkflowStatus(item.type) : false;
  const workflowStatus = item ? parseWorkflowStatus(item.metadata) : "todo";
  const parentCrumb = useMemo(() => resolveParentCrumb(links), [links]);

  const dateFields = useMemo(() => {
    if (!item || !hasWorkflowStatus(item.type)) return null;
    const fields = extractMetadataFields(
      item.type,
      item.metadata,
      formatAbsolute
    );
    if (!fields) return null;
    const dateLabels = new Set(["Start", "End", "Due"]);
    const filtered = fields.filter(
      (field) => field.label !== "Status" && dateLabels.has(field.label)
    );
    return filtered.length > 0 ? filtered : null;
  }, [item]);

  const bm =
    item?.type === "bookmark" ? parseBookmarkMeta(item.metadata) : null;

  const handleStatusChange = useCallback(
    (nextStatus: WorkflowStatusValue) => {
      if (!item) return;
      statusMutation.mutate({
        id: item.id,
        type: item.type,
        metadata: item.metadata,
        nextStatus,
      });
    },
    [item, statusMutation]
  );

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
              <div
                data-testid="sheet-scroll-body"
                className="flex min-h-0 flex-1 flex-col overflow-y-auto"
              >
                {isImageType && item.image_path ? (
                  <div className="border-border shrink-0 overflow-hidden border-b">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`/api/images/${item.image_path.replace(/^\//, "")}`}
                      alt={item.title ?? ""}
                      className="h-auto w-full"
                    />
                  </div>
                ) : null}

                <div className="flex flex-col gap-5 p-5">
                  <header className="flex flex-col gap-3">
                    <div className="flex items-center gap-2">
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

                    {parentCrumb ? (
                      <nav
                        aria-label="Parent"
                        className="text-muted-foreground flex items-center gap-1 font-sans text-xs"
                      >
                        <Link
                          href={`/item/${parentCrumb.id}`}
                          data-testid="sheet-parent-crumb"
                          className="hover:text-foreground inline-flex items-center gap-1 transition-colors"
                        >
                          <span
                            aria-hidden
                            className={cn(
                              "size-1.5 rounded-full",
                              typeColorClass(parentCrumb.type)
                            )}
                          />
                          <span className="line-clamp-1">
                            {parentCrumb.title?.trim() || "Untitled"}
                          </span>
                        </Link>
                        <ChevronRight className="size-3 shrink-0" aria-hidden />
                        <span className="text-foreground line-clamp-1">
                          {item.title?.trim() || "Untitled"}
                        </span>
                      </nav>
                    ) : null}

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
                      <h2 className="text-foreground font-serif text-2xl font-semibold tracking-[-0.01em] wrap-break-word">
                        {item.title}
                      </h2>
                    ) : null}

                    {showWorkflowStatus ? (
                      <WorkflowStatusStrip
                        value={workflowStatus}
                        onChange={handleStatusChange}
                        disabled={statusMutation.isPending}
                        data-testid="sheet-workflow-status"
                      />
                    ) : null}

                    {dateFields ? (
                      <dl className="text-muted-foreground flex flex-wrap gap-x-5 gap-y-1 font-mono text-xs">
                        {dateFields.map((field) => (
                          <div key={field.label} className="flex gap-1.5">
                            <dt>{field.label}</dt>
                            <dd className="text-foreground">{field.value}</dd>
                          </div>
                        ))}
                      </dl>
                    ) : null}
                  </header>

                  {item.content.trim() ? (
                    <div data-testid="sheet-content-preview">
                      <MarkdownContent
                        content={item.content}
                        updatedAt={item.updated_at}
                        itemId={item.id}
                        interactive
                        onContentSaved={(savedContent, savedUpdatedAt) => {
                          updateContent(savedContent, savedUpdatedAt);
                          queryClient.invalidateQueries({
                            queryKey: queryKeys.browse.all,
                          });
                          invalidateViewsQueries(queryClient);
                        }}
                        onContentReloadNeeded={refetch}
                        className="text-sm"
                      />
                    </div>
                  ) : null}

                  {bm?.image ? (
                    <figure className="flex flex-col gap-2">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`/api/bookmarks/image-proxy?url=${encodeURIComponent(bm.image)}`}
                        alt={item.title ?? ""}
                        className="border-border h-auto max-h-32 max-w-full rounded-sm border object-cover"
                      />
                    </figure>
                  ) : null}

                  {!hasWorkflowStatus(item.type) ? (
                    <MetadataSection
                      type={item.type}
                      metadata={item.metadata}
                    />
                  ) : (
                    <MetadataSection
                      type={item.type}
                      metadata={item.metadata}
                      excludeLabels={["Status", "Start", "End", "Due"]}
                    />
                  )}

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
                        className="text-primary line-clamp-1 break-all hover:underline"
                      >
                        {item.source_url}
                      </a>
                      {bm?.siteName ? (
                        <span className="text-muted-foreground shrink-0">
                          ({bm.siteName})
                        </span>
                      ) : null}
                    </p>
                  ) : null}

                  {tags && tags.length > 0 ? (
                    <section aria-label="Tags">
                      <h3 className="text-muted-foreground mb-2 font-mono text-xs font-medium tracking-wide uppercase">
                        Tags
                      </h3>
                      <ul className="flex flex-wrap items-center gap-1.5">
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
                    </section>
                  ) : null}
                </div>
              </div>

              {(links && links.outbound.length > 0) ||
              (links && links.inbound.length > 0) ? (
                <div className="border-border bg-background shrink-0 border-t p-4">
                  <div className="flex max-h-64 flex-col gap-3 overflow-y-auto">
                    {links && links.outbound.length > 0 ? (
                      <details
                        open
                        className="group [&>summary::-webkit-details-marker]:hidden [&>summary::marker]:hidden"
                      >
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

                    {links && links.inbound.length > 0 ? (
                      <details
                        open
                        className="group [&>summary::-webkit-details-marker]:hidden [&>summary::marker]:hidden"
                      >
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

      {data && (
        <EditDialog
          item={data.item}
          tags={data.tags}
          open={editOpen}
          onOpenChange={setEditOpen}
          onSaved={handleEditSaved}
          includeHidden={includeHidden}
          includePrivate={includePrivate}
        />
      )}

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
