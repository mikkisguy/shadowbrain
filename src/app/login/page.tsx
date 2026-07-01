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
 * If the visitor is already authenticated, this page redirects
 * to `/` (or to the safe `from` target if one is supplied). The
 * proxy would also have allowed the visitor through to `/` if
 * they had a valid cookie, so the login form is never useful
 * in that state — the redirect avoids the user re-typing
 * credentials only to land on the home page anyway.
 *
 * The page is intentionally server-rendered to keep the
 * HTML payload tiny: the design system already provides the
 * typography tokens, so no client-only CSS is needed for the
 * chrome. The form posts via a plain `<form action="...">` so
 * the user still gets a working flow even with JS disabled.
 */

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { LoginForm } from "./login-form";
import { getEnv } from "@/lib/env";
import { isSessionCookieValid } from "@/lib/auth/session";
import { CelestialBackdrop } from "@/components/visual/celestial-backdrop";

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
  // `getEnv()` is invoked for the side effect of validating the
  // environment on first render — the session module reads
  // `SESSION_SECRET` from it via the API route. The returned
  // env object is not used by this page.
  void getEnv();

  // If the visitor is already authenticated, bounce them to the
  // safe `from` target (or `/`). `redirect()` throws a special
  // NEXT_REDIRECT error that Next.js catches to issue the 302,
  // so the rest of this function does not run.
  const store = await cookies();
  const sessionCookie = store.get("sb_session");
  if (sessionCookie) {
    const env = getEnv();
    const ok = await isSessionCookieValid(
      sessionCookie.value,
      env.SESSION_SECRET
    );
    if (ok) {
      redirect(safeRedirectOrRoot(from));
    }
  }

  // Validate the `from` parameter to avoid open-redirect via the
  // login bounce-back. Only same-origin paths are accepted.
  const safeFrom = safeRedirectOrRoot(from);

  return (
    <main
      id="main-content"
      className="relative flex flex-1 items-center justify-center overflow-hidden px-4 py-16 sm:py-24"
    >
      <CelestialBackdrop />
      <div className="border-border bg-surface-elevated relative z-10 flex w-full max-w-sm flex-col gap-8 border p-8">
        <header className="flex flex-col items-center gap-4 text-center">
          {/* Brand mark. The logo is 1.5× the size used in the
              top nav so the user lands on a page that visibly
              identifies the product before they enter
              credentials. */}
          {/* eslint-disable-next-line @next/next/no-img-element -- the
              /public asset is intentionally served as-is for now; if
              we need a smaller variant, we can switch to next/image. */}
          <img
            src="/logo.png"
            alt=""
            width={168}
            height={168}
            decoding="async"
            className="block size-22"
          />
          <div className="flex flex-col gap-1">
            <h1 className="text-foreground font-serif text-2xl font-semibold">
              Sign in
            </h1>
            <p className="text-muted-foreground font-sans text-sm">
              Use your admin credentials to continue.
            </p>
          </div>
        </header>

        <LoginForm from={safeFrom} />

        <footer className="text-muted-foreground border-border flex flex-col gap-1 border-t pt-4 text-center font-serif text-xs">
          <p>ShadowBrain v{process.env.npm_package_version}</p>
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
