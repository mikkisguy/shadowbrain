"use client";

import { Button } from "@/components/ui/button";

export function SaveBar({
  visible,
  saving,
  onSave,
  onDiscard,
}: {
  visible: boolean;
  saving: boolean;
  onSave: () => void;
  onDiscard: () => void;
}) {
  if (!visible) return null;

  return (
    <div
      data-testid="settings-save-bar"
      className="border-border bg-background/95 supports-backdrop-filter:bg-background/80 sticky bottom-0 z-30 -mx-4 border-t px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6"
    >
      <div className="mx-auto flex w-full max-w-screen-md flex-wrap items-center justify-between gap-3">
        <p className="text-muted-foreground font-sans text-sm">
          You have unsaved changes
        </p>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onDiscard}
            disabled={saving}
            data-testid="settings-discard"
          >
            Discard
          </Button>
          <Button
            type="button"
            variant="inverted"
            size="sm"
            onClick={onSave}
            disabled={saving}
            data-testid="settings-save-all"
          >
            {saving ? "Saving…" : "Save all"}
          </Button>
        </div>
      </div>
    </div>
  );
}
