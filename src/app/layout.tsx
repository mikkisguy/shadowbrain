import type { Metadata } from "next";
import { Geist, JetBrains_Mono, Newsreader } from "next/font/google";
import { cookies } from "next/headers";
import { Toaster } from "sonner";

import { SkipToContent } from "@/components/layout/skip-to-content";
import { TopNav } from "@/components/layout/top-nav";
import { Footer } from "@/components/layout/footer";
import { BackupReminderBanner } from "@/components/backup/backup-reminder-banner";
import { CommandPaletteRoot } from "@/components/command-palette/command-palette-root";
import { AddDialogRoot } from "@/components/add-dialog";
import { TooltipProvider } from "@/components/ui/tooltip";
import { TanStackQueryProvider } from "@/components/providers/tanstack-query-provider";
import { getDb } from "@/db/index";
import { getEnv } from "@/lib/env";
import { isSessionCookieValid } from "@/lib/auth/session";
import { readBackupStatus } from "@/lib/backup/reminder";

import "./globals.css";

/**
 * Three typefaces per the design system spec:
 *   - Geist          — sans, primary UI (400, 500, 700)
 *   - Newsreader     — serif, brand moments (400, 600)
 *   - JetBrains Mono — mono, code/data (400, 500)
 *
 * All three are loaded via `next/font/google` for zero-runtime cost
 * and exposed as CSS variables consumed by Tailwind's font utilities.
 * Geist is the technical grotesque that bridges the literary serif and
 * the JetBrains mono — it shares its design language with Geist Mono,
 * so the UI sans sits naturally beside the mono accents on buttons,
 * dialogs, and data markers.
 */
const geist = Geist({
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

/** Read the session cookie from the Next.js request store and
 *  decide whether the current visitor is authenticated.
 *
 *  The proxy is the source of truth for gating — this
 *  server-component check is just a hint to render auth-aware
 *  chrome (top nav, footer, user menu). The proxy still
 *  enforces the real boundary on every request. */
async function isRequestAuthenticated(): Promise<boolean> {
  const store = await cookies();
  const cookie = store.get("sb_session");
  if (!cookie) return false;
  const env = getEnv();
  return isSessionCookieValid(cookie.value, env.SESSION_SECRET);
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const isAuthenticated = await isRequestAuthenticated();
  const backupStatus = isAuthenticated ? readBackupStatus(getDb()) : null;
  return (
    <html
      lang="en"
      className={`${geist.variable} ${newsreader.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="bg-background text-foreground flex min-h-full flex-col">
        <TanStackQueryProvider>
          {/*
            The command palette is always mounted, even on
            unauthenticated pages, because the keyboard-shortcut
            listener and the dialog tree are inert when the
            trigger is not visible. The provider owns a single
            `open` boolean; the dialog itself short-circuits
            on closed state and never hits the API.
          */}
          <AddDialogRoot>
            <CommandPaletteRoot>
              {/*
                App-wide tooltip timing. 300 ms is snappy enough to feel
                immediate but still avoids popping on a quick pointer
                sweep, and it unlocks Base UI's grouping so adjacent
                tooltips (e.g. across feed cards) open instantly once
                the first one has.
              */}
              <TooltipProvider delay={300}>
                <SkipToContent />
                {/*
                  Hide the top nav AND the footer on unauthenticated pages
                  (currently just /login). An unauthenticated visitor does
                  not need the navigation chrome — the login page is a
                  focused authentication surface, and the brand mark +
                  form inside the page is enough to communicate "you are
                  in the right place". Showing the nav would also advertise
                  authenticated-only actions (the command palette) to an
                  unauthenticated visitor. The footer is hidden for the
                  same reason: the mono-font build marker is internal
                  chrome, and a sign-in screen should not carry internal
                  product framing.
                */}
                {isAuthenticated ? <TopNav /> : null}
                {backupStatus ? (
                  <div className="mx-auto mt-4 w-full max-w-screen-xl px-4 sm:px-6">
                    <BackupReminderBanner initialStatus={backupStatus} />
                  </div>
                ) : null}
                <div className="flex flex-1 flex-col">{children}</div>
                {isAuthenticated ? <Footer /> : null}
              </TooltipProvider>
            </CommandPaletteRoot>
          </AddDialogRoot>
        </TanStackQueryProvider>
        {/*
          Global toast surface. Mounted once in the root layout so any
          client component can call `toast()` (e.g. settings save
          feedback). Dark theme matches the default appearance; richColors
          gives success/error their semantic green/red.
        */}
        <Toaster theme="dark" position="bottom-right" richColors />
      </body>
    </html>
  );
}
