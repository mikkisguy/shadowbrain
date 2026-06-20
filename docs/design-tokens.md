# Design Tokens — ShadowBrain

> **Code-level reference** for the design system. The full design
> rationale, component patterns, and AI-slop guardrails live in
> [`docs/superpowers/specs/2026-06-20-design-system-design.md`](superpowers/specs/2026-06-20-design-system-design.md).
> This file is just the token values + Tailwind config skeleton that
> the implementer of #20 needs.

Dark-mode-first. Cool-spectrum identity (cyan / blue / violet) drawn
from the ShadowBrain logo. Cream `#E4DCC8` is reserved for the
inverted/selected state — it is a foil, not a primary color.

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

| Token              | Hex                        | CSS variable           | Usage                                                       |
| ------------------ | -------------------------- | ---------------------- | ----------------------------------------------------------- |
| Primary            | `#3D6BFF`                  | `--primary`            | Dominant brand. Primary actions, focus, links, selected nav |
| Primary foreground | `#E4DCC8`                  | `--primary-foreground` | Text on primary                                             |
| Primary muted      | `rgba(61, 111, 255, 0.15)` | `--primary-muted`      | Subtle primary backgrounds                                  |
| Accent cyan        | `#4FCFFF`                  | `--accent-cyan`        | Live/active indicators, type badge border                   |
| Accent violet      | `#7B6AFF`                  | `--accent-violet`      | Tag pills, secondary affordances                            |

`--primary` is the anchor — most prominent. `--accent-cyan` and
`--accent-violet` are supporting, used sparingly.

---

## Semantic status (universal)

| Token   | Hex       | CSS variable | Usage                               |
| ------- | --------- | ------------ | ----------------------------------- |
| Success | `#22C55E` | `--success`  | Saved, sync OK                      |
| Error   | `#EF4444` | `--error`    | Failed, destructive                 |
| Warning | `#F59E0B` | `--warning`  | Caution, partial states             |
| Info    | `#3D6BFF` | `--info`     | Informational (same as `--primary`) |

These are functional, not decorative. They never appear as card
chrome or branding.

---

## Type colors (as accents, not identity)

The original 9-type palette is preserved but **relegated to small
accents** — a 6px dot inside the type badge, and a 2px left-edge
accent on detail view. See the design system spec for the full rule.

| Type     | Hex       | CSS variable      | Represents                  |
| -------- | --------- | ----------------- | --------------------------- |
| note     | `#22C55E` | `--type-note`     | Knowledge notes             |
| bookmark | `#F59E0B` | `--type-bookmark` | Saved bookmarks             |
| journal  | `#7C5CFC` | `--type-journal`  | Journal entries             |
| question | `#14B8A6` | `--type-question` | Open questions              |
| project  | `#EC4899` | `--type-project`  | Active projects             |
| person   | `#3B82F6` | `--type-person`   | People entries              |
| event    | `#F97316` | `--type-event`    | Events, occurrences         |
| dream    | `#A855F7` | `--type-dream`    | Dream journal               |
| raw      | `#6B7280` | `--type-raw`      | Raw entries, quick captures |

---

## Typography

| Family         | Role                 | Weights       | Source                              |
| -------------- | -------------------- | ------------- | ----------------------------------- |
| Inter          | Sans, primary UI     | 400, 500, 700 | Google Fonts via `next/font/google` |
| Newsreader     | Serif, brand moments | 400, 600      | Google Fonts via `next/font/google` |
| JetBrains Mono | Mono, code/data      | 400, 500      | Google Fonts via `next/font/google` |

---

## Layout constants

| Constant           | Value                                                                    |
| ------------------ | ------------------------------------------------------------------------ |
| Border radius      | `2px` uniform (all `--radius-*` resolve to 2px, opt-in via `rounded-sm`) |
| Shadows            | none (use hairline borders + color contrast)                             |
| Spacing base       | 4px (Tailwind default)                                                   |
| Type dots          | 6px filled circle (1.5px inset from badge edge)                          |
| Detail edge accent | 2px solid, 16px left padding                                             |
| Focus outline      | 1px solid `--primary`, 2px offset                                        |
| Transition timing  | 150ms ease-out, color/opacity only                                       |

---

## Tailwind config skeleton

```ts
// tailwind.config.ts
import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        "surface-elevated": "var(--surface-elevated)",
        "surface-inverted": "var(--surface-inverted)",
        "foreground-inverted": "var(--foreground-inverted)",
        "surface-muted": "var(--surface-muted)",
        border: "var(--border)",
        "border-strong": "var(--border-strong)",
        "muted-foreground": "var(--muted-foreground)",

        "surface-warm": "var(--surface-warm)",
        "surface-warm-foreground": "var(--surface-warm-foreground)",
        "surface-warm-border": "var(--surface-warm-border)",

        primary: {
          DEFAULT: "var(--primary)",
          foreground: "var(--primary-foreground)",
          muted: "var(--primary-muted)",
        },
        "accent-cyan": "var(--accent-cyan)",
        "accent-violet": "var(--accent-violet)",

        success: "var(--success)",
        error: "var(--error)",
        warning: "var(--warning)",
        info: "var(--info)",

        type: {
          note: "var(--type-note)",
          bookmark: "var(--type-bookmark)",
          journal: "var(--type-journal)",
          question: "var(--type-question)",
          project: "var(--type-project)",
          person: "var(--type-person)",
          event: "var(--type-event)",
          dream: "var(--type-dream)",
          raw: "var(--type-raw)",
        },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        serif: ["var(--font-newsreader)", "Georgia", "serif"],
        mono: ["var(--font-jetbrains-mono)", "ui-monospace", "monospace"],
      },
      borderRadius: {
        none: "0",
        DEFAULT: "2px",
        sm: "2px",
        md: "2px",
        lg: "2px",
        xl: "2px",
        "2xl": "2px",
        full: "2px",
      },
      boxShadow: {
        none: "none",
        DEFAULT: "none",
        sm: "none",
        md: "none",
        lg: "none",
        xl: "none",
      },
      transitionDuration: {
        DEFAULT: "150ms",
      },
      transitionTimingFunction: {
        DEFAULT: "cubic-bezier(0, 0, 0.2, 1)", // ease-out
      },
    },
  },
  plugins: [],
} satisfies Config;
```

---

## CSS variable setup (globals.css)

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

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

  /* Warm surface (elevated/featured) */
  --surface-warm: #322b19;
  --surface-warm-foreground: #e4dcc8;
  --surface-warm-border: rgba(228, 220, 200, 0.1);

  /* Cool accents */
  --primary: #3d6bff;
  --primary-foreground: #e4dcc8;
  --primary-muted: rgba(61, 111, 255, 0.15);
  --accent-cyan: #4fcfff;
  --accent-violet: #7b6aff;

  /* Semantic */
  --success: #22c55e;
  --error: #ef4444;
  --warning: #f59e0b;
  --info: #3d6bff;

  /* Type colors */
  --type-note: #22c55e;
  --type-bookmark: #f59e0b;
  --type-journal: #7c5cfc;
  --type-question: #14b8a6;
  --type-project: #ec4899;
  --type-person: #3b82f6;
  --type-event: #f97316;
  --type-dream: #a855f7;
  --type-raw: #6b7280;
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
