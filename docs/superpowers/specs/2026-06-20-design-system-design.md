# Design System — Design Spec

**Date:** 2026-06-20
**Status:** Draft
**Parent:** Phase 3 — Web UI Core (`docs/superpowers/specs/2026-05-07-web-ui-core-design.md`)
**Implements:** #20 (Design system & layout shell)

---

## Overview

The ShadowBrain design system is the visual + typographic foundation for
the web UI. It is dark-first, cool-spectrum, editorial in structure, and
deliberately restrained — the goal is a UI that feels considered rather
than generated. Tokens defined here are referenced by every subsequent
UI work item; component patterns below are the contract for how those
tokens are applied.

The system is inspired by the Nous Research / Hermes Agent "Choose a
Plan" page (editorial structure: hairlines, tracked uppercase labels,
square corners, dramatic inversion on selected state). The color
identity is drawn from the ShadowBrain logo (cool cyan → blue → violet
gradient on near-black) — warm cream is reserved exclusively for the
inverted/selected state, which acts as a foil rather than a primary
color. The 9-type content color palette from the original design
tokens is preserved but **relegated to small accents** — type
differentiation comes from a 6px dot in the badge, not from a fully
colored card.

---

## Design principles

1. **Editorial, not "AI slop."** Square corners, hairline dividers, no
   shadows, no glassmorphism, no gradient mesh backgrounds, no rounded-2xl
   on everything. See the "Patterns to avoid" section for the full list.
2. **Dark-first, cool-spectrum.** The dark base is the canvas. Warm
   cream appears only as the inversion/selected state.
3. **Content is the hero.** Chrome (nav, borders, buttons) is quiet.
   Type and content carry the visual weight.
4. **Tracked uppercase labels** (per Nous) for nav, badges, buttons.
   Body text is sentence case. This creates a clear visual distinction
   between UI controls and content.
5. **Restrained color.** Three cool accents (cyan, blue, violet) plus
   cream for the inversion. Plus universal status colors (green/red/
   amber) that are functional, not decorative. Type colors are limited
   to 6px dots and 2px edge accents.
6. **Square corners and hairlines everywhere.** No border radius. No
   drop shadows. Depth is created by color contrast.

---

## Color tokens

All colors are referenced as CSS variables so they're themeable and
work with shadcn/ui conventions.

### Surface

| Token                   | Value                       | Use                                              |
| ----------------------- | --------------------------- | ------------------------------------------------ |
| `--background`          | `#0A0B14`                   | Page background                                  |
| `--foreground`          | `#E4DCC8`                   | Primary text (cream) on dark                     |
| `--surface-elevated`    | `rgba(228, 220, 200, 0.03)` | Slight tint for cards/panels over `--background` |
| `--surface-inverted`    | `#E4DCC8`                   | Selected/active state — cream fills, dark text   |
| `--foreground-inverted` | `#0A0B14`                   | Text on cream (`--surface-inverted`)             |
| `--surface-muted`       | `rgba(228, 220, 200, 0.06)` | Subtle hover/active backgrounds                  |
| `--border`              | `rgba(228, 220, 200, 0.10)` | Hairlines, dividers, card borders                |
| `--border-strong`       | `rgba(228, 220, 200, 0.20)` | Stronger dividers, focused input borders         |

### Surface (warm — for elevated/featured content)

A dark warm surface that contrasts the cool default. **Use sparingly** —
the default UI stays cool; warm surfaces are opt-in for content that
needs to stand out (featured items, pinned highlights, "premium"
content). Inspired by the dark warm tone seen when the Hermes / Nous
Research page is viewed through DarkReader, inverted from cream.

| Token                       | Value                       | Use                                                           |
| --------------------------- | --------------------------- | ------------------------------------------------------------- |
| `--surface-warm`            | `#322B19`                   | Warm elevated surface — for featured items, pinned highlights |
| `--surface-warm-foreground` | `#E4DCC8`                   | Text on `--surface-warm`                                      |
| `--surface-warm-border`     | `rgba(228, 220, 200, 0.10)` | Hairline border on warm surface (same as default)             |

