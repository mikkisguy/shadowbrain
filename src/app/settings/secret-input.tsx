"use client";

import { useState } from "react";

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

  const showMasked = isSet && !editing && value.trim() === "";

  return (
    <div className="flex flex-col gap-2">
      <label
        htmlFor={id}
        className="text-foreground font-sans text-sm font-medium"
      >
        {label}
      </label>
      {showMasked ? (
        <div className="flex flex-wrap items-center gap-2">
          <span
            className="text-muted-foreground bg-surface-muted rounded-sm px-2 py-1 font-mono text-xs"
            data-testid={testId ? `${testId}-masked` : undefined}
          >
            Configured
          </span>
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
