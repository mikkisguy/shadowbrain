"use client";

/**
 * Bulk delete-unused confirmation dialog.
 *
 * Deletes every tag with zero usages in one server round-trip. The
 * count is computed authoritatively on the server inside a
 * transaction so stale client state cannot delete the wrong set.
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

export interface DeleteUnusedTagsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** How many unused tags the client currently sees (for the copy). */
  unusedCount: number;
  onConfirm: () => Promise<void>;
}

export function DeleteUnusedTagsDialog({
  open,
  onOpenChange,
  unusedCount,
  onConfirm,
}: DeleteUnusedTagsDialogProps) {
  const busyRef = useRef(false);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && busyRef.current) return;
        onOpenChange(next);
      }}
    >
      <DialogContent data-testid="delete-unused-tags-dialog">
        {open && (
          <DeleteUnusedTagsBody
            unusedCount={unusedCount}
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

function DeleteUnusedTagsBody({
  unusedCount,
  onConfirm,
  onBusyChange,
  onClose,
}: {
  unusedCount: number;
  onConfirm: () => Promise<void>;
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
      await onConfirm();
      onBusyChange(false);
      onClose();
    } catch {
      setIsDeleting(false);
      onBusyChange(false);
      setError("Couldn't delete unused tags. Please try again.");
    }
  }

  const label = unusedCount === 1 ? "tag" : "tags";

  return (
    <>
      <DialogHeader>
        <DialogTitle>Delete unused tags</DialogTitle>
        <DialogDescription>
          Delete {unusedCount} unused {label}? Tags that aren&apos;t attached to
          any items will be removed. This can&apos;t be undone.
        </DialogDescription>
      </DialogHeader>

      {error && (
        <p
          role="alert"
          data-testid="delete-unused-tags-error"
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
          data-testid="delete-unused-tags-confirm"
        >
          {isDeleting && (
            <Loader2 aria-hidden className="size-3.5 animate-spin" />
          )}
          Delete unused
        </Button>
      </DialogFooter>
    </>
  );
}
