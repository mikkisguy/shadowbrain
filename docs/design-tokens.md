# Design Tokens — ShadowBrain

> **Code-level reference** for the design system. The full design
> rationale, component patterns, and AI-slop guardrails live in
> [`docs/superpowers/specs/2026-06-20-design-system-design.md`](superpowers/specs/2026-06-20-design-system-design.md).
> This file is just the token values + Tailwind v4 theme mapping that
> the implementer of #20 needs.

Dark-mode-first. Cool-spectrum identity (cyan / blue / violet) drawn
from the ShadowBrain logo. Cream `#E4DCC8` is reserved for the
inverted/selected state — it is a foil, not a primary color.

The canonical source of truth is
[`src/app/globals.css`](../src/app/globals.css) (regression-tested by
`src/app/globals.css.test.ts`). This document mirrors it; if the two
ever disagree, the CSS wins.

---

## Surface

| Token            | Hex                         | CSS variable            | Usage                                |
| ---------------- | --------------------------- | ----------------------- | ------------------------------------ |
| Page background  | `#0A0A0A`                   | `--background`          | Root background, page canvas         |
| Primary text     | `#E4DCC8`                   | `--foreground`          | Default text on dark                 |
| Elevated surface | `rgba(228, 220, 200, 0.03)` | `--surface-elevated`    | Cards, panels (slight tint)          |
| Inverted surface | `#E4DCC8`                   | `--surface-inverted`    | Selected/active state — cream fill   |
| Inverted text    | `#0A0A0A`                   | `--foreground-inverted` | Text on cream                        |
| Muted hover      | `rgba(228, 220, 200, 0.06)` | `--surface-muted`       | Subtle hover/active backgrounds      |
| Hairline         | `rgba(228, 220, 200, 0.10)` | `--border`              | Dividers, card borders               |
| Strong hairline  | `rgba(228, 220, 200, 0.20)` | `--border-strong`       | Focused input borders, modal borders |
| Muted text       | `rgba(228, 220, 200, 0.65)` | `--muted-foreground`    | Secondary text, captions             |
| Scrim            | `rgba(0, 0, 0, 0.65)`       | `--scrim`               | Modal/dialog overlays                |

## Surface (warm — for elevated/featured content)

A dark warm surface that contrasts the cool default. **Use sparingly**
— the default UI stays cool; warm surfaces are opt-in for content
that needs to stand out (featured items, pinned highlights, premium
content).

| Token           | Hex                         | CSS variable                | Usage                             |
| --------------- | --------------------------- | --------------------------- | --------------------------------- |
| Warm surface    | `#322B19`                   | `--surface-warm`            | Featured/elevated card background |
| Warm foreground | `#E4DCC8`                   | `--surface-warm-foreground` | Text on warm surface              |
| Warm border     | `rgba(228, 220, 200, 0.10)` | `--surface-warm-border`     | Hairline on warm surface          |

---

## Cool accents (brand)

| Token              | Hex                        | CSS variable           | Usage                                        |
| ------------------ | -------------------------- | ---------------------- | -------------------------------------------- |
| Primary            | `#406EFF`                  | `--primary`            | Dominant brand. Links, accents, selected nav |
| Primary strong     | `#2F50D6`                  | `--primary-strong`     | Fill of primary (default) buttons only       |
| Primary foreground | `#E4DCC8`                  | `--primary-foreground` | Text on primary                              |
| Primary muted      | `rgba(61, 111, 255, 0.15)` | `--primary-muted`      | Subtle primary backgrounds                   |
| Accent cyan        | `#4FCFFF`                  | `--accent-cyan`        | Live/active indicators, type badge border    |
| Accent violet      | `#7B6AFF`                  | `--accent-violet`      | Tag pills, secondary affordances             |

`--primary` is the anchor — most prominent. `--accent-cyan` and
`--accent-violet` are supporting, used sparingly.

`--primary-strong` (`#2F50D6`) is a darker shade of the brand blue used
**only** as the fill of primary (default) buttons. A cream label on the
brand `--primary` reaches only ~3.2:1 (below WCAG AA); `--primary-strong`
lifts the cream label to ~4.7:1 (AA) while staying recognisably the same
blue. Links, accents, and selected nav use `--primary` (`#406EFF`), tuned
to clear AA (~4.6:1) as text on the near-black canvas — the darker button
fill is decoupled so neither role compromises the other.

---

## Semantic status (universal)

| Token   | Hex       | CSS variable | Usage                               |
| ------- | --------- | ------------ | ----------------------------------- |
| Success | `#22C55E` | `--success`  | Saved, sync OK                      |
| Error   | `#EF4444` | `--error`    | Failed, destructive                 |
| Warning | `#F59E0B` | `--warning`  | Caution, partial states             |
| Info    | `#406EFF` | `--info`     | Informational (same as `--primary`) |

These are functional, not decorative. They never appear as card
chrome or branding.

---

## Type colors (as accents, not identity)

