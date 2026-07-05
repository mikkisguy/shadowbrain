"use client";

/**
 * Edit button + dialog for the item detail page.
 *
 * Renders a pencil button in the DetailLayout header toolbar that opens
 * an edit dialog pre-filled with the current item data. On save, the
 * page data is refreshed via `router.refresh()`.
 *
 * Used as the `headerActions` slot of DetailLayout.
 */

import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EditDialog } from "@/components/edit-dialog/edit-dialog";
import { useEditDialog } from "@/components/edit-dialog/use-edit-dialog";
import type { ContentItem, Tag } from "@/db/index";

export interface ItemEditorProps {
  item: ContentItem;
  tags: Tag[];
}

export function ItemEditor({ item, tags }: ItemEditorProps) {
  const { open, setOpen } = useEditDialog();
  const router = useRouter();

  const handleSaved = () => {
    router.refresh();
  };

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={() => setOpen(true)}
        aria-label="Edit item"
        title="Edit item"
        className="text-muted-foreground hover:text-foreground shrink-0"
      >
        <Pencil className="size-4" />
      </Button>
      <EditDialog
        item={item}
        tags={tags}
        open={open}
        onOpenChange={setOpen}
        onSaved={handleSaved}
      />
    </>
  );
}
