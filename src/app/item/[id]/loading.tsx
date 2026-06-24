/**
 * Item detail loading state (issue #25).
 *
 * Next.js renders this file inside the route's Suspense boundary
 * while `page.tsx` resolves its data, then streams in the real page
 * once `findWithRelations` returns. The skeleton mirrors the page
 * layout (back affordance, type badge, title, metadata, body) so the
 * transition into the rendered content is shape-stable rather than a
 * flash of empty white.
 *
 * Kept as plain static markup (no animations beyond Tailwind's
 * `animate-pulse`) so it is cheap to stream and respects the
 * reduced-motion policy in `globals.css` (animate-pulse is disabled
 * there for `prefers-reduced-motion`).
 */

function Bar({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`bg-surface-muted animate-pulse rounded-sm ${className ?? ""}`}
    />
  );
}

export default function Loading() {
  return (
    <main
      id="main-content"
      aria-busy="true"
      className="mx-auto flex w-full max-w-screen-md flex-col gap-6 px-4 py-8 sm:px-6 sm:py-12"
    >
      <Bar className="h-4 w-16" />

      <header className="flex flex-col gap-3">
        <Bar className="h-5 w-20" />
        <Bar className="h-9 w-3/4" />
        <div className="flex gap-6">
          <Bar className="h-3 w-32" />
          <Bar className="h-3 w-32" />
          <Bar className="h-3 w-24" />
        </div>
      </header>

      <div className="flex flex-col gap-3">
        <Bar className="h-4 w-full" />
        <Bar className="h-4 w-full" />
        <Bar className="h-4 w-2/3" />
      </div>
    </main>
  );
}
