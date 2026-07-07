/**
 * Individual tag row for the Tags page list.
 *
 * Renders the tag name, usage count badge, and action buttons
 * (merge, rename, delete).
 */

import { GitMerge, Pencil, Tag, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";

import type { TagWithCount } from "./types";

export interface TagRowProps {
  tag: TagWithCount;
  onRename: (tag: TagWithCount) => void;
  onDelete: (tag: TagWithCount) => void;
  onMerge: (tag: TagWithCount) => void;
}

export function TagRow({ tag, onRename, onDelete, onMerge }: TagRowProps) {
  return (
    <li
      key={tag.id}
      data-testid="tag-row"
      className="group/row flex items-center justify-between gap-4 p-4"
    >
      <div className="flex min-w-0 items-center gap-3">
        <Tag aria-hidden className="text-muted-foreground size-4 shrink-0" />
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
          aria-label={`Merge ${tag.name}`}
          data-testid="tag-merge-button"
          onClick={() => onMerge(tag)}
        >
          <GitMerge className="size-3.5" />
        </Button>
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
  );
}
