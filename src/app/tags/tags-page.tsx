"use client";

/**
 * Tags page — main client component.
 *
 * Lists every tag with its usage count and exposes the full CRUD
 * surface: create (a "+ New tag" button → form dialog), rename
 * (per-row → form dialog seeded with the current name), and delete
 * (per-row → confirmation dialog). The list itself and its loading /
 * error / empty states are owned by `useTags`; every mutation calls
 * `refresh()` on success so the list and its counts re-sync with the
 * server.
 *
 * Sorting is a purely client-side toggle between name and usage count.
 * Clicking the already-active field flips its direction; the default
 * is name ascending.
 */

import { ArrowDown, ArrowUp, Pencil, Plus, Tag, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { createTag, deleteTag, renameTag } from "./api";
import { DeleteTagDialog } from "./delete-tag-dialog";
import { TagFormDialog } from "./tag-form-dialog";
import { useTags } from "./use-tags";
import type { TagSort, TagSortField, TagWithCount } from "./types";

function sortTags(tags: TagWithCount[], sort: TagSort): TagWithCount[] {
  const sorted = [...tags].sort((a, b) => {
    if (sort.field === "count") {
      // Tie-break equal counts by name so the order is stable.
      if (a.count !== b.count) return a.count - b.count;
      return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    }
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });
  return sort.direction === "desc" ? sorted.reverse() : sorted;
}

const SKELETON_ROW_COUNT = 5;

export function TagsPage() {
  const { tags, status, error, refresh } = useTags();

  const [sort, setSort] = useState<TagSort>({
    field: "name",
    direction: "asc",
  });

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<TagWithCount | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TagWithCount | null>(null);

  const sortedTags = useMemo(() => sortTags(tags, sort), [tags, sort]);
  const allNames = useMemo(() => tags.map((t) => t.name), [tags]);
  const renameNames = useMemo(
    () =>
      renameTarget ? allNames.filter((n) => n !== renameTarget.name) : allNames,
    [allNames, renameTarget]
  );

  function toggleSort(field: TagSortField) {
    setSort((prev) =>
      prev.field === field
        ? { field, direction: prev.direction === "asc" ? "desc" : "asc" }
        : { field, direction: field === "count" ? "desc" : "asc" }
    );
  }

  return (
    <main
      id="main-content"
      data-testid="tags-page"
      className="mx-auto flex w-full max-w-screen-md flex-col gap-8 px-4 py-8 sm:px-6 sm:py-12"
    >
      <header className="flex flex-col gap-3 pb-2">
        <p className="text-muted-foreground font-mono text-[0.7rem] font-medium tracking-[0.16em] uppercase">
          {status === "success" ? `${tags.length} tags` : "Tags"}
        </p>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h1 className="text-foreground font-serif text-3xl font-semibold tracking-[-0.01em] sm:text-4xl">
            Tags
          </h1>
          <Button
            type="button"
            variant="inverted"
            onClick={() => setIsCreateOpen(true)}
            data-testid="new-tag-button"
          >
            <Plus className="size-4" />
            New tag
          </Button>
        </div>
      </header>

      <div className="flex items-center justify-between gap-2">
        <div
          role="group"
          aria-label="Sort tags"
          className="border-border bg-surface-elevated/50 inline-flex items-center gap-0.5 rounded-sm border p-0.5"
          data-testid="sort-toggle"
        >
          <SortButton
            label="Name"
            active={sort.field === "name"}
            direction={sort.direction}
            onClick={() => toggleSort("name")}
            testId="sort-name"
          />
          <SortButton
            label="Count"
            active={sort.field === "count"}
            direction={sort.direction}
            onClick={() => toggleSort("count")}
            testId="sort-count"
          />
        </div>
      </div>

      <TagsList
        tags={sortedTags}
        status={status}
        error={error}
        onRetry={refresh}
        onRename={setRenameTarget}
        onDelete={setDeleteTarget}
      />

      <TagFormDialog
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
        mode="create"
        existingNames={allNames}
        onSubmit={async (name) => {
          await createTag(name);
          refresh();
        }}
      />

      <TagFormDialog
        open={renameTarget !== null}
        onOpenChange={(open) => {
          if (!open) setRenameTarget(null);
        }}
        mode="rename"
        initialName={renameTarget?.name ?? ""}
        existingNames={renameNames}
        onSubmit={async (name) => {
          if (!renameTarget) return;
          await renameTag(renameTarget.id, name);
          refresh();
        }}
      />

      <DeleteTagDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        tag={deleteTarget}
        onConfirm={async (id) => {
          await deleteTag(id);
          refresh();
        }}
      />
    </main>
  );
}

function SortButton({
  label,
  active,
  direction,
  onClick,
  testId,
}: {
  label: string;
  active: boolean;
  direction: "asc" | "desc";
  onClick: () => void;
  testId: string;
}) {
  return (
    <Button
      type="button"
      variant={active ? "secondary" : "ghost"}
      size="sm"
      aria-pressed={active}
      data-testid={testId}
      onClick={onClick}
    >
      {label}
      {active &&
        (direction === "asc" ? (
          <ArrowUp className="size-3.5" />
        ) : (
          <ArrowDown className="size-3.5" />
        ))}
    </Button>
  );
}

function TagsList({
  tags,
  status,
  error,
  onRetry,
  onRename,
  onDelete,
}: {
  tags: TagWithCount[];
  status: "loading" | "success" | "error";
  error: string | null;
  onRetry: () => void;
  onRename: (tag: TagWithCount) => void;
  onDelete: (tag: TagWithCount) => void;
}) {
  if (status === "error") {
    return (
      <div
        data-testid="tags-error"
        className="border-border bg-surface-elevated flex flex-col items-start gap-3 rounded-sm border p-6"
      >
        <p className="text-error font-sans text-sm font-medium">
          {error ?? "Couldn't load your tags right now."}
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onRetry}
          data-testid="tags-retry"
        >
          Try again
        </Button>
      </div>
    );
  }

  if (status === "loading") {
    return (
      <div
        data-testid="tags-loading"
        role="status"
        aria-label="Loading tags"
        className="border-border divide-border bg-surface-elevated/40 flex flex-col divide-y rounded-sm border"
      >
        {Array.from({ length: SKELETON_ROW_COUNT }, (_, i) => (
          <div key={i} className="flex items-center justify-between gap-4 p-4">
            <div className="bg-surface-muted h-4 w-40 rounded-sm" />
            <div className="bg-surface-muted h-4 w-10 rounded-sm" />
          </div>
        ))}
      </div>
    );
  }

  if (tags.length === 0) {
    return (
      <div
        data-testid="tags-empty"
        className="border-border bg-surface-elevated/40 flex flex-col gap-2 rounded-sm border border-dashed p-8 text-center"
      >
        <p className="text-foreground font-sans text-base font-medium">
          No tags yet
        </p>
        <p className="text-muted-foreground font-sans text-sm">
          Create your first tag to start grouping your content.
        </p>
      </div>
    );
  }

  return (
    <ul
      data-testid="tags-list"
      className="border-border divide-border bg-surface-elevated/40 flex flex-col divide-y rounded-sm border"
    >
      {tags.map((tag) => (
        <li
          key={tag.id}
          data-testid="tag-row"
          className="group/row flex items-center justify-between gap-4 p-4"
        >
          <div className="flex min-w-0 items-center gap-3">
            <Tag
              aria-hidden
              className="text-muted-foreground size-4 shrink-0"
            />
            <span className="text-foreground truncate font-sans text-sm font-medium">
              {tag.name}
            </span>
            <span
              data-testid="tag-count"
              className="text-muted-foreground bg-surface-muted shrink-0 rounded-sm px-1.5 py-0.5 font-mono text-xs"
            >
              {tag.count}
            </span>
          </div>

          <div className="flex shrink-0 items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={`Rename ${tag.name}`}
              data-testid="tag-rename-button"
              onClick={() => onRename(tag)}
            >
              <Pencil className="size-3.5" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={`Delete ${tag.name}`}
              data-testid="tag-delete-button"
              onClick={() => onDelete(tag)}
            >
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}
