import { TagsPage } from "./tags-page";

/**
 * Tags page (`/tags`).
 *
 * Phase 3 — Web UI Core · issue #27. A thin server shell that
 * delegates to the `TagsPage` client component, which owns the
 * list-fetch lifecycle and the create / rename / delete dialogs.
 * The proxy (`src/proxy.ts`) enforces auth on `/tags`, so an
 * unauthenticated visitor never reaches this component.
 */
export default function Page() {
  return <TagsPage />;
}
