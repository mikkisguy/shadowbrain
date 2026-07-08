"use client";

/**
 * Links / backlinks sidebar for the item detail page (issue #26, #161).
 *
 * Client component that renders tags, outbound links, and inbound backlinks.
 * Supports creating new bidirectional links via a search-then-select flow and
 * deleting existing links with a hover-revealed trash button on each row.
 *
 * Props:
 * - `tags` — content tags for the current item
 * - `outbound` — outbound links with enriched target item details
 * - `inbound` — inbound backlinks with enriched source item details
 * - `itemId` — the current item's id (used to exclude from search results
 *   and to pass as `source_id` when creating links)
 */

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Loader2,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useMutation } from "@tanstack/react-query";

import { cn } from "@/lib/utils";
import { typeColorClass, typeLabel } from "@/lib/content-types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { OutboundLink, InboundLink, Tag } from "@/db/index";

// ─── Link type vocabulary ───────────────────────────────────────────────

const LINK_TYPE_OPTIONS = [
  { value: "references", label: "References" },
  { value: "contradicts", label: "Contradicts" },
  { value: "questions", label: "Questions" },
  { value: "answers", label: "Answers" },
  { value: "depends-on", label: "Depends on" },
  { value: "related-to", label: "Related to" },
  { value: "involves", label: "Involves" },
  { value: "bookmarked_for", label: "Bookmarked for" },
  { value: "happened_during", label: "Happened during" },
];

// ─── Helpers ────────────────────────────────────────────────────────────

/** Human-readable label for a `content_links.link_type`. The stored
 *  values use kebab/snake case (`depends-on`, `happened_during`); we
 *  show them as spaced words. Unknown values pass through unchanged. */
export function formatLinkType(linkType: string): string {
  return linkType.replace(/[-_]+/g, " ").trim();
}

// ─── Sub-components ────────────────────────────────────────────────────

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2.5">
      <h2 className="text-muted-foreground font-mono text-xs font-medium tracking-wide uppercase">
        {title}
      </h2>
      {children}
    </section>
  );
}

function LinkRow({
  href,
  title,
  type,
  linkType,
  direction,
  linkId,
  onDelete,
  isDeleting,
}: {
  href: string;
  title: string | null;
  type: string;
  linkType: string;
  direction: "outbound" | "inbound";
  linkId?: string;
  onDelete?: (linkId: string) => void;
  isDeleting?: boolean;
}) {
  const Arrow = direction === "outbound" ? ArrowRight : ArrowLeft;
  return (
    <li className="group relative">
      <div className="flex items-start gap-1">
        <Link
          href={href}
          data-testid="sidebar-link"
          className={cn(
            "group border-border bg-background hover:border-border-strong flex min-w-0 flex-1 flex-col gap-1.5 rounded-sm border px-3 py-2 transition-colors",
            "focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none"
          )}
        >
          <span className="flex items-center gap-2">
            <span
              aria-hidden
              className={cn(
                "size-2 shrink-0 rounded-full",
                typeColorClass(type)
              )}
            />
            <span className="text-foreground line-clamp-2 font-sans text-sm leading-snug font-medium break-words">
              {title?.trim() ? title : "Untitled"}
            </span>
          </span>
          <span className="text-muted-foreground flex items-center gap-1.5 font-mono text-[0.65rem] tracking-wide uppercase">
            <Arrow className="size-3 shrink-0" aria-hidden />
            <span>{formatLinkType(linkType)}</span>
            <span aria-hidden>·</span>
            <span>{typeLabel(type)}</span>
          </span>
        </Link>
        {linkId && onDelete ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            disabled={isDeleting}
            onClick={(e) => {
              e.preventDefault();
              onDelete(linkId);
            }}
            className="text-muted-foreground hover:text-destructive mt-2 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
            aria-label="Remove link"
            title="Remove link"
          >
            {isDeleting ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <Trash2 className="size-3" />
            )}
          </Button>
        ) : null}
      </div>
    </li>
  );
}

/**
 * Search-then-create link form.
 *
 * Renders a search input that queries `/api/search`, shows results in
 * a dropdown, and on selection lets the user pick a link type and
 * confirm creation via POST /api/links.
 */
