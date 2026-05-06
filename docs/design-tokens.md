# Design Tokens — ShadowBrain

Dark-mode-first design system. All colors designed for readability on dark backgrounds.

---

## Brand

| Token | Hex | Tailwind | Usage |
|-------|-----|----------|-------|
| `brand-950` | `#120A29` | `brand-950` | Deepest surface — page background anchor |
| `brand-900` | `#1A0F3D` | `brand-900` | Hero backgrounds, feature cards |
| `brand-800` | `#352475` | `brand-800` | **Primary brand color** — sidebar, nav, footer, logo |
| `brand-600` | `#7C5CFC` | `brand-600` | **Primary accent** — buttons, links, active states, focus rings |
| `brand-400` | `#9B8BFC` | `brand-400` | Hover states, secondary highlights |
| `brand-200` | `#C4B8FD` | `brand-200` | Text on brand surfaces, subtle accents |

---

## Neutral (Dark Mode)

| Token | Hex | Tailwind | Usage |
|-------|-----|----------|-------|
| `neutral-950` | `#08060D` | `neutral-950` | Root page background |
| `neutral-900` | `#0F0D15` | `neutral-900` | Card backgrounds, sidebar |
| `neutral-800` | `#1A1722` | `neutral-800` | Elevated surfaces, modals |
| `neutral-700` | `#282430` | `neutral-700` | Borders, dividers, input backgrounds |
| `neutral-500` | `#5C5868` | `neutral-500` | Muted text, placeholder text |
| `neutral-300` | `#9894A4` | `neutral-300` | Secondary text, descriptions |
| `neutral-200` | `#BDB8C8` | `neutral-200` | Body text |
| `neutral-100` | `#E4E0EC` | `neutral-100` | Headings, primary text |
| `neutral-50`  | `#F5F3F9` | `neutral-50`  | High-emphasis text, white equivalents |

---

## Semantic

| Token | Hex | Tailwind | Usage |
|-------|-----|----------|-------|
| `success` | `#22C55E` | `emerald-500` | Success states, confirmations, "done" indicators |
| `success-muted` | `#14532D` | `emerald-900` | Success backgrounds, badges |
| `warning` | `#F59E0B` | `amber-500` | Warnings, "needs attention" |
| `warning-muted` | `#78350F` | `amber-900` | Warning backgrounds, badges |
| `error` | `#EF4444` | `red-500` | Errors, destructive actions, "broken" indicators |
| `error-muted` | `#7F1D1D` | `red-900` | Error backgrounds, badges |
| `info` | `#3B82F6` | `blue-500` | Information, tips, neutral status |
| `info-muted` | `#1E3A5F` | `blue-900` | Info backgrounds, badges |

---

## Content Type Colors

Used for type badges, graph node colors, and filter tabs.

| Type | Hex | Tailwind name | Represents |
|------|-----|---------------|------------|
| `raw` | `#6B7280` | `type-raw` | Raw entries, quick captures |
| `journal` | `#7C5CFC` | `type-journal` | Journal entries, daily summaries |
| `note` | `#22C55E` | `type-note` | Knowledge notes |
| `bookmark` | `#F59E0B` | `type-bookmark` | Saved bookmarks |
| `person` | `#3B82F6` | `type-person` | People |
| `project` | `#EC4899` | `type-project` | Projects |
| `question` | `#14B8A6` | `type-question` | Questions |
| `event` | `#F97316` | `type-event` | Events, occurrences |
| `dream` | `#A855F7` | `type-dream` | Dream journal |

---

## Tailwind Config Skeleton

```js
// tailwind.config.ts
export default {
  theme: {
    extend: {
      colors: {
        brand: {
          950: '#120A29',
          900: '#1A0F3D',
          800: '#352475',
          600: '#7C5CFC',
          400: '#9B8BFC',
          200: '#C4B8FD',
        },
        neutral: {
          950: '#08060D',
          900: '#0F0D15',
          800: '#1A1722',
          700: '#282430',
          500: '#5C5868',
          300: '#9894A4',
          200: '#BDB8C8',
          100: '#E4E0EC',
          50:  '#F5F3F9',
        },
        type: {
          raw:      '#6B7280',
          journal:  '#7C5CFC',
          note:     '#22C55E',
          bookmark: '#F59E0B',
          person:   '#3B82F6',
          project:  '#EC4899',
          question: '#14B8A6',
          event:    '#F97316',
          dream:    '#A855F7',
        },
      },
    },
  },
};
```
