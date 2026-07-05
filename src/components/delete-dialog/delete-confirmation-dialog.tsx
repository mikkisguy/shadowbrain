"use client";

/**
 * Reusable delete confirmation dialog.
 *
 * A focused, minimal modal that asks the user to confirm a destructive
 * action. It displays the item's title and type, a warning that the
 * action is irreversible, and a pair of Cancel / Delete buttons.
 *
 * Intended to be driven by `useDeleteDialog` and a `useMutation` in
 * the parent component so the dialog itself has no knowledge of the
 * API — it only calls `onConfirm` when the user commits.
 */

import { Loader2 } from "lucide-react";

import { typeLabel } from "@/lib/content-types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export interface DeleteConfirmationDialogProps {
  /** Whether the dialog is open. */
  open: boolean;
  /** Callback to change the open state. */
  onOpenChange: (open: boolean) => void;
  /** The item's title (displayed as "Untitled" when null). */
  itemTitle: string | null;
  /** The item's type key (e.g. "note", "bookmark") — resolved to a
   *  human-readable label via `typeLabel()`. */
  itemType: string;
  /** Called when the user clicks the Delete button. */
  onConfirm: () => void;
  /** Whether the delete operation is in progress (disables the Delete
   *  button and shows a loading spinner). */
  isDeleting: boolean;
}

export function DeleteConfirmationDialog({
  open,
  onOpenChange,
  itemTitle,
  itemType,
  onConfirm,
  isDeleting,
}: DeleteConfirmationDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete item?</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete this item?
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-1.5">
          <p className="text-foreground font-medium">
            {itemTitle ?? "Untitled"}
          </p>
          <p className="text-muted-foreground font-mono text-xs">
            {typeLabel(itemType)}
          </p>
        </div>

        <p className="text-muted-foreground text-sm">
          This action cannot be undone. All links to this item and its tag
          associations will be removed.
        </p>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isDeleting}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={onConfirm}
            disabled={isDeleting}
          >
            {isDeleting && (
              <Loader2 aria-hidden className="size-3.5 animate-spin" />
            )}
            {isDeleting ? "Deleting\u2026" : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