function CreateLinkForm({ itemId }: { itemId: string }) {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<
    Array<{
      id: string;
      title: string | null;
      type: string;
      image_path: string | null;
    }>
  >([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedItem, setSelectedItem] = useState<{
    id: string;
    title: string | null;
    type: string;
    image_path: string | null;
  } | null>(null);
  const [linkType, setLinkType] = useState("references");
  const [showResults, setShowResults] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Debounced search query. When the input is empty or an item is
  // selected we skip the search — the results are cleared synchronously
  // in the onChange handler below.
  useEffect(() => {
    if (!searchQuery.trim() || selectedItem) return;

    const trimmed = searchQuery.trim();
    const timer = setTimeout(async () => {
      if (abortRef.current) {
        abortRef.current.abort();
      }
      const controller = new AbortController();
      abortRef.current = controller;

      setIsSearching(true);
      try {
        const res = await fetch(
          `/api/search?q=${encodeURIComponent(trimmed)}&limit=10&include_hidden=1&include_private=1`,
          { signal: controller.signal }
        );
        if (!res.ok) return;
        const data = await res.json();
        // Exclude the current item from results
        const filtered = (data.results ?? []).filter(
          (r: { id: string }) => r.id !== itemId
        );
        setSearchResults(filtered);
        setShowResults(true);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          return;
        }
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => clearTimeout(timer);
    // itemId and selectedItem are stable across the debounced callback's
    // lifetime — they are referenced inside the async closure but not
    // listed as deps because we only want the timer to re-fire on query
    // changes. Re-fetching when itemId changes is meaningless (the page
    // has already navigated) and watching selectedItem would cause a
    // redundant search every time the user picks a result.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery]);

  // Close the dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setShowResults(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!selectedItem) throw new Error("No item selected");
      const res = await fetch("/api/links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source_id: itemId,
          target_id: selectedItem.id,
          link_type: linkType,
        }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        const msg: string | undefined = payload?.error?.message;
        throw new Error(msg ?? "Failed to create link");
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success("Link created.");
      setSearchQuery("");
      setSelectedItem(null);
      setSearchResults([]);
      setLinkType("references");
      router.refresh();
    },
    onError: (error: Error) => {
      toast.error(error.message ?? "Failed to create link.");
    },
  });

  const handleSelectItem = (item: {
    id: string;
    title: string | null;
    type: string;
    image_path: string | null;
  }) => {
    setSelectedItem(item);
    setSearchQuery(item.title ?? "Untitled");
    setShowResults(false);
    setSearchResults([]);
  };

  const handleClearSelection = () => {
    setSelectedItem(null);
    setSearchQuery("");
    setSearchResults([]);
  };

  const hasResults = searchResults.length > 0;
  const noResults =
    showResults && !isSearching && searchQuery.trim().length > 0 && !hasResults;

  return (
    <div ref={containerRef} className="relative flex flex-col gap-2">
      {/* Search input */}
      <div className="relative">
        <Search
          className="text-muted-foreground pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2"
          aria-hidden
        />
        <Input
          value={searchQuery}
          onChange={(e) => {
            const value = e.target.value;
            setSearchQuery(value);
            if (selectedItem) {
              setSelectedItem(null);
            }
            if (!value.trim()) {
              setSearchResults([]);
              setShowResults(false);
            }
          }}
          onFocus={() => {
            if (searchResults.length > 0 && !selectedItem) {
              setShowResults(true);
            }
          }}
          placeholder="Search items to link..."
          className="pl-7 text-xs"
          aria-label="Search items to link"
          data-testid="link-search-input"
        />
        {/* Clear / loading indicator */}
        {selectedItem && searchQuery ? (
          <button
            type="button"
            onClick={handleClearSelection}
            className="text-muted-foreground hover:text-foreground absolute top-1/2 right-2 -translate-y-1/2"
            aria-label="Clear selection"
          >
            <X className="size-3.5" />
          </button>
        ) : null}
        {isSearching && !selectedItem ? (
          <Loader2
            className="text-muted-foreground pointer-events-none absolute top-1/2 right-2 size-3.5 -translate-y-1/2 animate-spin"
            aria-hidden
          />
        ) : null}
      </div>

      {/* Search results dropdown */}
      {hasResults && showResults ? (
        <ul
          className="bg-popover text-popover-foreground border-border absolute top-full right-0 left-0 z-50 mt-1 max-h-48 overflow-y-auto rounded-lg border p-1 shadow-md"
          role="listbox"
          aria-label="Search results"
          data-testid="link-search-results"
        >
          {searchResults.map((item) => (
            <li key={item.id} role="option" aria-selected={false}>
              <button
                type="button"
                onClick={() => handleSelectItem(item)}
                className="hover:bg-muted flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm outline-none"
              >
                {item.type === "image" && item.image_path ? (
                  <img
                    src={`/api/images/${item.image_path.replace(/^\/+/, "")}`}
                    alt=""
                    className="size-8 shrink-0 rounded object-cover"
                  />
                ) : (
                  <span
                    aria-hidden
                    className={cn(
                      "size-2 shrink-0 rounded-full",
                      typeColorClass(item.type)
                    )}
                  />
                )}
                <span className="min-w-0 flex-1 truncate">
                  {item.title?.trim() ? item.title : "Untitled"}
                </span>
                <span className="text-muted-foreground shrink-0 font-mono text-[0.6rem] uppercase">
                  {typeLabel(item.type)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {/* No results message */}
      {noResults ? (
        <div className="bg-popover text-popover-foreground border-border absolute top-full right-0 left-0 z-50 mt-1 rounded-lg border p-2 shadow-md">
          <p className="text-muted-foreground px-2 py-1 text-xs">
            No results found.
          </p>
        </div>
      ) : null}

      {/* Link type selector + add button */}
      {selectedItem ? (
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <Select
              value={linkType}
              onValueChange={(v) => {
                if (v) setLinkType(v);
              }}
            >
              <SelectTrigger
                aria-label="Link type"
                className="h-7 text-xs"
                data-testid="link-type-select"
              >
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                {LINK_TYPE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            type="button"
            size="icon-xs"
            variant="default"
            onClick={() => createMutation.mutate()}
            disabled={createMutation.isPending}
            aria-label="Add link"
            title="Add link"
            data-testid="add-link-button"
          >
            {createMutation.isPending ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <Plus className="size-3" />
            )}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

// ─── Main sidebar component ────────────────────────────────────────────

export interface ItemSidebarProps {
  tags: Tag[];
  outbound: OutboundLink[];
  inbound: InboundLink[];
  itemId: string;
}

export function ItemSidebar({
  tags,
  outbound,
  inbound,
  itemId,
}: ItemSidebarProps) {
  const router = useRouter();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const deleteMutation = useMutation({
    mutationFn: async (linkId: string) => {
      const res = await fetch(`/api/links/${linkId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        const msg: string | undefined = payload?.error?.message;
        throw new Error(msg ?? "Failed to delete link");
      }
      return res.json();
    },
    onMutate: (linkId) => {
      setDeletingId(linkId);
    },
    onSuccess: () => {
      toast.success("Link removed.");
      router.refresh();
    },
    onSettled: () => {
      setDeletingId(null);
    },
    onError: (error: Error) => {
      toast.error(error.message ?? "Failed to remove link.");
    },
  });

  const handleDelete = (linkId: string) => {
    if (deletingId) return;
    deleteMutation.mutate(linkId);
  };

  return (
    <div className="flex flex-col gap-6" data-testid="item-sidebar-content">
      {tags.length > 0 ? (
        <Section title="Tags">
          <ul aria-label="Tags" className="flex flex-wrap items-center gap-1.5">
            {tags.map((tag) => (
              <li key={tag.id}>
                <Link
                  href={`/?tag=${encodeURIComponent(tag.name)}`}
                  className="border-border bg-background text-muted-foreground hover:text-foreground hover:border-border-strong rounded-sm border px-2 py-0.5 font-mono text-[0.7rem] tracking-wide transition-colors"
                >
                  #{tag.name}
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      <Section title="Links">
        <CreateLinkForm itemId={itemId} />
        {outbound.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {outbound.map((link) => (
              <LinkRow
                key={link.id}
                href={`/item/${link.target.id}`}
                title={link.target.title}
                type={link.target.type}
                linkType={link.link_type}
                direction="outbound"
                linkId={link.id}
                onDelete={handleDelete}
                isDeleting={deletingId === link.id}
              />
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground font-sans text-sm">
            No outbound links yet.
          </p>
        )}
      </Section>

      <Section title="Backlinks">
        {inbound.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {inbound.map((link) => (
              <LinkRow
                key={link.id}
                href={`/item/${link.source.id}`}
                title={link.source.title}
                type={link.source.type}
                linkType={link.link_type}
                direction="inbound"
                linkId={link.id}
                onDelete={handleDelete}
                isDeleting={deletingId === link.id}
              />
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground font-sans text-sm">
            No backlinks yet.
          </p>
        )}
      </Section>
    </div>
  );
}
