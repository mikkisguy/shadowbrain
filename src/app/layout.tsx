import type { Metadata } from "next";
import { Inter, JetBrains_Mono, Newsreader } from "next/font/google";

import { SkipToContent } from "@/components/layout/skip-to-content";
import { TopNav } from "@/components/layout/top-nav";
import { getEnv } from "@/lib/env";

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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${newsreader.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="bg-background text-foreground flex min-h-full flex-col">
        <SkipToContent />
        <TopNav />
        <div className="flex flex-1 flex-col">{children}</div>
      </body>
    </html>
  );
}
