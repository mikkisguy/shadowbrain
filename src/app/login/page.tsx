/**
 * Login page.
 *
 * Server-rendered shell that hosts a small client-side form
 * (the only interactivity on this page). Posts to
 * `/api/auth/login`. On success, follows the `from` query param
 * (or `/` by default). On failure, shows the generic
 * "Invalid credentials" error and re-renders so the user can
 * retry — the server is the source of truth for the error.
 *
 * The page is intentionally server-rendered to keep the
 * HTML payload tiny: the design system already provides the
 * typography tokens, so no client-only CSS is needed for the
 * chrome. The form posts via a plain `<form action="...">` so
 * the user still gets a working flow even with JS disabled.
 */

import { LoginForm } from "./login-form";
import { getEnv } from "@/lib/env";
import { getSessionMaxAge } from "@/lib/auth/session";
import { LOGIN_PATH } from "@/lib/auth/constants";

export const metadata = {
  title: "Sign in — ShadowBrain",
  robots: { index: false, follow: false },
};

// Force dynamic rendering — the page reads env (which may change
// at runtime) and we want every navigation to get the latest.
export const dynamic = "force-dynamic";

interface LoginPageProps {
  searchParams: Promise<{ from?: string }>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { from } = await searchParams;
  const env = getEnv();
  // Surface the configured session lifetime as a human-readable
  // hint. Helps the operator spot a typo in SESSION_MAX_AGE.
  const maxAgeMs = getSessionMaxAge(env.SESSION_MAX_AGE);
  const maxAgeHours = Math.round(maxAgeMs / (60 * 60 * 1000));

  // Validate the `from` parameter to avoid open-redirect via the
  // login bounce-back. Only same-origin paths are accepted.
  const safeFrom = safeRedirectOrRoot(from);

  return (
    <main
      id="main-content"
      className="flex flex-1 items-center justify-center px-4 py-16 sm:py-24"
    >
      <div className="border-border bg-surface-elevated flex w-full max-w-sm flex-col gap-8 border p-8">
        <header className="flex flex-col gap-2">
          <p className="text-muted-foreground font-sans text-xs font-medium tracking-[0.12em] uppercase">
            ShadowBrain
          </p>
          <h1 className="text-foreground font-serif text-2xl font-semibold">
            Sign in
          </h1>
          <p className="text-muted-foreground font-sans text-sm">
            Use your admin credentials to continue.
          </p>
        </header>

        <LoginForm from={safeFrom} />

        <footer className="text-muted-foreground border-border flex flex-col gap-1 border-t pt-4 font-sans text-xs">
          <p>
            Session:{" "}
            <span className="text-foreground font-mono">{maxAgeHours}h</span>{" "}
            sliding window
          </p>
          <p>
            Endpoint:{" "}
            <span className="text-foreground font-mono">{LOGIN_PATH}</span>
          </p>
        </footer>
      </div>
    </main>
  );
}

/** Allow only same-origin absolute paths or root. Reject full
 *  URLs (would let an attacker bounce the user to a phishing
 *  site after a successful login). */
function safeRedirectOrRoot(target: string | undefined): string {
  if (!target) return "/";
  if (target.length > 2048) return "/";
  if (!target.startsWith("/")) return "/";
  // Reject protocol-relative `//host` (would be a cross-origin
  // redirect). Normal `//foo` (no host) is impossible.
  if (target.startsWith("//")) return "/";
  return target;
}
