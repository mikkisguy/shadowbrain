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
    <div
      aria-busy="true"
      className="mx-auto flex w-full max-w-screen-lg flex-col gap-6 px-4 py-8 sm:px-6 sm:py-12"
    >
      <div className="flex items-center justify-between gap-4">
        <Bar className="h-4 w-16" />
        <Bar className="h-4 w-24" />
      </div>

      <div className="flex flex-col gap-8 lg:flex-row lg:items-start">
        <main id="main-content" className="flex min-w-0 flex-1 flex-col gap-6">
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

        <aside className="hidden w-full shrink-0 flex-col gap-6 lg:flex lg:w-[30%] lg:max-w-xs">
          <div className="flex flex-col gap-2.5">
            <Bar className="h-3 w-16" />
            <Bar className="h-14 w-full" />
            <Bar className="h-14 w-full" />
          </div>
          <div className="flex flex-col gap-2.5">
            <Bar className="h-3 w-20" />
            <Bar className="h-14 w-full" />
          </div>
        </aside>
      </div>
    </div>
  );
}
