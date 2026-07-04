"use client";

import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { CornerDownLeft, Search as SearchIcon } from "lucide-react";
import { Command as CommandPrimitive } from "cmdk";

import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";

import {
  CommandItem as CommandItemRow,
  CommandList,
  CommandGroup,
} from "@/components/ui/command";
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
import { renderSnippet, typeBadgeClasses } from "./snippet";

import { cn } from "@/lib/utils";

/**
 * Global command palette dialog.
 *
 * Architecture:
 *
 *   - `<CommandPalette />` owns the base-ui `Dialog`. It
 *     stays mounted for the lifetime of the page so the
 *     `useCommandPalette` global shortcut can toggle it.
 *   - The actual stateful UI (the cmdk input, the
 *     debounced search) lives in `<PaletteBody />`, which
 *     is only rendered while `open === true`. This means
 *     every time the dialog opens, the body remounts and
 *     the state is fresh by construction — there is no
 *     "reset on close" effect to write, and the `eslint
 *     react-hooks/set-state-in-effect` rule has nothing
 *     to complain about.
 *
 * Two pieces of behavior the cmdk default does not cover
 * are implemented here:
 *
 *   1. **Two-stage Esc** — the first Esc blurs the cmdk input
 *      (and stops propagation so the dialog's default Esc
 *      handler does not close the palette). The second Esc,
 *      which fires when no input is focused, bubbles to the
 *      dialog and closes it. This matches the design spec's
 *      "standard pattern".
 *   2. **Debounced FTS5 fetch** — when the user has typed at
 *      least 2 characters we fetch `/api/search?q=…&limit=8`
 *      after a 300ms idle. The result renders in a "Content"
 *      group below "Pages". An empty result set renders
 *      "(no results)" inside the group rather than collapsing
 *      the group header — the spec calls this out explicitly
 *      to avoid layout jumps while typing.
 */
