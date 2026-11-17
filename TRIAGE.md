# Triage — design rules for all EM apps

Copy this file into each app repo as `TRIAGE.md`, and add one line to that repo's `CLAUDE.md`:

```
Design: follow TRIAGE.md. This app is <APP NAME>; --signal = <HEX>.
```

Also paste the "Rules" section below into your user-level `CLAUDE.md`
(`C:\Users\<you>\.claude\CLAUDE.md`) so new apps start in this style.

## Rules

- Link `triage.css` first; never hard-code hex values, fonts, or radii in components. Use the CSS variables or `tri-*` classes.
- Each app sets exactly one value of its own: `:root { --signal: <hex>; }` (in its own stylesheet, loaded after `triage.css`).
- Chrome: navy top bar (`.tri-topbar`) with a 4px orange bottom rule, app icon tile (`.tri-appicon`, two-letter monogram), app name in Archivo.
- Let color lead: page hero band in `--signal` (`.tri-hero`), table headers in `--signal`, stat tiles and chips on `--signal-tint`, section/card headers banded navy or orange (`.tri-card__band`).
- Round: cards 18–24px, buttons/inputs 12px, chips and badges pill.
- Primary buttons use `--signal`; one primary per view. Secondary = navy outline.
- ESI/status colors (`--esi-1..5`) are for acuity/clinical status only, always paired with a number or word, never decoration, and never used as a `--signal`.
- Type: Archivo for headings, IBM Plex Sans for body, IBM Plex Mono for doses, vitals, times, counts.
- Borders over shadows (shadows only for floating menus/dialogs). 44px minimum tap targets. Sentence case. Text contrast ≥ 4.5:1.
- Footer line: "UT Health San Antonio · Emergency Medicine". No official university logos or wordmarks.
- Restyling is visual only: never change logic, data, calculations, dose text, routes, or APIs while applying Triage.

## Signal registry

| App | Monogram | --signal |
|---|---|---|
| Student Scheduler | Sc | `#0F6B63` teal |
| EM Quick Ref | Qr | `#3B3FB0` indigo |
| Sim Lab | Sl | `#7A2E6E` plum |
| ED SmartBuild | Sb | `#0369A1` ocean |
| EMS Field Tools | Ef | `#5B4636` espresso |
| Resident Scheduler | Rs | `#155E75` deep cyan |
| EMS Hub | Eh | `#A0306B` berry |
| EMS Rotation | Er | `#475569` slate |
| Chest Pain Simulator | Cp | `#0F4C5C` petrol |
| Student Guidance | Sg | `#1E40AF` cobalt |
| EM Tracker | Et | `#5B21B6` violet |
| Interview Tracker | It | `#86198F` fuchsia |
| Resident Evaluation Tracker | Re | `#3F3D8F` dusk |
| Epic Demo (= ED SmartBuild) | Sb | `#0369A1` ocean |
| EM Shelf Showdown (shares EM Quick Ref) | Ms | `#3B3FB0` indigo |

All 13 work apps hold a slot (confirmed 2026-10-29). A new app needs a new colour: ≥4.5:1 with white text, and never red, amber, or green (they read as acuity).

## Dark theme (only for apps that already have a dark toggle)

Triage is light-first. Where an app already has a dark mode, follow the Student Scheduler model:
- Ground `hsl(213 45% 9%)`, cards `hsl(213 41% 14%)`, raised/secondary `hsl(213 32% 19%)`, borders `hsl(213 30% 23%)`, text `hsl(210 30% 94%)`, muted text `hsl(212 18% 66%)`.
- Top bar, card bands and hero bands are **navy-900**, never filled with the signal colour. The orange rule stays.
- The signal appears only in small doses: primary buttons (full-strength signal, white text), active nav/tab, focus ring and links (a lightened signal, same hue, ≥4.5:1 on the card), and stat tiles (signal at ~28% alpha with light signal-ink text).
- No large signal-coloured surfaces in dark mode. Pink, purple and fuchsia signals turn loud on navy, so keep them to the small doses above.
- ESI and status colours keep their meaning, using their dark-readable inks.

## Class cheat sheet

| Need | Use |
|---|---|
| Top bar / nav | `.tri-topbar`, `.tri-topbar__name`, `nav a[aria-current="page"]` |
| App icon | `<span class="tri-appicon">Sc</span>` |
| Page container / footer | `.tri-main`, `.tri-footer` |
| Page header | `.tri-hero` (+ `.tri-hero__kicker`), buttons `.tri-btn--on-signal`, `.tri-btn--on-signal-outline` |
| Card | `.tri-card`, `.tri-card--tint`, header `.tri-card__band` (`--orange`, `--signal`) |
| Stats | `.tri-stats` > `.tri-stat` (`--navy`, `--alert`) with `__label`, `__value` |
| Buttons | `.tri-btn` (`--secondary`, `--ghost`, `--danger`, `--pill`) |
| Forms | `.tri-field` > `label` + `.tri-input` / `.tri-select` / `.tri-textarea`; `aria-invalid="true"` + `.tri-field__error` |
| Toggle group | `.tri-segmented` > `button[aria-pressed]` |
| Chips / badges | `.tri-chip` (`--active`), `.tri-badge.tri-esi-1..5`, `.tri-chip.tri-status--ok/warn/danger/info` |
| Alerts | `.tri-alert--warn/info/danger/ok` |
| Tables | `.tri-table-wrap` > `table.tri-table`, numeric cells `.num` |
| Mobile tab bar | `.tri-tabbar` > `a[aria-current="page"]` |

## Tailwind apps

Don't fight Tailwind; map the tokens in `tailwind.config.js` and still import `triage.css` for the variables:

```js
theme: { extend: {
  colors: {
    signal: 'var(--signal)', 'signal-tint': 'var(--signal-tint)', 'signal-ink': 'var(--signal-ink)',
    navy: { 900: 'var(--navy-900)', 700: 'var(--navy-700)' },
    orange: { 400: 'var(--orange-400)', 600: 'var(--orange-600)' },
    ink: 'var(--ink)', muted: 'var(--muted)', line: 'var(--line)', ground: 'var(--ground)',
    esi: { 1: 'var(--esi-1)', 2: 'var(--esi-2)', 3: 'var(--esi-3)', 4: 'var(--esi-4)', 5: 'var(--esi-5)' },
  },
  fontFamily: { display: 'var(--font-display)', sans: 'var(--font-body)', mono: 'var(--font-data)' },
  borderRadius: { sm: 'var(--r-sm)', md: 'var(--r-md)', card: 'var(--r-lg)', hero: 'var(--r-xl)' },
}}
```
