import packageJson from "../../../package.json";

/**
 * Global app footer.
 *
 * A small, low-emphasis build marker shown on every page, including
 * the unauthenticated `/login` route — the footer exposes no app
 * state, only a public build version, so there is no information
 * leak.
 *
 * The version is read from `package.json` at build time so bumping
 * the version in one place (per `AGENTS.md` "Versioning") updates
 * what users see automatically. No hard-coded string, no env-var
 * indirection — `package.json` is the single source of truth.
 *
 * Mono font, muted foreground, single hairline divider — same
 * vocabulary as the design-system footer on the home page
 * (`src/app/page.tsx`) so the chrome reads as one piece. Aligned
 * to the `max-w-screen-2xl` content rail used by the top nav.
 */
export function Footer() {
  return (
    <footer className="border-border w-full border-t" data-testid="app-footer">
      <div className="text-muted-foreground mx-auto flex w-full max-w-screen-2xl items-center justify-between gap-3 px-4 py-3 font-mono text-xs sm:px-6">
        <span>ShadowBrain</span>
        <span data-testid="app-version">v{packageJson.version}</span>
      </div>
    </footer>
  );
}
