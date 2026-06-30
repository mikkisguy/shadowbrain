"use client";

import { useState } from "react";

import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function SecretInput({
  id,
  label,
  isSet,
  value,
  onChange,
  onClear,
  placeholder = "Enter API key",
  "data-testid": testId,
}: {
  id: string;
  label: string;
  isSet: boolean;
  value: string;
  onChange: (value: string) => void;
  onClear: () => void;
  placeholder?: string;
  "data-testid"?: string;
}) {
  const [editing, setEditing] = useState(!isSet);

  // The masked (read-only) view shows when a key is configured, no new
  // value has been typed, and the user hasn't asked to change it. The
  // parent remounts this component (via a `key` derived from the save
  // version) after each load/save/discard so `editing` re-initialises
  // against the fresh `isSet` — otherwise it would stay stale-`true`
  // right after saving a key and the masked view would never appear.
  const showMasked = isSet && !editing && value.trim() === "";

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <label
          htmlFor={id}
          className="text-foreground font-sans text-sm font-medium"
        >
          {label}
        </label>
        <span
          className={`inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 font-mono text-[0.65rem] font-medium tracking-[0.1em] uppercase ${
            isSet
              ? "text-success bg-success/10"
              : "text-muted-foreground bg-surface-muted"
          }`}
          data-testid={testId ? `${testId}-status` : undefined}
        >
          {isSet ? (
            <>
              <Check className="size-3" aria-hidden="true" />
              Configured
            </>
          ) : (
            "Not set"
          )}
        </span>
      </div>

      {showMasked ? (
        <div className="flex flex-wrap items-center gap-2">
          <div
            aria-label={`${label} is configured and hidden`}
            className="border-input text-muted-foreground flex h-8 min-w-[16rem] flex-1 items-center rounded-lg border px-2.5 font-mono text-sm tracking-[0.25em]"
            data-testid={testId ? `${testId}-masked` : undefined}
          >
            ••••••••••••••••••••
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setEditing(true)}
            data-testid={testId ? `${testId}-change` : undefined}
          >
            Change
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              onClear();
              setEditing(true);
            }}
            data-testid={testId ? `${testId}-clear` : undefined}
          >
            Clear
          </Button>
        </div>
      ) : (
        <Input
          id={id}
          type="password"
          autoComplete="off"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          data-testid={testId}
        />
      )}
    </div>
  );
}