**Rule:** the warm surface is a small accent, not a co-equal palette
sibling. If you find yourself reaching for it on most cards, you're
diluting the cool identity — back off and use `--surface-elevated`
instead. Reserve warm for genuinely elevated/featured content.

### Cool accents (brand)

| Token                  | Value                      | Use                                                                                |
| ---------------------- | -------------------------- | ---------------------------------------------------------------------------------- |
| `--primary`            | `#3D6BFF`                  | Dominant brand. Primary actions, focus rings, link color, selected nav indicator   |
| `--primary-foreground` | `#E4DCC8`                  | Text on `--primary` (cream)                                                        |
| `--primary-muted`      | `rgba(61, 111, 255, 0.15)` | Subtle primary backgrounds, e.g., selected list item                               |
| `--accent-cyan`        | `#4FCFFF`                  | Live/active indicators, "new" dots, type badge border. **Supporting, not primary** |
| `--accent-violet`      | `#7B6AFF`                  | Tag pills, secondary affordances. **Supporting, not primary**                      |

**Rule:** `--primary` is the dominant brand color and appears in the
most places. `--accent-cyan` and `--accent-violet` are supporting
colors used sparingly for specific affordances. Do not give all three
equal visual weight — `--primary` is the anchor.

### Semantic status (universal)

These are functional, not decorative. They are the same on every
app — using brand colors for status would conflict with the editorial
restraint.

| Token       | Value     | Use                                            |
| ----------- | --------- | ---------------------------------------------- |
| `--success` | `#22C55E` | Saved, sync OK, success messages               |
| `--error`   | `#EF4444` | Failed, error messages, destructive            |
| `--warning` | `#F59E0B` | Caution, partial states, attention             |
| `--info`    | `#3D6BFF` | Same as `--primary` — informational not status |

### Muted foreground (for secondary text)

| Token                | Value                       | Use                                   |
| -------------------- | --------------------------- | ------------------------------------- |
| `--muted-foreground` | `rgba(228, 220, 200, 0.65)` | Secondary text, captions, helper copy |

### Type colors (as accents, not identity)

The original 9-type palette is preserved from the previous design
tokens, but **relegated to small accents** — a 6px colored dot inside
the type badge, and a 2px left-edge accent on detail view. The brand
stays cool blue + cream; type colors are visual variety, not visual
identity.

| Type              | Hex       | Use                         |
| ----------------- | --------- | --------------------------- |
| `--type-note`     | `#22C55E` | Knowledge notes             |
| `--type-bookmark` | `#F59E0B` | Saved bookmarks             |
| `--type-journal`  | `#7C5CFC` | Journal entries             |
| `--type-question` | `#14B8A6` | Open questions              |
| `--type-project`  | `#EC4899` | Active projects             |
| `--type-person`   | `#3B82F6` | People entries              |
| `--type-event`    | `#F97316` | Events, occurrences         |
| `--type-dream`    | `#A855F7` | Dream journal               |
| `--type-raw`      | `#6B7280` | Raw entries, quick captures |

**Rule:** type colors appear only as 6px dots inside type badges, and
as 2px left-edge accents in detail view. They do **not** appear on
card chrome, button fills, type badge borders, or tag pills. A blog-tag
SaaS template uses type colors as primary card identity; this design
does not. The type colors are data markers, not decoration.

---

## Typography

Three typefaces, each with a clear role. The set mirrors the Hermes
example's serif + sans + mono structure but with fonts chosen to
avoid "AI slop" — restrained, modern, with personality but not
"designer-y."

| Family             | Role                 | Weights used                                               |
| ------------------ | -------------------- | ---------------------------------------------------------- |
| **Inter**          | Sans, primary UI     | 400 (body), 500 (labels, buttons), 700 (display headlines) |
| **Newsreader**     | Serif, brand moments | 400, 600 — wordmark, page-level display, section titles    |
| **JetBrains Mono** | Monospace, code/data | 400, 500 — code blocks, IDs, timestamps, technical values  |

All three are available on Google Fonts and self-hostable via
`next/font/google` for zero-runtime cost.

### Type scale

Following the editorial structure: a wide range from micro-labels to
display, with deliberate line-heights for each role.

