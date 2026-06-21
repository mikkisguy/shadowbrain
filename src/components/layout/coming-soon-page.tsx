/**
 * Placeholder "coming soon" page chrome.
 *
 * Used by the routes that the command palette lists as
 * navigation targets but that have not been built yet
 * (`/chat`, `/graph`, `/tags`, `/settings`). The shell is
 * intentionally simple — just a heading and a one-line
 * status. The shared visual is the editorial typography the
 * design system already ships; the page does not import any
 * chrome (the top nav and footer are still rendered by the
 * root layout).
 *
 * The component is a server component — no client state, no
 * hooks. The link to `/` is a plain `<Link>` so SSR delivers
 * a navigable page even when the user has JS disabled.
 */
import Link from "next/link";

export interface ComingSoonPageProps {
  /** Page label rendered in the eyebrow (e.g. "Chat"). */
  label: string;
  /** One-line description of the planned feature. */
  description: string;
  /** Status shown beneath the heading. Defaults to "Coming soon". */
  status?: string;
}

export function ComingSoonPage({
  label,
  description,
  status = "Coming soon",
}: ComingSoonPageProps) {
  return (
    <main
      id="main-content"
      data-testid={`page-${label.toLowerCase()}`}
      className="mx-auto flex w-full max-w-screen-2xl flex-col gap-8 px-4 py-16 sm:px-6 sm:py-24"
    >
      <header className="border-border flex flex-col gap-4 border-b pb-12">
        <p className="text-muted-foreground font-sans text-xs font-medium tracking-[0.12em] uppercase">
          Phase 3 · Web UI Core
        </p>
        <h1 className="text-foreground font-serif text-4xl font-semibold tracking-[-0.01em] sm:text-5xl">
          {label}
        </h1>
        <p className="text-muted-foreground max-w-2xl font-sans text-lg leading-relaxed">
          {description}
        </p>
      </header>

      <section
        aria-labelledby={`${label.toLowerCase()}-status`}
        className="border-border bg-surface-elevated flex max-w-2xl flex-col gap-3 rounded-sm border p-6"
      >
        <p className="text-accent-cyan font-sans text-xs font-medium tracking-[0.12em] uppercase">
          <span className="bg-accent-cyan mr-2 inline-block size-1.5 align-middle" />
          Status
        </p>
        <h2
          id={`${label.toLowerCase()}-status`}
          className="text-foreground font-sans text-lg font-medium"
        >
          {status}
        </h2>
        <p className="text-muted-foreground font-sans text-sm">
          The {label.toLowerCase()} page is reachable from the command palette
          so the navigation graph is intact, but the feature itself ships in a
          follow-up issue. Use the global command palette (
          <kbd className="font-mono">Ctrl K</kbd>) to jump somewhere else.
        </p>
        <p className="font-sans text-sm">
          <Link
            href="/"
            className="text-primary focus-visible:ring-ring underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
          >
            ← Back to Browse
          </Link>
        </p>
      </section>
    </main>
  );
}