The type palette is preserved but **relegated to small accents** — a
6px dot inside the type badge, and a 2px left-edge accent on detail
view. See the design system spec for the full rule.

| Type     | Hex       | CSS variable      | Represents                  |
| -------- | --------- | ----------------- | --------------------------- |
| note     | `#22C55E` | `--type-note`     | Knowledge notes             |
| bookmark | `#F59E0B` | `--type-bookmark` | Saved bookmarks             |
| journal  | `#7C5CFC` | `--type-journal`  | Journal entries             |
| question | `#14B8A6` | `--type-question` | Open questions              |
| project  | `#EC4899` | `--type-project`  | Active projects             |
| person   | `#0EA5E9` | `--type-person`   | People entries              |
| event    | `#F97316` | `--type-event`    | Events, occurrences         |
| dream    | `#D946EF` | `--type-dream`    | Dream journal               |
| raw      | `#7B8290` | `--type-raw`      | Raw entries, quick captures |
| image    | `#84CC16` | `--type-image`    | Image captures              |

---

## shadcn/ui compatibility aliases

The shadcn components we use (Button, Separator, etc.) reference the
standard shadcn token names. `globals.css` maps them onto ShadowBrain
tokens via the `@theme inline` block so installed components pick up the
design system without extra theming. These `--color-*` aliases are **not**
the canonical token names — the `:root` variables above are the source of
truth.

| shadcn alias          | Maps to              | Notes                                        |
| --------------------- | -------------------- | -------------------------------------------- |
| `--color-card`        | `--background`       | Cards use the page canvas                    |
| `--color-popover`     | `--background`       | Popovers use the page canvas                 |
| `--color-secondary`   | `--surface-elevated` | Secondary surfaces                           |
| `--color-muted`       | `--surface-muted`    | Muted surfaces                               |
| `--color-accent`      | `--surface-elevated` | Accent surfaces                              |
| `--color-destructive` | `--error`            | Destructive actions                          |
| `--color-input`       | `--border-strong`    | Input borders                                |
| `--color-ring`        | `--foreground`       | Focus ring — cream, **not** the blue primary |

`--color-ring` deliberately maps to `--foreground` (cream), not the blue
`--primary`. Blue stays reserved for brand/primary actions/links; a
neutral cream ring reads as "attention" without colour-clashing and
matches the `::selection` treatment (cream highlight on the cool canvas).

---

## Typography

| Family         | Role                 | CSS variable   | Weights       | Source                              |
| -------------- | -------------------- | -------------- | ------------- | ----------------------------------- |
| Geist          | Sans, primary UI     | `--font-sans`  | 400, 500, 700 | Google Fonts via `next/font/google` |
| Newsreader     | Serif, brand moments | `--font-serif` | 400, 600      | Google Fonts via `next/font/google` |
| JetBrains Mono | Mono, code/data      | `--font-mono`  | 400, 500      | Google Fonts via `next/font/google` |

---

## Layout constants

| Constant           | Value                                                                                                                             |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| Border radius      | `2px` for `--radius` and `--radius-sm` … `--radius-4xl`; `--radius-full` omitted (Tailwind default `9999px` for type dots/badges) |
| Shadows            | none (use hairline borders + color contrast)                                                                                      |
| Spacing base       | 4px (Tailwind default)                                                                                                            |
| Type dots          | 6px filled circle (1.5px inset from badge edge)                                                                                   |
| Detail edge accent | 2px solid, 16px left padding                                                                                                      |
| Focus outline      | 1px solid `--foreground`, 2px offset                                                                                              |

---

## Motion

| Token                   | Value                        | CSS variable                           |
| ----------------------- | ---------------------------- | -------------------------------------- |
| Default duration        | `150ms`                      | `--default-transition-duration`        |
| Default timing function | `cubic-bezier(0, 0, 0.2, 1)` | `--default-transition-timing-function` |

The default transition is **150ms ease-out, color/opacity only** — no
layout-affecting transitions (width, height, transform on containers).
`@media (prefers-reduced-motion: reduce)` zeroes all transition and
animation durations so users who ask the OS to reduce motion get
instant changes.

---

## Tailwind v4 theme mapping (globals.css)

ShadowBrain uses Tailwind v4's CSS-first configuration — there is **no
`tailwind.config.ts`**. Tokens are declared as CSS custom properties in
`:root` and exposed to Tailwind utilities through an `@theme inline`
block. The `inline` modifier means Tailwind references the `var()` at
runtime, so a token change (e.g. a future light theme) cascades through
the utilities without a rebuild.

