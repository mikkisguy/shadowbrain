"use client";

import { Button } from "@/components/ui/button";

export function SaveBar({
  dirty,
  saving,
  onSave,
  onDiscard,
}: {
  dirty: boolean;
  saving: boolean;
  onSave: () => void;
  onDiscard: () => void;
}) {
  // Always rendered (sticky) so the save affordance is stable and the
  // layout never jumps. Buttons rest disabled until there are changes.
  const message = saving
    ? "Saving…"
    : dirty
      ? "You have unsaved changes"
      : "No unsaved changes";

  return (
    <div
      data-testid="settings-save-bar"
      className="border-border bg-background/95 supports-backdrop-filter:bg-background/80 sticky bottom-0 z-30 -mx-4 border-t px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6"
    >
      <div className="mx-auto flex w-full max-w-screen-md flex-wrap items-center justify-between gap-3">
        <p className="text-muted-foreground font-sans text-sm">{message}</p>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            mono
            onClick={onDiscard}
            disabled={!dirty || saving}
            data-testid="settings-discard"
          >
            Discard
          </Button>
          <Button
            type="button"
            variant="inverted"
            size="sm"
            mono
            onClick={onSave}
            disabled={!dirty || saving}
            data-testid="settings-save-all"
          >
            {saving ? "Saving…" : "Save all"}
          </Button>
        </div>
      </div>
    </div>
  );
}
