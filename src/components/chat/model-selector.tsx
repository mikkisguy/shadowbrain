"use client";

import { useState, useMemo } from "react";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { formatModelName } from "@/lib/chat/format-model-name";
import type { ModelOption } from "@/lib/chat/providers";
import { ChevronDown } from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ModelSelectorProps {
  provider: string;
  model: string;
  allModels: Record<string, ModelOption[]>;
  onSelect: (provider: string, model: string) => void;
  disabled?: boolean;
}

// ---------------------------------------------------------------------------
// Build a flat option list grouped by provider
// ---------------------------------------------------------------------------

interface SelectableOption {
  provider: string;
  model: string;
  label: string;
  group: string;
  value: string; // unique key for cmdk filtering/selection
}

function buildOptions(
  allModels: Record<string, ModelOption[]>
): SelectableOption[] {
  const result: SelectableOption[] = [];

  // Hermes group (always first)
  const hermesModels = allModels["hermes"] ?? [];
  for (const m of hermesModels) {
    result.push({
      provider: "hermes",
      model: m.id,
      label: "Hermes",
      group: "Hermes",
      value: `hermes:${m.id}`,
    });
  }

  // OpenCode Go group
  const goModels = allModels["opencode-go"] ?? [];
  for (const m of goModels) {
    result.push({
      provider: "opencode-go",
      model: m.id,
      label: formatModelName(m.id),
      group: "OpenCode Go",
      value: `opencode-go:${m.id}`,
    });
  }

  return result;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ModelSelector({
  provider: _provider,
  model,
  allModels,
  onSelect,
  disabled,
}: ModelSelectorProps) {
  const [open, setOpen] = useState(false);

  const options = useMemo(() => buildOptions(allModels), [allModels]);

  const currentLabel = useMemo(() => formatModelName(model), [model]);

  const hermesOptions = useMemo(
    () => options.filter((o) => o.group === "Hermes"),
    [options]
  );
  const goOptions = useMemo(
    () => options.filter((o) => o.group === "OpenCode Go"),
    [options]
  );

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger
        className={cn(
          "border-input placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 dark:bg-input/30 inline-flex h-7 items-center justify-between gap-1 rounded-lg border bg-transparent px-2.5 text-xs transition-colors outline-none focus-visible:ring-3",
          disabled
            ? "cursor-not-allowed opacity-50"
            : "hover:border-foreground/20"
        )}
        disabled={disabled}
      >
        <span className="max-w-[100px] truncate">{currentLabel}</span>
        <ChevronDown className="text-muted-foreground size-3 shrink-0" />
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-0" align="start" sideOffset={4}>
        <Command>
          <CommandInput placeholder="Search models..." />
          <CommandList>
            <CommandEmpty>No models found</CommandEmpty>
            {hermesOptions.length > 0 && (
              <CommandGroup heading="Hermes">
                {hermesOptions.map((o) => (
                  <CommandItem
                    key={o.value}
                    value={o.value}
                    onSelect={() => {
                      onSelect(o.provider, o.model);
                      setOpen(false);
                    }}
                  >
                    {o.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {goOptions.length > 0 && (
              <CommandGroup heading="OpenCode Go">
                {goOptions.map((o) => (
                  <CommandItem
                    key={o.value}
                    value={o.value}
                    onSelect={() => {
                      onSelect(o.provider, o.model);
                      setOpen(false);
                    }}
                  >
                    {o.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
