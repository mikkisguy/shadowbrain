"use client";

/**
 * Create / rename tag dialog.
 *
 * A single controlled dialog drives both flows — the only
 * differences are the title, the initial input value, and the
 * submit label. Validation mirrors the server contract in
 * `/api/tags` (1–64 chars, `[a-zA-Z0-9 _-]` only) so the user
 * gets instant feedback instead of a round-trip, and a
 * case-insensitive uniqueness pre-check against the known list
 * turns the common duplicate into an inline message. The server's
 * unique constraint is still the source of truth: a 409 from a
 * concurrent create is mapped to the same inline message.
 *
 * The form lives in an inner component that is mounted only while
 * the dialog is open, so its state resets to the initial values on
 * the next open without a reset effect.
 */

import { useId, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// Mirrors TAG_NAME_REGEX in the /api/tags route handlers.
const TAG_NAME_REGEX = /^[a-zA-Z0-9 _-]+$/;
const MAX_LENGTH = 64;

export interface TagFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "rename";
  /** The name being renamed (rename mode); seeds the input. */
  initialName?: string;
  /** Existing tag names for the uniqueness pre-check. In rename
   *  mode the caller should exclude the tag's own current name so
   *  re-saving the same name is not flagged as a duplicate. */
  existingNames: string[];
  /** Perform the mutation. Throws `TagsApiError` on failure. */
  onSubmit: (name: string) => Promise<void>;
}

function validate(name: string, existingLower: Set<string>): string | null {
  const trimmed = name.trim();
  if (trimmed.length === 0) return "Name cannot be empty.";
  if (trimmed.length > MAX_LENGTH) return "Name is too long (max 64).";
  if (!TAG_NAME_REGEX.test(trimmed)) {
    return "Use only letters, numbers, spaces, hyphens, and underscores.";
  }
  if (existingLower.has(trimmed.toLowerCase())) {
    return "A tag with this name already exists.";
  }
  return null;
}

export function TagFormDialog({
  open,
  onOpenChange,
  mode,
  initialName = "",
  existingNames,
  onSubmit,
}: TagFormDialogProps) {
  // While a submit is in flight we block every dismiss path (Escape,
  // overlay click, the header X, Cancel) so the dialog can't be torn
  // down mid-request and leave the mutation to land silently. Tracked
  // in a ref so the gate reads the live value without re-rendering.
  const busyRef = useRef(false);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && busyRef.current) return;
        onOpenChange(next);
      }}
    >
      <DialogContent data-testid="tag-form-dialog">
        {open && (
          <TagForm
            mode={mode}
            initialName={initialName}
            existingNames={existingNames}
            onSubmit={onSubmit}
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

function TagForm({
  mode,
  initialName,
  existingNames,
  onSubmit,
  onBusyChange,
  onClose,
}: {
  mode: "create" | "rename";
  initialName: string;
  existingNames: string[];
  onSubmit: (name: string) => Promise<void>;
  onBusyChange: (busy: boolean) => void;
  onClose: () => void;
}) {
  const inputId = useId();
  const [name, setName] = useState(initialName);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const existingLower = new Set(
    existingNames.map((n) => n.trim().toLowerCase())
  );

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (isSubmitting) return;

    const validationError = validate(name, existingLower);
    if (validationError) {
      setError(validationError);
      inputRef.current?.focus();
      return;
    }

    setIsSubmitting(true);
    onBusyChange(true);
    setError(null);
    try {
      await onSubmit(name.trim());
      onBusyChange(false);
      onClose();
    } catch (err) {
      setIsSubmitting(false);
      onBusyChange(false);
      if (
        err &&
        typeof err === "object" &&
        "code" in err &&
        (err as { code: unknown }).code === "CONFLICT"
      ) {
        setError("A tag with this name already exists.");
        return;
      }
      setError("Something went wrong. Please try again.");
    }
  }

  const title = mode === "create" ? "New tag" : "Rename tag";
  const submitLabel = mode === "create" ? "Create" : "Save";

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>
          {mode === "create"
            ? "Tags label your content so you can group and filter it."
            : "Renaming updates the tag everywhere it is used."}
        </DialogDescription>
      </DialogHeader>

      <div className="flex flex-col gap-2">
        <label
          htmlFor={inputId}
          className="text-foreground font-sans text-sm font-medium"
        >
          Name
        </label>
        <Input
          id={inputId}
          ref={inputRef}
          value={name}
          autoFocus
          maxLength={MAX_LENGTH}
          autoComplete="off"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${inputId}-error` : undefined}
          data-testid="tag-name-input"
          onChange={(event) => {
            setName(event.target.value);
            if (error) setError(null);
          }}
          placeholder="e.g. machine-learning"
        />
        {error && (
          <p
            id={`${inputId}-error`}
            role="alert"
            data-testid="tag-form-error"
            className="text-error font-sans text-sm"
          >
            {error}
          </p>
        )}
      </div>

      <DialogFooter>
        <DialogClose
          render={<Button type="button" variant="outline" />}
          disabled={isSubmitting}
        >
          Cancel
        </DialogClose>
        <Button
          type="submit"
          variant="inverted"
          disabled={isSubmitting}
          data-testid="tag-form-submit"
        >
          {isSubmitting && (
            <Loader2 aria-hidden className="size-3.5 animate-spin" />
          )}
          {submitLabel}
        </Button>
      </DialogFooter>
    </form>
  );
}
