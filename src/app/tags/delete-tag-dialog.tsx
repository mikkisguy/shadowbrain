"use client";

/**
 * Delete-tag confirmation dialog.
 *
 * Deleting a tag removes it from every content item that carries it
 * (the `content_tags` rows cascade away server-side), so the dialog
 * spells out the usage count before the user commits. The action is
 * destructive and irreversible, hence the explicit confirm step.
 *
 * The confirm body lives in an inner component that is mounted only
 * while a tag is selected, so its in-flight / error state resets on
 * the next open without a reset effect.
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
import type { TagWithCount } from "./types";

export interface DeleteTagDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The tag to delete; `null` while the dialog is closed. */
  tag: TagWithCount | null;
  /** Perform the delete. Throws on failure. */
  onConfirm: (id: string) => Promise<void>;
}

export function DeleteTagDialog({
  open,
  onOpenChange,
  tag,
  onConfirm,
}: DeleteTagDialogProps) {
  // Block every dismiss path while the delete is in flight so the
  // destructive action can't be "cancelled" after it has already
  // been sent to the server.
  const busyRef = useRef(false);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && busyRef.current) return;
        onOpenChange(next);
      }}
    >
      <DialogContent data-testid="delete-tag-dialog">
        {tag && (
          <DeleteTagBody
            tag={tag}
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

function DeleteTagBody({
  tag,
  onConfirm,
  onBusyChange,
  onClose,
}: {
  tag: TagWithCount;
  onConfirm: (id: string) => Promise<void>;
  onBusyChange: (busy: boolean) => void;
  onClose: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  async function handleConfirm() {
    if (isDeleting) return;
    setIsDeleting(true);
    onBusyChange(true);
    setError(null);
    try {
      await onConfirm(tag.id);
      onBusyChange(false);
      onClose();
    } catch {
      setIsDeleting(false);
      onBusyChange(false);
      setError("Couldn't delete the tag. Please try again.");
    }
  }

  const usage =
    tag.count > 0
      ? `It will be removed from ${tag.count} ${
          tag.count === 1 ? "item" : "items"
        }.`
      : "It isn't used by any items.";

  return (
    <>
      <DialogHeader>
        <DialogTitle>Delete tag</DialogTitle>
        <DialogDescription>
          Delete <span className="text-foreground font-medium">{tag.name}</span>
          ? {usage} This can&apos;t be undone.
        </DialogDescription>
      </DialogHeader>

      {error && (
        <p
          role="alert"
          data-testid="delete-tag-error"
          className="text-error font-sans text-sm"
        >
          {error}
        </p>
      )}

      <DialogFooter>
        <DialogClose
          render={<Button type="button" variant="outline" />}
          disabled={isDeleting}
        >
          Cancel
        </DialogClose>
        <Button
          type="button"
          variant="destructive"
          disabled={isDeleting}
          onClick={handleConfirm}
          data-testid="delete-tag-confirm"
        >
          {isDeleting && (
            <Loader2 aria-hidden className="size-3.5 animate-spin" />
          )}
          Delete
        </Button>
      </DialogFooter>
    </>
  );
}
