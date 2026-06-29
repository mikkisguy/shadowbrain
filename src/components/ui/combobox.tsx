"use client";

import * as React from "react";
import { Combobox as ComboboxPrimitive } from "@base-ui/react/combobox";
import { Check, ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Searchable single-select combobox (shadcn-style) built on Base UI.
 *
 * Unlike `Select`, the trigger is a text input that filters the option
 * list as the user types (Base UI filters the `items` by their `label`
 * automatically). Options are `{ value, label }` pairs; the selected
 * value is surfaced as the bare `value` string.
 *
 * The popup is portalled to `<body>` at `z-[60]` — above the dialog
 * layer (`z-50`) — so the list renders on top of (and is not blurred
 * by) a dialog backdrop when the combobox is used inside a modal.
 */

export interface ComboboxOption {
  value: string;
  label: string;
}

export interface ComboboxProps {
  options: ComboboxOption[];
  value: string | null;
  onValueChange: (value: string | null) => void;
  placeholder?: string;
  emptyMessage?: string;
  /** Forwarded to the input for labelling / testing. */
  "aria-label"?: string;
  "data-testid"?: string;
  id?: string;
  disabled?: boolean;
  className?: string;
}

export function Combobox({
  options,
  value,
  onValueChange,
  placeholder,
  emptyMessage = "No matches found.",
  "aria-label": ariaLabel,
  "data-testid": testId,
  id,
  disabled,
  className,
}: ComboboxProps) {
  const selectedItem = options.find((option) => option.value === value) ?? null;

  return (
    <ComboboxPrimitive.Root
      items={options}
      value={selectedItem}
      onValueChange={(item) =>
        onValueChange(item ? (item as ComboboxOption).value : null)
      }
      disabled={disabled}
    >
      <div
        className={cn(
          "border-input focus-within:border-ring focus-within:ring-ring/50 dark:bg-input/30 flex h-8 w-full items-center gap-2 rounded-lg border bg-transparent px-2.5 py-1 transition-colors focus-within:ring-3",
          disabled && "cursor-not-allowed opacity-50",
          className
        )}
      >
        <ComboboxPrimitive.Input
          id={id}
          aria-label={ariaLabel}
          data-testid={testId}
          placeholder={placeholder}
          className="placeholder:text-muted-foreground h-full w-full min-w-0 bg-transparent text-sm outline-none disabled:cursor-not-allowed"
        />
        <ComboboxPrimitive.Trigger
          aria-label="Toggle options"
          className="text-muted-foreground shrink-0 outline-none"
        >
          <ComboboxPrimitive.Icon>
            <ChevronDown className="size-4" />
          </ComboboxPrimitive.Icon>
        </ComboboxPrimitive.Trigger>
      </div>

      <ComboboxPrimitive.Portal>
        <ComboboxPrimitive.Positioner
          sideOffset={4}
          align="start"
          className="z-[60]"
        >
          <ComboboxPrimitive.Popup
            data-slot="combobox-content"
            className={cn(
              "bg-popover text-popover-foreground border-border max-h-[min(var(--available-height),18rem)] min-w-[var(--anchor-width)] origin-[var(--transform-origin)] overflow-y-auto rounded-lg border p-1 shadow-md",
              "data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 duration-100"
            )}
          >
            <ComboboxPrimitive.Empty className="text-muted-foreground px-2 py-1.5 text-sm">
              {emptyMessage}
            </ComboboxPrimitive.Empty>
            <ComboboxPrimitive.List>
              {(item: ComboboxOption) => (
                <ComboboxPrimitive.Item
                  key={item.value}
                  value={item}
                  className="data-[highlighted]:bg-muted data-[highlighted]:text-foreground relative flex w-full cursor-pointer items-center gap-2 rounded-md py-1.5 pr-8 pl-2 text-sm outline-none select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
                >
                  <ComboboxPrimitive.ItemIndicator className="absolute right-2 inline-flex items-center justify-center">
                    <Check className="size-4" />
                  </ComboboxPrimitive.ItemIndicator>
                  {item.label}
                </ComboboxPrimitive.Item>
              )}
            </ComboboxPrimitive.List>
          </ComboboxPrimitive.Popup>
        </ComboboxPrimitive.Positioner>
      </ComboboxPrimitive.Portal>
    </ComboboxPrimitive.Root>
  );
}