| Token       | Size            | Line height | Use                                  |
| ----------- | --------------- | ----------- | ------------------------------------ |
| `text-xs`   | 0.75rem (12px)  | 1.4         | Micro labels, footnotes, helper text |
| `text-sm`   | 0.875rem (14px) | 1.5         | Small body, table cells              |
| `text-base` | 1rem (16px)     | 1.6         | Default body text                    |
| `text-lg`   | 1.125rem (18px) | 1.5         | Lead paragraphs, card titles         |
| `text-xl`   | 1.25rem (20px)  | 1.4         | Section subheadings                  |
| `text-2xl`  | 1.5rem (24px)   | 1.3         | Page-level headings                  |
| `text-3xl`  | 1.875rem (30px) | 1.2         | Major page headings (Newsreader)     |
| `text-4xl`  | 2.25rem (36px)  | 1.15        | Display (Newsreader)                 |
| `text-5xl`  | 3rem (48px)     | 1.1         | Hero display (Newsreader)            |

### Typographic roles (composed)

| Role               | Family         | Size      | Weight | Tracking | Case      |
| ------------------ | -------------- | --------- | ------ | -------- | --------- |
| Hero / wordmark    | Newsreader     | text-5xl  | 600    | -0.01em  | sentence  |
| Page title (h1)    | Newsreader     | text-3xl  | 600    | -0.01em  | sentence  |
| Section title (h2) | Inter          | text-2xl  | 700    | -0.01em  | sentence  |
| Card title         | Inter          | text-lg   | 500    | normal   | sentence  |
| Body               | Inter          | text-base | 400    | normal   | sentence  |
| Lead / intro       | Inter          | text-lg   | 400    | normal   | sentence  |
| UI label           | Inter          | text-xs   | 500    | +0.12em  | UPPERCASE |
| Nav link           | Inter          | text-sm   | 500    | +0.04em  | sentence  |
| Button             | Inter          | text-sm   | 500    | +0.04em  | UPPERCASE |
| Tag / badge        | Inter          | text-xs   | 500    | +0.06em  | UPPERCASE |
| Code / data        | JetBrains Mono | text-sm   | 400    | normal   | as-is     |
| Caption            | Inter          | text-xs   | 400    | normal   | sentence  |

**Rule:** Tracked UPPERCASE only on UI controls (labels, buttons, tags,
nav items). Content stays in sentence case with normal tracking. This
distinguishes chrome from content.

---

## Spacing scale

Tailwind's default 4px base, used with editorial generosity. Most UI
spacing is in the 16–48px range; the smaller steps (1–8) are for
tight inline layouts.

| Token | px  | Use                                     |
| ----- | --- | --------------------------------------- |
| `1`   | 4   | Inline gap (icon + label)               |
| `2`   | 8   | Tight stacks                            |
| `3`   | 12  | Default inline gap                      |
| `4`   | 16  | Default block gap, card padding (tight) |
| `6`   | 24  | Card padding (default), section gap     |
| `8`   | 32  | Major section gap                       |
| `12`  | 48  | Page region gap                         |
| `16`  | 64  | Between page regions                    |
| `24`  | 96  | Hero / empty-state padding              |

**Rule:** If you find yourself reaching for `1` or `2` in a layout
context, you're probably cramming — back off and use `4` or more. The
editorial feel depends on generous spacing.

---

## Border radius

**All radius: 0.** No exceptions.

Square corners on:

- Cards, panels, modals
- Buttons, inputs
- Tags, badges, type chips
- Avatars, image thumbnails
- Tabs, navigation items

This is a defining choice of the editorial direction. Even small
radii (2–4px) would undermine the "considered" feel.

---

## Shadows / elevation

**No shadows.** Depth is created by:

- Color contrast (cream on dark base)
- Hairline borders (`--border`)
- The inversion state (cream fill = "elevated/selected")
- The 2px type-color left-edge accent on detail view

Do not add `shadow-sm`, `shadow-md`, etc. If a component feels like it
needs shadow to "pop," it's probably the wrong color/contrast — fix
the token usage, don't add elevation.

---

## Iconography

**Library:** Lucide (already configured in `components.json`).