export function CommandPalette() {
  const { open, setOpen } = useCommandPalette();

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop
          data-slot="dialog-overlay"
          className="bg-scrim fixed inset-0 isolate z-50 backdrop-blur-xs supports-backdrop-filter:backdrop-blur-xs"
        />
        <DialogPrimitive.Popup
          data-slot="dialog-content"
          data-testid="command-palette"
          className={cn(
            // Desktop: a centered modal sized to fit all
            // three groups (Pages, Content, Utilities)
            // comfortably.
            // Mobile: full-screen. The `md:` breakpoint is
            // the same one the top nav uses.
            "bg-popover text-popover-foreground border-border fixed z-50 flex flex-col overflow-hidden border outline-none",
            "top-0 right-0 bottom-0 left-0 rounded-none",
            "md:top-[20%] md:right-auto md:bottom-auto md:left-1/2 md:max-h-[72vh] md:w-[min(40rem,calc(100%-3rem))] md:-translate-x-1/2 md:rounded-lg"
          )}
        >
          <DialogPrimitive.Title className="sr-only">
            Command palette
          </DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">
            Search ShadowBrain or jump to a page.
          </DialogPrimitive.Description>
          {open ? <PaletteBody /> : null}
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

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
  const [contentState, setContentState] = useState<ContentState>({
    status: "idle",
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

  // Debounced FTS5 fetch. The 300ms idle window matches the
  // Browse page's search bar in the original web-UI spec; the
  // value is "feels responsive" rather than a hard
  // measurement, and the 2-char minimum avoids hammering the
  // API with single-character queries.
  //
  // Two things this effect must get right:
  //
  //   1. The AbortController has to be created on the effect
  //      side, not inside the setTimeout — otherwise the
  //      cleanup function cannot reach the controller and the
  //      in-flight request is never cancelled when the user
  //      keeps typing.
  //   2. The setTimeout handle is cleared on cleanup so a
  //      rapid keystroke does not queue a stale fetch.
  //
  // For queries shorter than 2 chars we deliberately do not
  // touch state — the body is unmounted when the palette
  // closes, so there is no "stale" state to clear.
  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) return;
    const controller = new AbortController();
    const handle = window.setTimeout(() => {
      setContentState({ status: "loading" });
      fetch(`/api/search?q=${encodeURIComponent(trimmed)}&limit=8`, {
        signal: controller.signal,
      })
        .then(async (res) => {
          if (!res.ok) {
            setContentState({ status: "ready", results: [] });
            return;
          }
          const body = (await res.json()) as SearchApiResponse;
          setContentState({ status: "ready", results: body.results ?? [] });
        })
        .catch((err: unknown) => {
          // AbortError is expected when the user keeps typing
          // and the next request supersedes this one. We do
          // not update state in that case — the next effect
          // run will fire the follow-up fetch and overwrite.
          if (err instanceof DOMException && err.name === "AbortError") {
            return;
          }
          setContentState({ status: "ready", results: [] });
        });
    }, 300);
    return () => {
      window.clearTimeout(handle);
      controller.abort();
    };
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

// ---------------------------------------------------------------------------
// Sub-components for each Command group. Kept in this file because they are
// small, only used by the palette, and the parent owns the data they receive.
// ---------------------------------------------------------------------------

interface PagesGroupProps {
  items: PageCommandItem[];
  /** Raw user query; an empty string means "default view". */
  query: string;
  onActivate: (item: PageCommandItem) => void;
}

function PagesGroup({ items, query, onActivate }: PagesGroupProps) {
  // The spec mandates that the group header stay visible even
  // when the fuzzy filter hides every item — otherwise the
  // layout jumps as the user types. We render the empty
  // placeholder inside the group instead.
  if (items.length === 0 && query.trim().length > 0) {
    return (
      <CommandGroup heading="Pages" data-testid="command-palette-pages-empty">
        <p className="text-muted-foreground px-2 py-1.5 text-xs">
          (no pages match)
        </p>
      </CommandGroup>
    );
  }
  return (
    <CommandGroup heading="Pages" data-testid="command-palette-pages">
      {items.map((item) => (
        <CommandItemRow
          key={item.id}
          value={item.id}
          onSelect={() => onActivate(item)}
          data-testid={`command-palette-item-${item.id}`}
        >
          <span className="truncate">{item.label}</span>
          {item.description ? (
            <span className="text-muted-foreground ml-2 truncate text-xs">
              {item.description}
            </span>
          ) : null}
        </CommandItemRow>
      ))}
    </CommandGroup>
  );
}

interface ContentGroupProps {
  query: string;
  state: ContentState;
  onActivate: (hit: ContentHit) => void;
}

function ContentGroup({ query, state, onActivate }: ContentGroupProps) {
  // Hide the entire group when the query is too short to
  // have triggered a fetch. The spec is explicit: the group
  // must render in the default view only if there is a
  // matching query.
  if (query.trim().length < 2) return null;

  // `state.status === "loading"` means the request has not
  // returned yet. We render the group header plus a
  // "Searching…" line so the layout is stable while the
  // request is in flight.
  if (state.status === "loading") {
    return (
      <CommandGroup heading="Content" data-testid="command-palette-content">
        <p className="text-muted-foreground px-2 py-1.5 text-xs">Searching…</p>
      </CommandGroup>
    );
  }

  if (state.status === "ready" && state.results.length === 0) {
    return (
      <CommandGroup heading="Content" data-testid="command-palette-content">
        <p
          data-testid="command-palette-content-empty"
          className="text-muted-foreground px-2 py-1.5 text-xs"
        >
          (no results)
        </p>
      </CommandGroup>
    );
  }

  if (state.status === "ready") {
    return (
      <CommandGroup heading="Content" data-testid="command-palette-content">
        {state.results.map((hit) => (
          <CommandItemRow
            key={hit.id}
            value={`content.${hit.id}`}
            onSelect={() => onActivate(hit)}
            data-testid={`command-palette-content-item-${hit.id}`}
            className="items-start py-2"
          >
            <span
              aria-hidden="true"
              className={cn(
                "mt-1 size-2 shrink-0 rounded-full",
                typeBadgeClasses(hit.type)
              )}
            />
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-foreground truncate text-sm">
                {hit.title ?? "(untitled)"}
              </span>
              {hit.snippet ? (
                <span className="text-muted-foreground line-clamp-2 text-xs">
                  {renderSnippet(hit.snippet)}
                </span>
              ) : null}
            </span>
            <span className="text-muted-foreground shrink-0 font-mono text-[10px] tracking-wider uppercase">
              {hit.type}
            </span>
          </CommandItemRow>
        ))}
      </CommandGroup>
    );
  }

  // `idle` is the initial state before the user has typed
  // enough — the early-return above already hid the group in
  // that case, so reaching here is unreachable. Render
  // nothing to satisfy the exhaustive type.
  return null;
}

interface UtilitiesGroupProps {
  items: UtilityCommandItem[];
  onActivate: (item: UtilityCommandItem) => void;
}

function UtilitiesGroup({ items, onActivate }: UtilitiesGroupProps) {
  if (items.length === 0) return null;
  return (
    <CommandGroup heading="Utilities" data-testid="command-palette-utilities">
      {items.map((item) => (
        <CommandItemRow
          key={item.id}
          value={item.id}
          onSelect={() => onActivate(item)}
          data-testid={`command-palette-item-${item.id}`}
        >
          <span className="truncate">{item.label}</span>
          {item.description ? (
            <span className="text-muted-foreground ml-2 truncate text-xs">
              {item.description}
            </span>
          ) : null}
        </CommandItemRow>
      ))}
    </CommandGroup>
  );
}

// ---------------------------------------------------------------------------
// Local types for the FTS5 response shape we consume. Kept here (not in
// `/api/search/route.ts`) because the search route's public types are
// inferred from the SQL and we only care about the slice the palette
// actually renders.
// ---------------------------------------------------------------------------

interface ContentHit {
  id: string;
  type: string;
  title: string | null;
  snippet: string | null;
}

interface SearchApiResponse {
  query: string;
  results: ContentHit[];
  total: number;
  page: number;
  limit: number;
}

/** Lifecycle of the FTS5 fetch. `idle` is the initial
 *  state before the debounce fires; `loading` is the
 *  in-flight state; `ready` holds the final hits (possibly
 *  empty). Exhaustive — the Content group renders one
 *  shape per state. */
type ContentState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; results: ContentHit[] };
