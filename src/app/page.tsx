/**
 * Design-system smoke test.
 *
 * Renders the home page with every category of design token in
 * play: serif hero heading, sans body, mono data, cool accent
 * primary, type-color dots, hairlines, and square corners. The
 * point is to verify the token plumbing end-to-end — if the page
 * is off-brand, the token setup is wrong, not the page itself.
 */
export default function Home() {
  return (
    <main id="main-content" className="flex flex-1 flex-col">
      <section className="mx-auto flex w-full max-w-screen-2xl flex-col gap-12 px-4 py-16 sm:px-6 sm:py-24">
        <header className="border-border flex flex-col gap-4 border-b pb-12">
          <p className="text-muted-foreground font-sans text-xs font-medium tracking-[0.12em] uppercase">
            Phase 3 · Web UI Core
          </p>
          <h1 className="text-foreground font-serif text-4xl font-semibold tracking-[-0.01em] sm:text-5xl">
            ShadowBrain
          </h1>
          <p className="text-muted-foreground max-w-2xl font-sans text-lg leading-relaxed">
            Your second brain for bookmarks, notes, and ideas. A dark,
            editorial, cool-spectrum workspace — built for thinking, not
            consuming.
          </p>
        </header>

        <section
          aria-labelledby="design-system-status"
          className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3"
        >
          <article className="border-border bg-surface-elevated flex flex-col gap-3 rounded-sm border p-6">
            <p className="text-accent-cyan font-sans text-xs font-medium tracking-[0.12em] uppercase">
              <span className="bg-accent-cyan mr-2 inline-block size-1.5 align-middle" />
              Status
            </p>
            <h2
              id="design-system-status"
              className="text-foreground font-sans text-lg font-medium"
            >
              Design system online
            </h2>
            <p className="text-muted-foreground font-sans text-sm">
              Tailwind v4, shadcn/ui primitives, and the ShadowBrain token layer
              are wired up.
            </p>
          </article>

          <article className="border-border bg-surface-elevated flex flex-col gap-3 rounded-sm border p-6">
            <p className="text-accent-violet font-sans text-xs font-medium tracking-[0.12em] uppercase">
              Typography
            </p>
            <h2 className="text-foreground font-sans text-lg font-medium">
              Three voices
            </h2>
            <p className="text-muted-foreground font-sans text-sm">
              <span className="text-foreground font-serif italic">
                Newsreader
              </span>{" "}
              for brand moments,
              <span className="text-foreground font-mono">
                {" "}
                JetBrains Mono{" "}
              </span>
              for data, and Inter for the UI.
            </p>
          </article>

          <article className="border-border bg-surface-elevated flex flex-col gap-3 rounded-sm border p-6">
            <p className="text-primary font-sans text-xs font-medium tracking-[0.12em] uppercase">
              Tokens
            </p>
            <h2 className="text-foreground font-sans text-lg font-medium">
              Cool spectrum
            </h2>
            <p className="text-muted-foreground font-sans text-sm">
              Cyan, blue, and violet accents on a near-black canvas. Cream is
              the inversion, never the default.
            </p>
            <div className="mt-2 flex items-center gap-2">
              <span
                aria-label="primary"
                className="bg-primary size-3 rounded-sm"
                title="#3D6BFF"
              />
              <span
                aria-label="accent-cyan"
                className="bg-accent-cyan size-3 rounded-sm"
                title="#4FCFFF"
              />
              <span
                aria-label="accent-violet"
                className="bg-accent-violet size-3 rounded-sm"
                title="#7B6AFF"
              />
              <span
                aria-label="surface-inverted"
                className="bg-surface-inverted size-3 rounded-sm"
                title="#E4DCC8"
              />
            </div>
          </article>
        </section>

        <footer className="border-border flex flex-col gap-2 border-t pt-6">
          <p className="text-muted-foreground font-mono text-xs">
            build · {new Date().toISOString().slice(0, 10)} · 0a0b14
          </p>
          <p className="text-muted-foreground font-sans text-xs">
            Coming soon — global command palette (<kbd>Ctrl K</kbd>), browse,
            chat, graph, tags, settings.
          </p>
        </footer>
      </section>
    </main>
  );
}
