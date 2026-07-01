import { CelestialBackdrop } from "@/components/visual/celestial-backdrop";

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
  return (
    <div className="relative flex flex-1 flex-col overflow-hidden">
      {/*
        The celestial engraving as ambient sky behind the tags list.
        Mounted here (the server shell) so it stays server-rendered and
        out of the client bundle; the `TagsPage` main is lifted to
        z-10 so the list reads above it. Dimmed to 60% so it reads as
        ambiance behind content, not a competing background.
      */}
      <CelestialBackdrop className="opacity-60" />
      <TagsPage />
    </div>
  );
}
