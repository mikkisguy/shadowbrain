"use client";

import { AlertCircle, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";

interface DraftIndicatorProps {
  onDiscard: () => void;
}

export function DraftIndicator({ onDiscard }: DraftIndicatorProps) {
  return (
    <div className="bg-muted/50 border-border flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm">
      <div className="flex items-center gap-2">
        <AlertCircle className="text-muted-foreground size-4" aria-hidden />
        <span className="text-muted-foreground">You have an unsaved draft</span>
      </div>
      <Button variant="ghost" size="sm" onClick={onDiscard}>
        <Trash2 className="mr-1.5 size-3.5" aria-hidden />
        Discard
      </Button>
    </div>
  );
}
