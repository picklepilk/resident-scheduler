# Field-Ready Design System

> Synced from `ems-inventory/docs/DESIGN.md` (the canonical copy — edit there,
> re-sync here). This app adopted the shared Field-Ready palette/type/shape
> system so it reads as one family with OMD Response and the other UTHealth
> EM tools. See `ems-inventory/design-system/README.md` for the sync process.

The visual identity for the OMD Response app, grounded in the crews' own
world: physician response vehicles (OMD-6…OMD-9), ambulance livery per the
federal KKK-A-1822 spec (white body, Omaha Orange beltline stripe, Star of
Life blue), equipment labels, and drug-box conventions. The app must read
instantly in sunlight on a phone at a gas pump and at 2am in a dark cab.

**Every UI change must follow this spec.** When in doubt: quiet, chunky,
high-contrast, utilitarian. One bold element per screen, everything else
disciplined.

## Palette

Semantic tokens (defined in `src/index.css`, wired in `tailwind.config.js`):

| Token | Light | Role |
|---|---|---|
| `background` | Ambulance White `#F4F6F8` | app background |
| `card` | white | surfaces |
| `foreground` | Duty Navy ink `#0D2036` | text |
| `primary` | Star Blue `#0057B8` | actions, links, active nav |
| `omaha` | Omaha Orange `#E8590C` | **signature accent — chrome only** (beltline stripes, wordmark underline). NEVER a status color, never large fills. |
| `navy` | Duty Navy `#122A44` | dark hero surfaces |
| `controlled` | Violet `hsl(262 72% 50%)` | controlled-substance flag ONLY (not used in this app currently) |
| `destructive` | Flare Red | destructive actions |

Status colors stay on the existing literal Tailwind families (they are
already dark-mode remapped in `src/index.css`): **expired/out = red**,
**expiring = yellow**, **low = orange**, **ok = green**. Structural
treatment, not new hues: tinted block (`bg-red-100 text-red-800
border-red-200`) + a 3px left rail in the saturated hue
(`border-l-[3px] border-l-red-600`) + condensed uppercase label.

### Hard rules (dark mode is fragile)

- **Never introduce a new literal Tailwind palette** (`zinc`, `slate`,
  `stone`, `neutral`, `teal`, `cyan`, `indigo`, `rose`, …). Dark mode works
  by remapping a hard-coded list of literal utilities in `src/index.css`;
  anything outside that list renders light-mode colors in dark mode.
- Allowed literal families (already remapped): `gray`, `blue`, `red`,
  `yellow`, `orange`, `green`, `amber`, `purple`. Everything else must use
  tokens (`bg-card`, `text-muted-foreground`, `bg-primary`, `bg-omaha`, …).
- Token colors support opacity modifiers: `bg-omaha/10`, `bg-navy/95`.
- Category/rotation color-coding in this app (`CATEGORIES`, `areaColor`) is
  built entirely from the 8 allowed families with shade variation used to
  keep same-family categories visually distinct (e.g. `EM_HOME` = `blue-700`
  badge, `EM_BAMC` = `blue-400` badge — same family, different shade).

## Typography

Loaded via `@fontsource` imports in `src/main.jsx`; use via Tailwind classes:

- **`font-display`** — Barlow Condensed 600/700. Page titles, section
  headers, big stats. Always with `uppercase` and `tracking-wide` (or
  `tracking-wider`). Use at real sizes (`text-2xl`+ for page titles), never
  for body copy.
- **`font-sans`** — Barlow (default on `<body>`). All body copy, buttons,
  forms.
- **`font-mono`** — JetBrains Mono. ALL data readouts: resident counts,
  coverage numbers, dates, shift times. Usually with `tabular-nums`.

## Shape & surfaces

- Radius is deliberately tighter (`--radius: 0.375rem`). Prefer
  `rounded-md`/`rounded-lg`; avoid pill-y `rounded-2xl`/`rounded-3xl`.
- Cards: `bg-white border border-gray-200 rounded-lg shadow-sm`. Accent via
  a left rail (`border-l-[3px] border-l-<hue>-600`) instead of `border-2`
  full-color frames.
- Icon chips: `p-2 bg-blue-50 rounded-md` (squared, not `rounded-xl`).

## Accessibility floor

Visible keyboard focus (`focus-visible:ring-2 focus-visible:ring-ring`),
WCAG-AA contrast on all text (the tinted status blocks use `-800` text on
`-100`/`-50` bg — keep that pairing), labels on all form fields, `aria-label`
on icon-only buttons.
