import { BrowsePage } from "@/app/browse/browse-page";

/**
 * Browse page (`/`).
 *
 * Phase 3 — Web UI Core · issue #21. The page is a thin server
 * shell that delegates to the `BrowsePage` client component
 * (filter state, debounced search, URL sync, and the feed live
 * there). Server-side rendering of the page body would be
 * possible — `searchParams` are readable in a server component —
 * but the data-fetch lifecycle is easier to express as a single
 * `useEffect` on a client component than as a streaming server
 * fetch + a hydration step. The proxy enforces auth on `/`, so
 * an unauthenticated visitor never reaches this component.
 */
export default function Page() {
  return <BrowsePage />;
}
