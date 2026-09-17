# First-login walkthrough

Content for the guided tour that appears on first login. Edit this file for copy changes — it's
the single source the module (`src/walkthrough/`) is meant to be checked against before merge.

## Welcome modal

Shown once, the first time an admin lands on the app after the auth gate passes (see
`useWalkthroughSeen` for the seen-flag mechanics). Any dismiss — Start walkthrough, Skip, the X,
or clicking the backdrop — marks it seen; it never re-prompts.

**Title:** EM Residency Scheduler

**Body (two lines):**
1. Build and validate each month's resident schedule — rotations, coverage rules, jeopardy, and
   day-off requests all live here, then export straight to QGenda.
2. A short guided tour points out where each of those lives before you dive in.

**Buttons:** Start walkthrough · Skip

## Walkthrough steps

9 steps. `roles` marks a step admin-only; a step with no `roles` line is shown to every role. In
this app's current routing, only `profiles.role === 'admin'` ever reaches the shell the
walkthrough mounts in (see "Decisions" below) — the `roles` tags below match the per-repo spec's
"admin-only tabs" guidance and are exercised by `filterStepsForRole`'s unit tests regardless.

| # | Title | Target tab | Roles |
|---|---|---|---|
| 1 | Dashboard — your command center | Dashboard | everyone |
| 2 | EM Residents — the roster | EM Residents | admin |
| 3 | Shift Matrix — who can work what | Shift Matrix | admin |
| 4 | Schedule — the grid | Schedule | everyone |
| 5 | Scheduling Rules — coverage targets | Scheduling Rules | admin |
| 6 | Violations — the generation report | Violations | admin |
| 7 | Jeopardy — backup call | Jeopardy | everyone |
| 8 | Requests — resident day-off requests | Requests | everyone |
| 9 | Settings — backup and export config | Settings | admin |

### 1. Dashboard — your command center
- **Headline:** Dashboard is where you build and archive each month's block, one step at a time.
- **Bullets:**
  - The Block Calendar shows every saved block for an academic year with a coverage heatmap.
  - Current Block is your active workspace — name, dates, and special days live here.
  - e.g. set the block name and start date, then Save Block to archive it.
- **Target:** `tab-dashboard` · **Route:** `dashboard`

### 2. EM Residents — the roster
- **Headline:** Add residents once a year and set each one's rotation per block.
- **Bullets:**
  - Import Roster pastes or uploads a spreadsheet instead of adding residents one at a time.
  - Vacation dates, approved days off, and jeopardy call dates all live on each resident's tile.
  - e.g. paste a roster row like "Smith, Jane — EM — PGY-2" straight from a spreadsheet.
- **Target:** `tab-em` · **Route:** `em` · **Roles:** admin

### 3. Shift Matrix — who can work what
- **Headline:** The matrix defines which shift types each residency and PGY year is eligible for.
- **Bullets:**
  - Click any cell to toggle; modified rows show a pencil icon and a per-row reset.
  - e.g. expand a row to set a per-rotation override — an EMS month can have a different shift
    list than a standard EM month.
- **Target:** `tab-matrix` · **Route:** `matrix` · **Roles:** admin

### 4. Schedule — the grid
- **Headline:** Generate fills every open slot automatically, respecting eligibility and rest rules.
- **Bullets:**
  - Click any cell to assign or adjust a shift by hand — the picker only offers legal options.
  - e.g. Generate Schedule fills the whole block in one click; Trauma Day is filled last so it
    never crowds out other coverage.
- **Target:** `tab-schedule` · **Route:** `schedule`

### 5. Scheduling Rules — coverage targets
- **Headline:** Set how many residents each shift needs per day before you generate.
- **Bullets:**
  - e.g. POD Day needs 2 on weekdays, 3 on Monday/Tuesday — coverage is a min/max, not one number.
  - Day-of-week rules like Grand Rounds Wednesday and EMS Mon/Tue live here too.
- **Target:** `tab-rules` · **Route:** `rules` · **Roles:** admin

### 6. Violations — the generation report
- **Headline:** Every coverage gap and rule conflict from the last generate lands here.
- **Bullets:**
  - e.g. an unfilled Trauma Night slot shows why — no eligible resident, or everyone rest-blocked.
  - Clear this list before exporting — QGenda export warns on any unresolved issue.
- **Target:** `tab-validation` · **Route:** `validation` · **Roles:** admin

