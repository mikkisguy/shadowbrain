"use client";

import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { OpenRouterModelSummary } from "./types";

type SortField = "name" | "price" | "context";

function formatPricePerMillion(value: string): string {
  const num = Number.parseFloat(value);
  if (Number.isNaN(num)) return "—";
  return `$${(num * 1_000_000).toFixed(2)}/M`;
}

export function BrowseModelsDialog({
  open,
  onOpenChange,
  models,
  loading,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  models: OpenRouterModelSummary[];
  loading: boolean;
  onSelect: (modelId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortField>("name");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let rows = models;
    if (q) {
      rows = rows.filter(
        (model) =>
          model.id.toLowerCase().includes(q) ||
          model.name.toLowerCase().includes(q)
      );
    }

    const sorted = [...rows].sort((a, b) => {
      if (sort === "price") {
        const aPrice = Number.parseFloat(a.pricing.prompt);
        const bPrice = Number.parseFloat(b.pricing.prompt);
        return aPrice - bPrice;
      }
      if (sort === "context") {
        return b.context_length - a.context_length;
      }
      return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    });

    return sorted;
  }, [models, query, sort]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl" showCloseButton>
        <DialogHeader>
          <DialogTitle>Browse OpenRouter models</DialogTitle>
          <DialogDescription>
            Pick a model id. Pricing and context are approximate — confirm on
            openrouter.ai before heavy use.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search models…"
            aria-label="Search OpenRouter models"
            data-testid="browse-models-search"
          />

          <div
            role="group"
            aria-label="Sort models"
            className="border-border bg-surface-elevated/50 inline-flex items-center gap-0.5 self-start rounded-sm border p-0.5"
          >
            {(
              [
                ["name", "Name"],
                ["price", "Price"],
                ["context", "Context"],
              ] as const
            ).map(([field, label]) => (
              <Button
                key={field}
                type="button"
                variant={sort === field ? "secondary" : "ghost"}
                size="sm"
                aria-pressed={sort === field}
                onClick={() => setSort(field)}
              >
                {label}
              </Button>
            ))}
          </div>

          <div
            className="border-border max-h-80 overflow-y-auto rounded-sm border"
            data-testid="browse-models-list"
          >
            {loading ? (
              <p className="text-muted-foreground p-4 text-sm">
                Loading models…
              </p>
            ) : filtered.length === 0 ? (
              <p className="text-muted-foreground p-4 text-sm">
                No models found.
              </p>
            ) : (
              <ul className="divide-border divide-y">
                {filtered.map((model) => (
                  <li key={model.id}>
                    <button
                      type="button"
                      className="hover:bg-muted/50 flex w-full flex-col gap-1 px-3 py-2 text-left"
                      onClick={() => {
                        onSelect(model.id);
                        onOpenChange(false);
                      }}
                      data-testid="browse-model-row"
                    >
                      <span className="text-foreground font-sans text-sm font-medium">
                        {model.name}
                      </span>
                      <span className="text-muted-foreground font-mono text-xs">
                        {model.id}
                      </span>
                      <span className="text-muted-foreground font-mono text-[0.65rem]">
                        in {formatPricePerMillion(model.pricing.prompt)} · out{" "}
                        {formatPricePerMillion(model.pricing.completion)} ·{" "}
                        {model.context_length.toLocaleString()} ctx
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
