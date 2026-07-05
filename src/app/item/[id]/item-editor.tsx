"use client";

/**
 * Edit + delete buttons for the item detail page.
 *
 * Renders a pencil (edit) button and a trash (delete) button in the
 * DetailLayout header toolbar. The edit button opens an edit dialog
 * pre-filled with the current item data. The delete button opens a
 * confirmation dialog that calls `DELETE /api/items/[id]` on confirm.
 *
 * Used as the `headerActions` slot of DetailLayout.
 */

import { useRouter } from "next/navigation";
import { Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { EditDialog } from "@/components/edit-dialog/edit-dialog";
import { useEditDialog } from "@/components/edit-dialog/use-edit-dialog";
import { DeleteConfirmationDialog } from "@/components/delete-dialog/delete-confirmation-dialog";
import { useDeleteDialog } from "@/components/delete-dialog/use-delete-dialog";
import { queryKeys } from "@/lib/query-config";
import type { ContentItem, Tag } from "@/db/index";

export interface ItemEditorProps {
  item: ContentItem;
  tags: Tag[];
}

export function ItemEditor({ item, tags }: ItemEditorProps) {
  const editDialog = useEditDialog();
  const deleteDialog = useDeleteDialog();
  const router = useRouter();
  const queryClient = useQueryClient();

  const handleSaved = () => {
    router.refresh();
  };

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/items/${item.id}`, {
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
      deleteDialog.setOpen(false);
      router.push("/");
    },
    onError: () => {
      toast.error("Failed to delete item.");
    },
  });

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={() => editDialog.setOpen(true)}
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
        onClick={() => deleteDialog.setOpen(true)}
        aria-label="Delete item"
        title="Delete item"
        className="text-muted-foreground hover:text-foreground shrink-0"
      >
        <Trash2 className="size-4" />
      </Button>
      <EditDialog
        item={item}
        tags={tags}
        open={editDialog.open}
        onOpenChange={editDialog.setOpen}
        onSaved={handleSaved}
      />
      <DeleteConfirmationDialog
        open={deleteDialog.open}
        onOpenChange={deleteDialog.setOpen}
        itemTitle={item.title}
        itemType={item.type}
        onConfirm={() => deleteMutation.mutate()}
        isDeleting={deleteMutation.isPending}
      />
    </>
  );
}
