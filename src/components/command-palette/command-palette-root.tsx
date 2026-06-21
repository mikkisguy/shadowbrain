"use client";

import {
  CommandPalette,
  CommandPaletteProvider,
} from "@/components/command-palette";

/**
 * Single mount point for the command palette.
 *
 * Wraps `children` in the provider (so the top-nav trigger can
 * share state with the dialog) and renders the dialog itself.
 * The component is intentionally client-side: base-ui Dialog
 * uses `useId` and React portals, and the global `keydown`
 * listener only makes sense in the browser.
 *
 * Mount this *once* in the root layout, inside the `<body>`,
 * and after the `SkipToContent` / `TopNav` chrome so the
 * dialog portal sits above everything else in the React tree.
 */
export function CommandPaletteRoot({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <CommandPaletteProvider>
      {children}
      <CommandPalette />
    </CommandPaletteProvider>
  );
}