```css
@import "tailwindcss";
@import "tw-animate-css";
@import "shadcn/tailwind.css";

@custom-variant dark (&:is(.dark *));

@theme inline {
  /* Surface */
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-surface-elevated: var(--surface-elevated);
  --color-surface-inverted: var(--surface-inverted);
  --color-foreground-inverted: var(--foreground-inverted);
  --color-surface-muted: var(--surface-muted);
  --color-border: var(--border);
  --color-border-strong: var(--border-strong);
  --color-muted-foreground: var(--muted-foreground);
  --color-scrim: var(--scrim);

  /* Warm surface */
  --color-surface-warm: var(--surface-warm);
  --color-surface-warm-foreground: var(--surface-warm-foreground);
  --color-surface-warm-border: var(--surface-warm-border);

  /* Cool accents */
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-primary-muted: var(--primary-muted);
  --color-primary-strong: var(--primary-strong);
  --color-accent-cyan: var(--accent-cyan);
  --color-accent-violet: var(--accent-violet);

  /* Semantic status */
  --color-success: var(--success);
  --color-error: var(--error);
  --color-warning: var(--warning);
  --color-info: var(--info);

  /* Type colors */
  --color-type-note: var(--type-note);
  --color-type-bookmark: var(--type-bookmark);
  --color-type-journal: var(--type-journal);
  --color-type-question: var(--type-question);
  --color-type-project: var(--type-project);
  --color-type-person: var(--type-person);
  --color-type-event: var(--type-event);
  --color-type-dream: var(--type-dream);
  --color-type-raw: var(--type-raw);
  --color-type-image: var(--type-image);

  /* shadcn/ui compatibility aliases (see dedicated section above) */
  --color-card: var(--background);
  --color-card-foreground: var(--foreground);
  --color-popover: var(--background);
  --color-popover-foreground: var(--foreground);
  --color-secondary: var(--surface-elevated);
  --color-secondary-foreground: var(--foreground);
  --color-muted: var(--surface-muted);
  --color-accent: var(--surface-elevated);
  --color-accent-foreground: var(--foreground);
  --color-destructive: var(--error);
  --color-input: var(--border-strong);
  --color-ring: var(--foreground);

  /* Typography */
  --font-sans: var(--font-sans);
  --font-serif: var(--font-serif);
  --font-mono: var(--font-mono);

  /* Border radius — uniform 2px softening. --radius-full is intentionally
   * omitted so `rounded-full` keeps Tailwind's default 9999px (used by
   * type dots and badges). */
  --radius-sm: 2px;
  --radius-md: 2px;
  --radius-lg: 2px;
  --radius-xl: 2px;
  --radius-2xl: 2px;
  --radius-3xl: 2px;
  --radius-4xl: 2px;
  --radius: 2px;

  /* Shadows — none. Depth is created by color contrast. */
  --shadow-sm: none;
  --shadow-md: none;
  --shadow-lg: none;
  --shadow-xl: none;
  --shadow-2xl: none;
  --shadow-inner: none;

  /* Default motion — 150ms ease-out, color/opacity only. */
  --default-transition-duration: 150ms;
  --default-transition-timing-function: cubic-bezier(0, 0, 0.2, 1);
}
```

---

## :root design tokens (globals.css)

The `:root` block holds the source-of-truth values. v1 is dark-only; the
`.dark` selector mirrors these values so shadcn components targeting
`.dark` see the same palette.

```css
:root {
  /* Surface */
  --background: #0a0a0a;
  --foreground: #e4dcc8;
  --surface-elevated: rgba(228, 220, 200, 0.03);
  --surface-inverted: #e4dcc8;
  --foreground-inverted: #0a0a0a;
  --surface-muted: rgba(228, 220, 200, 0.06);
  --border: rgba(228, 220, 200, 0.1);
  --border-strong: rgba(228, 220, 200, 0.2);
  --muted-foreground: rgba(228, 220, 200, 0.65);
  --scrim: rgba(0, 0, 0, 0.65);

  /* Warm surface (elevated/featured) */
  --surface-warm: #322b19;
  --surface-warm-foreground: #e4dcc8;
  --surface-warm-border: rgba(228, 220, 200, 0.1);

  /* Cool accents */
  --primary: #406eff;
  --primary-foreground: #e4dcc8;
  --primary-strong: #2f50d6;
  --primary-muted: rgba(61, 111, 255, 0.15);
  --accent-cyan: #4fcfff;
  --accent-violet: #7b6aff;

  /* Semantic */
  --success: #22c55e;
  --error: #ef4444;
  --warning: #f59e0b;
  --info: #406eff;

  /* Type colors */
  --type-note: #22c55e;
  --type-bookmark: #f59e0b;
  --type-journal: #7c5cfc;
  --type-question: #14b8a6;
  --type-project: #ec4899;
  --type-person: #0ea5e9;
  --type-event: #f97316;
  --type-dream: #d946ef;
  --type-raw: #7b8290;
  --type-image: #84cc16;
}
```

---

## See also

- [Design system spec](superpowers/specs/2026-06-20-design-system-design.md)
  — full design rationale, component patterns, AI-slop guardrails
- [Web UI core spec](superpowers/specs/2026-05-07-web-ui-core-design.md)
  — Phase 3 page-level structure
- [Command palette spec](superpowers/specs/2026-06-20-command-palette-design.md)
  — the global navigation that uses these tokens
