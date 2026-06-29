"use client";

/**
 * Merge-tag dialog.
 *
 * Moves every `content_tags` reference from a source tag to a chosen
 * target, then deletes the source. The target picker lists every other
 * tag; self-merge is blocked client-side and server-side.
 */

import { Loader2 } from "lucide-react";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Combobox } from "@/components/ui/combobox";
import type { TagWithCount } from "./types";

export interface MergeTagDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The tag being merged away; `null` while closed. */
  source: TagWithCount | null;
  /** All tags (used to build the target picker). */
  allTags: TagWithCount[];
  onConfirm: (sourceId: string, targetId: string) => Promise<void>;
}

export function MergeTagDialog({
  open,
  onOpenChange,
  source,
  allTags,
  onConfirm,
}: MergeTagDialogProps) {
  const busyRef = useRef(false);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && busyRef.current) return;
        onOpenChange(next);
      }}
    >
      <DialogContent data-testid="merge-tag-dialog">
        {source && (
          <MergeTagBody
            source={source}
            targets={allTags.filter((tag) => tag.id !== source.id)}
            onConfirm={onConfirm}
            onBusyChange={(busy) => {
              busyRef.current = busy;
            }}
            onClose={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function MergeTagBody({
  source,
  targets,
  onConfirm,
  onBusyChange,
  onClose,
}: {
  source: TagWithCount;
  targets: TagWithCount[];
  onConfirm: (sourceId: string, targetId: string) => Promise<void>;
  onBusyChange: (busy: boolean) => void;
  onClose: () => void;
}) {
  const [targetId, setTargetId] = useState<string | null>(
    targets[0]?.id ?? null
  );
  const [error, setError] = useState<string | null>(null);
  const [isMerging, setIsMerging] = useState(false);

  const targetOptions = targets.map((tag) => ({
    value: tag.id,
    label: tag.name,
  }));

  async function handleConfirm() {
    if (isMerging || !targetId) return;
    if (targetId === source.id) {
      setError("Choose a different tag to merge into.");
      return;
    }

    setIsMerging(true);
    onBusyChange(true);
    setError(null);
    try {
      await onConfirm(source.id, targetId);
      onBusyChange(false);
      onClose();
    } catch {
      setIsMerging(false);
      onBusyChange(false);
      setError("Couldn't merge the tags. Please try again.");
    }
  }

  const usage =
    source.count > 0
      ? `${source.count} ${source.count === 1 ? "item" : "items"} will be retagged. `
      : "This tag isn't used by any items.";

  return (
    <>
      <DialogHeader>
        <DialogTitle>Merge tag</DialogTitle>
        <DialogDescription>
          Merge{" "}
          <span className="text-foreground font-medium">{source.name}</span>{" "}
          into another tag. {usage} The source tag will be deleted. This
          can&apos;t be undone.
        </DialogDescription>
      </DialogHeader>

      <div className="flex flex-col gap-2">
        <span className="text-foreground font-sans text-sm font-medium">
          Merge into
        </span>
        {targets.length === 0 ? (
          <p className="text-muted-foreground font-sans text-sm">
            Create another tag first — there&apos;s nothing to merge into.
          </p>
        ) : (
          <Combobox
            options={targetOptions}
            value={targetId}
            onValueChange={(value) => {
              setTargetId(value);
              if (error) setError(null);
            }}
            placeholder="Search tags…"
            emptyMessage="No tags found."
            aria-label="Select target tag"
            data-testid="merge-target-select"
          />
        )}
      </div>

      {error && (
        <p
          role="alert"
          data-testid="merge-tag-error"
          className="text-error font-sans text-sm"
        >
          {error}
        </p>
      )}

      <DialogFooter>
        <DialogClose
          render={<Button type="button" variant="outline" />}
          disabled={isMerging}
        >
          Cancel
        </DialogClose>
        <Button
          type="button"
          variant="inverted"
          disabled={isMerging || targets.length === 0 || !targetId}
          onClick={handleConfirm}
          data-testid="merge-tag-confirm"
        >
          {isMerging && (
            <Loader2 aria-hidden className="size-3.5 animate-spin" />
          )}
          Merge
        </Button>
      </DialogFooter>
    </>
  );
}
