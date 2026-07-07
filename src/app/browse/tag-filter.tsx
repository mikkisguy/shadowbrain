"use client";

import { useId, useMemo, useRef, useState } from "react";
import { Tag as TagIcon, X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

import { queryKeys, staleTimes } from "@/lib/query-config";

import type { BrowseFilters } from "./types";

interface TagFilterProps {
  selectedTags: string[];
  onPatch: (patch: Partial<BrowseFilters>) => void;
}

export function TagFilter({ selectedTags, onPatch }: TagFilterProps) {
  const tagId = useId();

  // ---- tag typeahead ---------------------------------------------
  const [tagInput, setTagInput] = useState("");
  const tagInputRef = useRef<HTMLInputElement>(null);

  // Fetch tags for typeahead suggestions. Enabled on first focus.
  const [tagsEnabled, setTagsEnabled] = useState(false);
  const { data: tagsData } = useQuery({
    queryKey: queryKeys.tags.typeahead,
    queryFn: async ({ signal }) => {
      const res = await fetch("/api/tags", {
        credentials: "same-origin",
        headers: { Accept: "application/json" },
        signal,
      });
      if (!res.ok) return null;
      const body = (await res.json()) as { tags: { name: string }[] };
      return body.tags;
    },
    enabled: tagsEnabled,
    staleTime: staleTimes.tags,
  });

  const allTagNames = useMemo(() => {
    if (!tagsData) return null;
    return tagsData.map((t) => t.name);
  }, [tagsData]);

  const suggestions = useMemo(() => {
    if (!allTagNames) return [];
    const q = tagInput.trim().toLowerCase();
    if (!q) return [];
    const taken = new Set(selectedTags.map((t) => t.toLowerCase()));
    return allTagNames
      .filter(
        (name) =>
          name.toLowerCase().includes(q) && !taken.has(name.toLowerCase())
      )
      .slice(0, 8);
  }, [allTagNames, tagInput, selectedTags]);

  function addTag(raw: string) {
    const name = raw.trim();
    if (!name) return;
    // Dedupe case-insensitively (the DB matches tags COLLATE NOCASE).
    if (selectedTags.some((t) => t.toLowerCase() === name.toLowerCase())) {
      setTagInput("");
      return;
    }
    onPatch({ tag: [...selectedTags, name].join(",") });
    setTagInput("");
  }

  function removeTag(name: string) {
    const next = selectedTags.filter((t) => t !== name);
    onPatch({ tag: next.length > 0 ? next.join(",") : undefined });
  }

  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={tagId}
        className="text-muted-foreground flex items-center gap-1.5 font-sans text-[0.7rem] font-medium tracking-[0.12em] uppercase"
      >
        <TagIcon className="size-3" />
        Tags
      </label>
      <div
        className="border-input focus-within:border-ring focus-within:ring-ring/50 flex flex-wrap items-center gap-1.5 rounded-lg border bg-transparent px-2 py-1 transition-colors focus-within:ring-3"
        data-testid="tag-chips"
      >
        {selectedTags.map((tag) => (
          <span
            key={tag}
            className="bg-secondary text-secondary-foreground inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs"
          >
            {tag}
            <button
              type="button"
              aria-label={`Remove tag ${tag}`}
              onClick={() => removeTag(tag)}
              className="hover:text-foreground -mr-0.5 inline-flex size-3.5 items-center justify-center transition-colors"
              data-testid={`tag-remove-${tag}`}
            >
              <X className="size-3" />
            </button>
          </span>
        ))}
        <input
          ref={tagInputRef}
          id={tagId}
          className="text-foreground placeholder:text-muted-foreground min-w-[8rem] flex-1 bg-transparent text-sm outline-none"
          placeholder={
            selectedTags.length > 0 ? "Add tag…" : "Type to search tags…"
          }
          value={tagInput}
          onChange={(e) => setTagInput(e.target.value)}
          onFocus={() => setTagsEnabled(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addTag(tagInput);
            } else if (
              e.key === "Backspace" &&
              tagInput === "" &&
              selectedTags.length > 0
            ) {
              // Backspace on an empty input removes the last chip.
              removeTag(selectedTags[selectedTags.length - 1]);
            }
          }}
          data-testid="advanced-tag"
        />
      </div>
      {suggestions.length > 0 ? (
        <ul
          className="bg-popover text-popover-foreground border-border z-10 flex flex-col overflow-hidden rounded-md border"
          data-testid="tag-suggestions"
        >
          {suggestions.map((name) => (
            <li key={name}>
              <button
                type="button"
                className="hover:bg-muted hover:text-foreground w-full px-2.5 py-1 text-left text-sm transition-colors"
                onClick={() => {
                  addTag(name);
                  tagInputRef.current?.focus();
                }}
                data-testid={`tag-suggestion-${name}`}
              >
                {name}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