**Style:** Outline only, no filled variants. Consistent stroke weight
(default 1.5–2px from Lucide).

**Sizing:** Inline icons match surrounding text size (`size-4` for
text-sm, `size-5` for text-base). Standalone icons in actions: 16px
or 20px.

**Color:** Icons inherit `currentColor`. They do not carry their own
color tokens.

---

## Component patterns

These are the canonical patterns for the most-used components. New
components should follow these as templates.

### Card (Browse item, content detail)

```
┌────────────────────────────────────────────┐
│ [● TYPE]                       [live •]   │  ← header: type badge (with dot) + status
│                                            │
│ Title of the item                          │  ← card-title (text-lg, Inter 500)
│                                            │
│ Body snippet with <mark>highlighted</mark> │  ← body (text-sm, muted)
│ text that shows search match context...    │
│                                            │
│ [tag] [tag]                                │  ← tags (text-xs, accent-violet)
│                                            │
│              [OPEN]  [edit]                │  ← actions (right-aligned)
└────────────────────────────────────────────┘
```

- Background: `--background`
- Border: 1px solid `--border`
- Padding: 24px (`spacing-6`)
- No shadow. No border-radius.
- On hover: `--surface-muted` background tint (color transition, 150ms)
- On selected: full inversion — cream fill, dark text, primary action
  becomes inverted-style
- **No type-color chrome.** The only place the type color appears on
  the card is the dot inside the type badge.

### Button

**Primary**

- Background: `--primary`
- Foreground: `--primary-foreground`
- No border (or 1px solid `--primary` for crisp edge)
- Padding: `8px 14px` (compact), `10px 18px` (default)
- Text: `text-sm`, weight 500, UPPERCASE, +0.04em tracking
- Hover: slight brightening (`--primary` @ 90% lightness), 150ms
- Focus: 1px hairline outline offset 2px (in `--primary` or `--foreground`)
- Active: 95% scale (transform: scale(0.98), 100ms)

**Secondary (outlined)**

- Background: transparent
- Foreground: `--foreground`
- Border: 1px solid `--border-strong`
- Same padding/text/hover as primary

**Ghost (icon-only or tertiary)**

- Background: transparent
- Foreground: `--muted-foreground`
- No border
- Hover: `--surface-muted` background

### Input

- Background: `--background`
- Border: 1px solid `--border-strong`
- Foreground: `--foreground`
- Placeholder: `--muted-foreground`
- Padding: `10px 14px`
- Text: `text-sm`, Inter 400
- Focus: border becomes `--primary`, no glow
- Disabled: 50% opacity, no interaction

### Tag pill

- Background: transparent
- Border: 1px solid `--accent-violet`
- Foreground: `--accent-violet`
- Padding: `3px 10px`
- Text: `text-xs`, Inter 500, UPPERCASE, +0.06em tracking
- No border-radius
- On hover: `--accent-violet` @ 15% background

### Type badge

- Background: transparent
- Border: 1px solid `--accent-cyan`
- Foreground: `--accent-cyan`
- Padding: `3px 8px 3px 6px` (slightly tighter on the left to nest the dot)
- **Type-color dot:** a 6px filled circle on the left side of the badge
  text, using the type's color from the type palette above
- Text: `text-xs`, Inter 500, UPPERCASE, +0.12em tracking
- No border-radius
- On hover: `--accent-cyan` @ 15% background

The dot keeps its color even when the card is in the inverted (cream)
selected state. The type identity persists through state changes.

### Tab

- Text: `text-sm`, Inter 500
- Foreground: `--muted-foreground` (inactive), `--foreground` (active)
- No background, no border
- Active state: 1px underline in `--primary` (2px from text bottom)
- Padding: `8px 12px`
- Hover (inactive): `--foreground` foreground

### Modal (command palette, dialogs)

- Background: `--background`
- Border: 1px solid `--border-strong`
- Foreground: `--foreground`
- **No overlay backdrop blur** — use `rgba(10, 11, 20, 0.7)` solid
  backdrop only
- No shadow. No border-radius.
- Padding: per use case

### Detail view accent

- The content body in an item detail view gets a 2px left-edge stripe
  in the type's color (the same color used in the type badge dot)
