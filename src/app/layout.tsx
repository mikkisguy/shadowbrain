import type { Metadata } from "next";
import { Inter, JetBrains_Mono, Newsreader } from "next/font/google";
import { cookies } from "next/headers";

import { SkipToContent } from "@/components/layout/skip-to-content";
import { TopNav } from "@/components/layout/top-nav";
import { Footer } from "@/components/layout/footer";
import { getEnv } from "@/lib/env";
import { readSessionFromRequest } from "@/lib/auth/session";

import "./globals.css";

/**
 * Three typefaces per the design system spec:
 *   - Inter          — sans, primary UI (400, 500, 700)
 *   - Newsreader     — serif, brand moments (400, 600)
 *   - JetBrains Mono — mono, code/data (400, 500)
 *
 * All three are loaded via `next/font/google` for zero-runtime cost
 * and exposed as CSS variables consumed by Tailwind's font utilities.
 */
const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-sans",
  display: "swap",
});

const newsreader = Newsreader({
  subsets: ["latin"],
  weight: ["400", "600"],
  style: ["normal", "italic"],
  variable: "--font-serif",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "ShadowBrain",
  description: "Your second brain for bookmarks, notes, and ideas.",
};

getEnv();

/** Build a minimal Request shape that `readSessionFromRequest`
 *  accepts, using Next.js' `cookies()` store. The proxy is the
 *  source of truth for gating — this server-component check is
 *  just a hint to render auth-aware chrome (palette trigger,
 *  user menu). The proxy still enforces the real boundary. */
async function isRequestAuthenticated(): Promise<boolean> {
  const store = await cookies();
  const cookie = store.get("sb_session");
  if (!cookie) return false;
  // `readSessionFromRequest` wants a `Request`. The cookie store
  // gives us the value directly, so a minimal stub is enough.
  const env = getEnv();
  const result = await readSessionFromRequest(
    new Request("http://internal/layout", {
      headers: { cookie: `sb_session=${cookie.value}` },
    }),
    env.SESSION_SECRET
  );
  return result.ok;
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const isAuthenticated = await isRequestAuthenticated();
  return (
    <html
      lang="en"
      className={`${inter.variable} ${newsreader.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="bg-background text-foreground flex min-h-full flex-col">
        <SkipToContent />
        {/*
          Hide the top nav on unauthenticated pages (currently
          just /login). An unauthenticated visitor does not need
          the navigation chrome — the login page is a focused
          authentication surface, and the brand mark + form
          inside the page is enough to communicate "you are in
          the right place". Showing the nav would also advertise
          authenticated-only actions (the command palette) to
          an unauthenticated visitor.
        */}
        {isAuthenticated ? <TopNav /> : null}
        <div className="flex flex-1 flex-col">{children}</div>
        <Footer />
      </body>
    </html>
  );
}
