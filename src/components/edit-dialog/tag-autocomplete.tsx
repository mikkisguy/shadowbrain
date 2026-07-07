"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { XIcon } from "lucide-react";

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

function useTagAutocomplete(
  tags: string[],
  updateField: (field: "tags", value: string[]) => void
) {
  const [allTags, setAllTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const tagInputRef = useRef<HTMLInputElement>(null);

  // Fetch existing tags when the dialog opens.
  useEffect(() => {
    fetch("/api/tags")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.tags) {
          setAllTags(data.tags.map((t: { name: string }) => t.name));
        }
      })
      .catch(() => {
        // Silently fail — the tag input still works without suggestions.
      });
  }, []);

  const filteredSuggestions = useMemo(() => {
    if (!tagInput.trim()) return [];
    const lower = tagInput.toLowerCase();
    return allTags.filter(
      (name) => name.toLowerCase().includes(lower) && !tags.includes(name)
    );
  }, [tagInput, allTags, tags]);

  const addTag = useCallback(
    (name: string) => {
      const trimmed = name.trim();
      if (!trimmed || tags.includes(trimmed)) return;
      updateField("tags", [...tags, trimmed]);
      setTagInput("");
      setShowSuggestions(false);
      tagInputRef.current?.focus();
    },
    [tags, updateField]
  );

  const removeTag = useCallback(
    (name: string) => {
      updateField(
        "tags",
        tags.filter((t) => t !== name)
      );
    },
    [tags, updateField]
  );

  const handleTagKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter" || e.key === ",") {
        e.preventDefault();
        const value = tagInput.trim();
        if (value) {
          addTag(value);
        }
      }
      if (e.key === "Backspace" && !tagInput && tags.length > 0) {
        removeTag(tags[tags.length - 1]);
      }
      if (e.key === "Escape") {
        setShowSuggestions(false);
      }
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
      }
    },
    [tagInput, addTag, removeTag, tags]
  );

  return {
    allTags,
    tagInput,
    setTagInput,
    showSuggestions,
    setShowSuggestions,
    tagInputRef,
    filteredSuggestions,
    addTag,
    removeTag,
    handleTagKeyDown,
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface TagAutocompleteProps {
  tags: string[];
  updateField: (field: "tags", value: string[]) => void;
}

export function TagAutocomplete({ tags, updateField }: TagAutocompleteProps) {
  const {
    tagInput,
    setTagInput,
    showSuggestions,
    setShowSuggestions,
    tagInputRef,
    filteredSuggestions,
    addTag,
    removeTag,
    handleTagKeyDown,
  } = useTagAutocomplete(tags, updateField);

  return (
    <div className="space-y-1.5">
      <p className="text-muted-foreground text-[11px] font-medium tracking-wider uppercase">
        Tags
      </p>
      <div className="border-border/60 focus-within:border-ring/60 flex flex-wrap items-center gap-1.5 rounded-lg border px-2.5 py-1.5 transition-colors">
        {tags.map((tag) => (
          <span
            key={tag}
            className="bg-muted text-foreground flex items-center gap-1 rounded-sm px-1.5 py-0.5 font-mono text-xs"
          >
            #{tag}
            <button
              type="button"
              onClick={() => removeTag(tag)}
              className="text-muted-foreground hover:text-foreground inline-flex"
              aria-label={`Remove tag ${tag}`}
            >
              <XIcon className="size-3" />
            </button>
          </span>
        ))}
        <div className="relative min-w-[120px] flex-1">
          <input
            ref={tagInputRef}
            type="text"
            value={tagInput}
            onChange={(e) => {
              setTagInput(e.target.value);
              setShowSuggestions(true);
            }}
            onFocus={() => setShowSuggestions(true)}
            onBlur={() => {
              // Delay hiding so click on suggestion registers.
              setTimeout(() => setShowSuggestions(false), 150);
            }}
            onKeyDown={handleTagKeyDown}
            placeholder={tags.length === 0 ? "Add tags\u2026" : ""}
            className="placeholder:text-muted-foreground/50 h-6 min-w-0 flex-1 border-0 bg-transparent px-0 text-sm outline-none"
          />
          {showSuggestions && filteredSuggestions.length > 0 && (
            <div className="bg-popover border-border absolute left-0 z-50 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border p-1 shadow-md">
              {filteredSuggestions.map((name) => (
                <button
                  key={name}
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    addTag(name);
                  }}
                  className="text-foreground hover:bg-muted w-full rounded-md px-2 py-1.5 text-left text-sm"
                >
                  {name}
                </button>
              ))}
            </div>
          )}
          {showSuggestions &&
            tagInput.trim() &&
            filteredSuggestions.length === 0 &&
            !tags.includes(tagInput.trim()) && (
              <div className="bg-popover border-border absolute left-0 z-50 mt-1 w-full rounded-lg border p-1 shadow-md">
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    addTag(tagInput.trim());
                  }}
                  className="text-foreground hover:bg-muted w-full rounded-md px-2 py-1.5 text-left text-sm"
                >
                  Create &ldquo;{tagInput.trim()}&rdquo;
                </button>
              </div>
            )}
        </div>
      </div>
    </div>
  );
}
