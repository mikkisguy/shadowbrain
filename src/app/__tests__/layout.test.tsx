/**
 * Server-component test for the auth-aware chrome in
 * `src/app/layout.tsx`.
 *
 * The layout is the only place that decides whether to render the
 * top nav and the global footer — the proxy is the source of truth
 * for whether the visitor is *allowed* to see the page, but the
 * layout is the source of truth for whether the chrome is
 * *visible*. This test pins that contract:
 *
 *   - Authenticated → both <TopNav /> and <Footer /> are rendered
 *     (the footer is the mono-font build marker; it is internal
 *     chrome that should not be shown to an unauthenticated
 *     visitor on the sign-in page).
 *   - Unauthenticated → neither is rendered.
 *
 * `next/headers` (cookies) and `next/font/google` are mocked so
 * the layout can be rendered with `renderToStaticMarkup` without
 * touching the filesystem or the network.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect, vi, beforeEach } from "vitest";

const cookieStore: { value: string | undefined } = { value: undefined };

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: (name: string) =>
      name === "sb_session" && cookieStore.value
        ? { name, value: cookieStore.value }
        : undefined,
  })),
}));

vi.mock("next/font/google", () => ({
  Inter: () => ({ variable: "--font-sans", className: null }),
  Newsreader: () => ({ variable: "--font-serif", className: null }),
  JetBrains_Mono: () => ({ variable: "--font-mono", className: null }),
}));

vi.mock("@/lib/env", () => ({
  getEnv: () => ({
    SESSION_SECRET:
      "test-secret-that-is-at-least-32-characters-long-for-vitest",
  }),
}));

// The layout mounts `<CommandPalette />`, which calls
// `useRouter()` from `next/navigation`. The app-router
// context is not available during `renderToStaticMarkup`
// in a unit test, so we mock the navigation hooks with
// inert stubs. The palette's own integration tests
// (in `src/components/command-palette`) exercise the
// real navigation behaviour.
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: () => undefined,
    replace: () => undefined,
    back: () => undefined,
    forward: () => undefined,
    refresh: () => undefined,
    prefetch: () => undefined,
  }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

import RootLayout from "@/app/layout";
import { signSessionValue } from "@/lib/auth/session";

const SECRET = "test-secret-that-is-at-least-32-characters-long-for-vitest";

async function renderLayout() {
  return renderToStaticMarkup(
    await RootLayout({
      children: <main id="main-content">page body</main>,
    })
  );
}

describe("RootLayout auth-aware chrome", () => {
  beforeEach(() => {
    cookieStore.value = undefined;
  });

  it("renders the top nav and the footer for an authenticated visitor", async () => {
    cookieStore.value = await signSessionValue({
      username: "admin",
      secret: SECRET,
      maxAgeMs: 60 * 60 * 1000,
    });
    const html = await renderLayout();
    expect(html).toMatch(/data-testid="top-nav"/);
    expect(html).toMatch(/data-testid="app-footer"/);
  });

  it("hides both the top nav and the footer for an unauthenticated visitor", async () => {
    const html = await renderLayout();
    expect(html).not.toMatch(/data-testid="top-nav"/);
    // The footer is the mono-font build marker — it is internal
    // chrome and must not appear on the sign-in screen.
    expect(html).not.toMatch(/data-testid="app-footer"/);
  });
});