- 16px left padding inside the stripe
- The stripe color ties the content visually to its type
- **This accent only appears in detail view, not in list cards.** List
  cards use the type badge dot for differentiation.

### Featured / elevated card

For genuinely elevated content — featured items, pinned highlights,
"premium" content. The card uses the warm surface instead of the
default cool, giving it visual weight without resorting to shadows or
elevation effects.

- Background: `--surface-warm` (`#322B19`)
- Foreground: `--surface-warm-foreground` (cream)
- Border: 1px solid `--surface-warm-border`
- Padding: 24px
- Same shape and structure as the standard card — square corners,
  hairline border, no shadow
- The type badge and tags follow the standard pattern, but the cyan
  and violet are slightly muted on the warm surface (drop to ~80%
  saturation) for visual harmony — or keep them at full saturation if
  the visual contrast feels right

**Use sparingly.** If a majority of cards use the warm surface, the
warmth loses its meaning. Most cards stay on the cool default; the
warm surface is for the genuinely special.

### Skeleton / loading

- **No shimmer animation.** Render text "Loading…" in `--muted-foreground`.
- For data placeholders, use 1px hairlines in `--border` to indicate
  structure (no animated bars).

### Empty state

- Centered text + simple Lucide icon
- Icon: 32px, `--muted-foreground`
- Text: `text-lg` headline + `text-sm` body, both in `--muted-foreground`
- **No illustrations, no AI-generated art.**

### Error state

- Inline text + Lucide alert icon (in `--error`)
- Text: `text-sm`, `--error`
- No banners, no glow, no red background fills

---

## Patterns to avoid ("AI slop" guardrails)

These patterns are explicitly banned. If you find yourself reaching for
one of them, stop and use the editorial alternative.

| ❌ Avoid                                                                                                | ✅ Use instead                                                             |
| ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Gradient mesh backgrounds (purple/blue/pink)                                                            | Solid `--background`                                                       |
| Glassmorphism (heavy `backdrop-blur-*`)                                                                 | Hairline borders for separation                                            |
| Rounded-2xl, rounded-lg, rounded-md on cards/buttons                                                    | `rounded-none` (0 radius)                                                  |
| `shadow-sm`, `shadow-md`, `shadow-lg` on cards/buttons                                                  | Hairline border + color contrast                                           |
| Gradient text (`bg-gradient-to-r bg-clip-text`)                                                         | Solid `--foreground`                                                       |
| Drop shadow on text (`drop-shadow-*`)                                                                   | No shadow on text                                                          |
| Generic purple/blue/teal SaaS starter palette                                                           | The cool spectrum defined here (cyan / blue / violet)                      |
| Floating action buttons with no purpose                                                                 | Inline actions or buttons in card footer                                   |
| Animated shimmers for loading                                                                           | Text "Loading…" + hairline placeholders                                    |
| Hero illustrations / AI-generated art                                                                   | Text + simple Lucide icon                                                  |
| Bouncy / spring animations                                                                              | 150ms ease-out, color/opacity only                                         |
| Glow on hover (`shadow-[0_0_20px_...]`)                                                                 | Hairline outline or color tint                                             |
| Per-content-type colors as primary card chrome (note card is fully green, journal card is fully purple) | Type colors only as 6px dots in badges and 2px edge accents in detail view |
| Rounded avatars / images                                                                                | `rounded-none`                                                             |
| Large drop shadows under modals/popovers                                                                | 1px hairline border on solid background                                    |
| Custom serif/decorative fonts for "branding"                                                            | Newsreader only for wordmark + page-level display                          |
| Color-coded status badges (green=ok, red=err) as card decoration                                        | Universal status colors used sparingly, never as decoration                |

---

## Out of scope (v1)

- Light mode (v1 is dark-only; light mode can be added later by
  swapping the surface and foreground tokens)
- Custom icon set (Lucide only)
- Dark/light theme toggle UI (deferred — the app is dark-only)
- Animation library (Framer Motion etc. is not needed; CSS transitions
  suffice for the motion spec)
- High-contrast / accessibility color variants (will add if user
  requests)

---

## Open questions

_None at draft time._
