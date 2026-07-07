import {
  CommandGroup,
  CommandItem as CommandItemRow,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";

import type { PageCommandItem, UtilityCommandItem } from "./command-items";
import { renderSnippet, typeBadgeClasses } from "./snippet";

// ---------------------------------------------------------------------------
// Sub-components for each Command group.
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
// Local types for the FTS5 response shape we consume.
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

export {
  PagesGroup,
  ContentGroup,
  UtilitiesGroup,
  type SearchApiResponse,
  type ContentState,
};