### 7. Jeopardy — backup call
- **Headline:** Track who is on backup call and see any day nobody is covering it.
- **Bullets:**
  - Jeopardy never overlaps a clinical shift — the app blocks that combination automatically.
  - e.g. Auto-fill assigns PGY-1/2/3 jeopardy tracks from whoever is on an EM Home rotation that
    block.
- **Target:** `tab-jeopardy` · **Route:** `jeopardy`

### 8. Requests — resident day-off requests
- **Headline:** Residents submit their own day-off requests here; you approve or decline.
- **Bullets:**
  - e.g. approve a request and it becomes an orange OFF marker on the Schedule grid automatically.
  - A note you add when deciding shows on that resident's PDF export.
- **Target:** `tab-requests` · **Route:** `requests`

### 9. Settings — backup and export config
- **Headline:** Back up your data, restore from a backup, and tune how exports look.
- **Bullets:**
  - e.g. QGenda Task Names lets you override a shift's exported task label per resident.
  - JSON backup/restore covers the roster, blocks, rules, and coverage in one file.
- **Target:** `tab-settings` · **Route:** `settings` · **Roles:** admin

## Replay

**User Guide tab → "Getting Started" section → "Replay walkthrough" button.** Starts at step 0
regardless of the seen-flag.

## Decisions

- **Mount point:** the walkthrough mounts inside `ResidentScheduler`'s own return, wrapped once
  via a new `WalkthroughRoot` composition component (`src/walkthrough/WalkthroughRoot.jsx`) rather
  than several separate mount calls, so the ~17k-line file's own edit is a single wrap plus a
  handful of `data-tour` attributes and the Getting Started section — not a spec file, but a small
  addition kept inside `src/walkthrough/` for the same reason the spec's own files live there.
- **Role default:** `AppGate.jsx` only ever renders `ResidentScheduler` for
  `profiles.role === 'admin'` — every other role (`pending`, `resident`) is routed to a separate,
  simpler request-only view that never imports `ResidentScheduler.jsx` (confirmed in the repo's
  own `CLAUDE.md` and in `AppGate.jsx`'s branches). So in practice every viewer of this walkthrough
  is an admin today. `WalkthroughRoot` defaults `role` to `'admin'` when `viewer` is absent (the
  local-dev, auth-disabled fallback path) for the same reason. The `roles: ['admin']` tags on five
  of the nine steps above are still applied faithfully per the spec's "Admin-only tabs" guidance
  and are exercised by `filterStepsForRole`'s unit tests, in case a future resident-facing view of
  this shell is ever built — but they currently have no user-visible effect, since a `resident`
  account never reaches this component. Flagged under "Concerns" in the delivery report.
- **Session plumbing:** `AppGate.jsx`'s admin branch now also passes the full Supabase `session`
  object as `viewer.session`, so `useWalkthroughSeen` can read/write `user_metadata` without a
  second `getSession()` call — `AppGate.jsx` already has an explicit comment discouraging a third
  identity lookup elsewhere in the app; a fourth (session re-fetch inside the walkthrough module)
  would have repeated the same anti-pattern.
- **Spotlight ring animation:** Epic's `TourSpotlight.tsx` used a custom `animate-tour-ring`
  keyframe this app doesn't define. Ported using Tailwind's built-in `animate-pulse` instead of
  adding a new global keyframe — same "draws the eye" effect, no new CSS.
- **Tailwind retheme:** Epic's custom design tokens (`ink-900`, `surface-1`, `rule-strong`,
  `system`, etc.) were mapped onto this app's existing plain-Tailwind + shadcn-style palette
  (`gray-800`, `white`, `gray-200`/`gray-300`, `primary`) — this app has no equivalent token layer,
  so there was nothing to preserve beyond matching intent (dark text / light surface / brand accent
  / stronger border).
- **Test strategy:** this repo's row calls for Playwright (per the shared spec's per-repo table).
  Two pure-logic unit tests (`src/walkthrough/walkthrough.test.js`, run via the existing `npm test`
  — `vitest.config.js`'s `include` gained a second glob for `src/walkthrough/**/*.test.js`) cover
  `filterStepsForRole` and the `user_metadata` merge helper directly, since those are the two
  places a silent regression (a role leak, or a clobbered sibling-app flag) would be easy to miss
  in an end-to-end run and hard to assert precisely against a live Supabase project.
