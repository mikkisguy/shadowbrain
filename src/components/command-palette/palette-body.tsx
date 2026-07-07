"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";

import { useRouter } from "next/navigation";

import { CornerDownLeft, Search as SearchIcon } from "lucide-react";
import { Command as CommandPrimitive } from "cmdk";
import { useQuery } from "@tanstack/react-query";

import { CommandList } from "@/components/ui/command";
import { useCommandPalette } from "./use-command-palette";
import { useAddDialog } from "@/components/add-dialog";
import {
  pages,
  utilities,
  type CommandItem,
  type PageCommandItem,
  type UtilityCommandItem,
  searchHaystack,
} from "./command-items";
import { fuzzyFilter } from "./fuzzy-filter";
import { queryKeys, staleTimes } from "@/lib/query-config";
import {
  ContentGroup,
  PagesGroup,
  UtilitiesGroup,
  type ContentState,
  type SearchApiResponse,
} from "./palette-groups";

// ---------------------------------------------------------------------------
// Body. Renders only while the dialog is open; remounts on every open so
// local state (query, debounced results) starts clean without an effect.
// ---------------------------------------------------------------------------

function PaletteBody() {
  const { setOpen } = useCommandPalette();
  const { setOpen: setAddOpen } = useAddDialog();
  const router = useRouter();

  // Local UI state. Lives only while the dialog is open so a
  // re-mount (next open) starts fresh.
  const [query, setQuery] = useState("");

  // Debounced query for TanStack Query. The 300ms idle window matches the
  // Browse page's search bar in the original web-UI spec; the value is
  // "feels responsive" rather than a hard measurement, and the 2-char
  // minimum avoids hammering the API with single-character queries.
  const [debouncedQuery, setDebouncedQuery] = useState("");

  // Debounce effect: update debouncedQuery after 300ms of no typing
  useEffect(() => {
    const trimmed = query.trim();
    const handle = window.setTimeout(() => {
      setDebouncedQuery(trimmed.length >= 2 ? trimmed : "");
    }, 300);
    return () => window.clearTimeout(handle);
  }, [query]);

  // TanStack Query for search results
  const { data: searchResults, isPending: isSearching } = useQuery({
    queryKey: queryKeys.search.results(debouncedQuery),
    queryFn: async () => {
      const res = await fetch(
        `/api/search?q=${encodeURIComponent(debouncedQuery)}&limit=8`
      );
      if (!res.ok) return [];
      const body = (await res.json()) as SearchApiResponse;
      return body.results ?? [];
    },
    enabled: debouncedQuery.length >= 2,
    staleTime: staleTimes.search,
  });

  // The pages group: fuzzy-filtered when there is a query,
  // unfiltered (in declaration order) otherwise.
  const filteredPages: PageCommandItem[] = useMemo(() => {
    if (!query.trim()) return pages;
    return fuzzyFilter(query, pages, searchHaystack);
  }, [query]);

  // The utility group (sign-out). The palette lives inside
  // a layout that already gates on auth, so the group is
  // unconditional — same reasoning as in the original
  // top-nav user menu.
  const filteredUtilities: UtilityCommandItem[] = useMemo(() => {
    if (!query.trim()) return utilities;
    return fuzzyFilter(query, utilities, searchHaystack);
  }, [query]);

  // Ref to the cmdk input. We blur it on the first Esc so the
  // dialog's default close-on-Esc handler only fires on the
  // second press.
  const inputRef = useRef<HTMLInputElement | null>(null);

  const handleInputKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLInputElement>) => {
      if (event.key !== "Escape") return;
      // If anything inside the palette is focused (typically
      // the cmdk input itself), the first Esc blurs it and
      // stops propagation so the dialog does not close.
      const active = document.activeElement;
      if (active && event.currentTarget.contains(active)) {
        event.preventDefault();
        event.stopPropagation();
        (active as HTMLElement).blur();
      }
    },
    []
  );

  /** Activate an item. Navigation uses `router.push`; the
   *  sign-out utility posts to `/api/auth/logout` (a plain
   *  HTML form does the same thing — using a fetch here so
   *  the close-then-navigate flow stays inside React). */
  const activate = useCallback(
    (item: CommandItem) => {
      setOpen(false);
      if (item.kind === "page") {
        router.push(item.href);
        return;
      }
      if (item.action === "signOut") {
        // Submit a real POST to the auth route. The server
        // clears the session cookie and 303-redirects to
        // `/login`; we then `router.replace` to that page so
        // the client-side navigation lands on the same
        // destination without a full page reload.
        const form = document.createElement("form");
        form.method = "POST";
        form.action = "/api/auth/logout";
        document.body.appendChild(form);
        form.submit();
      }
      if (item.action === "quickAdd") {
        setAddOpen(true);
      }
    },
    [router, setOpen, setAddOpen]
  );

  // Derive content state from TanStack Query
  const contentState: ContentState = useMemo(() => {
    if (query.trim().length < 2) return { status: "idle" };
    if (isSearching) return { status: "loading" };
    return { status: "ready", results: searchResults ?? [] };
  }, [query, isSearching, searchResults]);

  return (
    <CommandPrimitive
      label="Command palette"
      shouldFilter={false}
      className="flex size-full flex-col overflow-hidden bg-transparent"
    >
      <div
        data-testid="command-palette-input-wrapper"
        className="border-border flex items-center gap-2 border-b px-3"
      >
        <SearchIcon
          aria-hidden="true"
          className="text-muted-foreground size-4 shrink-0"
        />
        {/*
          Use cmdk's `Command.Input` directly (not the shadcn
          `CommandInput` wrapper) so the input fills the row
          edge-to-edge. The shadcn wrapper adds an extra
          `p-1` div and renders its own SearchIcon, which
          squeezed the placeholder until the text
          truncated. The footer below already documents
          the Esc shortcut, so no inline hint is needed.
        */}
        <CommandPrimitive.Input
          ref={inputRef}
          data-testid="command-palette-input"
          placeholder="Search ShadowBrain or jump to a page…"
          value={query}
          onValueChange={setQuery}
          onKeyDown={handleInputKeyDown}
          className="placeholder:text-muted-foreground h-12 w-full border-0 bg-transparent text-sm outline-none"
        />
      </div>
      <CommandList
        data-testid="command-palette-list"
        className="max-h-none flex-1 overflow-y-auto p-1"
      >
        <PagesGroup items={filteredPages} query={query} onActivate={activate} />
        <ContentGroup
          query={query}
          state={contentState}
          onActivate={(hit) => {
            setOpen(false);
            router.push(`/item/${hit.id}`);
          }}
        />
        <UtilitiesGroup items={filteredUtilities} onActivate={activate} />
      </CommandList>
      <div
        data-testid="command-palette-footer"
        className="border-border text-muted-foreground hidden items-center justify-between gap-4 border-t px-3 py-1.5 font-mono text-[10px] md:flex"
      >
        <span>
          <kbd className="font-mono">↑</kbd> <kbd className="font-mono">↓</kbd>{" "}
          navigate <kbd className="font-mono">↵</kbd> select{" "}
          <kbd className="font-mono">Esc</kbd> close
        </span>
        <span className="inline-flex items-center gap-1">
          <CornerDownLeft aria-hidden="true" className="size-3" />
          ShadowBrain palette
        </span>
      </div>
    </CommandPrimitive>
  );
}

export { PaletteBody };
