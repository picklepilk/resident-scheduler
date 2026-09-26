# First-login walkthrough

Content for the guided tour that appears on first login. Edit this file for copy changes — it's
the single source the module (`src/walkthrough/`) is meant to be checked against before merge.

## Welcome modal

Shown once, the first time a viewer lands on either surface after the auth gate passes — the
admin app at `/` (`ResidentScheduler`) and the resident-facing `/requests` page
(`ResidentRequestsApp`) share the same wording, the same welcome component, and the same
seen-flag (see `useWalkthroughSeen` for the mechanics, and "Resident walkthrough" below for why
one flag covers both). Any dismiss — Start walkthrough, Skip, the X, or clicking the backdrop —
marks it seen; it never re-prompts.

**Title:** EM Residency Scheduler

**Body (two lines):**
1. Build and validate each month's resident schedule — rotations, coverage rules, jeopardy, and
   day-off requests all live here, then export straight to QGenda.
2. A short guided tour points out where each of those lives before you dive in.

**Buttons:** Start walkthrough · Skip

## Admin walkthrough steps (`/`)

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

## Resident walkthrough (`/requests`)

Round 2: residents are this app's actual majority of users and, until now, `ResidentRequestsApp`
mounted none of the walkthrough module — this closes that gap. Reuses `src/walkthrough/` verbatim
(same `Walkthrough`/`WalkthroughWelcome`/`WalkthroughRoot`/spotlight/geometry code as the admin
surface above) with its own step list (`RESIDENT_WALKTHROUGH_STEPS`, `src/walkthrough/walkthroughSteps.js`)
and the **same `APP_KEY`/seen-flag** (`walkthrough_seen['resident-scheduler']`) as the admin
steps — a product decision from review, not an oversight: a resident and an admin don't share one
physical login in practice, so one flag covering both surfaces has no real double-count case
today. See "Decisions" for the one edge case (a linked admin visiting both `/` and `/requests`).

5 steps, single flow — no `roles`, no `route` (this page has no tabs to switch between; each
step's target is a real form field or list, already on screen). Mounted once `RequestForm` +
`RequestList` render — i.e. after the auth gate passes AND past `PendingApproval`/the
admin-account block AND past `ResidentPicker` (an account not yet linked to a roster resident
never reaches the form the walkthrough narrates).

| # | Title | Target |
|---|---|---|
| 1 | Request a day off | `resident-date-field` |
| 2 | Requesting more than one date | `resident-add-date` |
| 3 | Reason (optional) | `resident-reason` |
| 4 | Submit request | `resident-submit` |
| 5 | Track your requests | `resident-request-list` |

### 1. Request a day off
- **Headline:** Pick any date you want off and it goes straight to the chief for a decision.
- **Bullets:**
  - Use the date field to add a single day, or one row per day for a stretch.
  - e.g. click the date field and pick Oct 12 for a single day off.
- **Target:** `resident-date-field`

### 2. Requesting more than one date
- **Headline:** "+ Add another date" adds a new row — each date is its own line in the request.
- **Bullets:**
  - There's no limit on how many dates one request can cover.
  - e.g. requesting a long weekend? Add Oct 12, Oct 13, and Oct 14 as three separate rows.
- **Target:** `resident-add-date`

### 3. Reason (optional)
- **Headline:** A short reason is optional, but it's the only context the chief sees when deciding.
- **Bullets:**
  - Nothing here is required — an empty reason is a perfectly normal request.
  - e.g. type "sister's wedding" so the chief has context without you having to explain in person.
- **Target:** `resident-reason`

### 4. Submit request
- **Headline:** Submitting sends the request immediately — there is no draft or save-for-later.
- **Bullets:**
  - A request within 8 weeks of that block still submits — you just get a heads-up that the chief
    has less flexibility.
  - e.g. a date that falls on a tracked holiday shows a note too; it still submits the same way.
- **Target:** `resident-submit`

### 5. Track your requests
- **Headline:** Every request you've submitted lists below, grouped by which block it falls in.
- **Bullets:**
  - Status shows as pending (amber), approved (green), or denied (red) as the chief decides.
  - e.g. click the × next to a still-pending request to withdraw it yourself before a decision is
    made.
- **Target:** `resident-request-list`

## Replay

- **Admin (`/`):** User Guide tab → "Getting Started" section → "Replay walkthrough" button.
- **Resident (`/requests`):** a small "Getting Started" line at the bottom of the page (below the
  request list, deliberately unobtrusive — no card, no border box) → "Replay walkthrough".

Both start at step 0 regardless of the seen-flag.

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

### Round 2 (resident walkthrough)

- **`WalkthroughRoot` generalized, not forked:** added an optional `steps` prop (default
  `WALKTHROUGH_STEPS`, the admin list) and made `setActiveTab` default to a no-op, so
  `ResidentScheduler.jsx`'s existing call site needed zero changes — "keep the admin-side steps as
  they are" held literally, not just in content.
- **Shared seen-flag, one known edge case:** an admin account that's ALSO linked to a resident
  (`profile.role === 'admin' && profile.resident_id` — the fallthrough case in both
  `AppGate.jsx` and `ResidentRequestsApp.jsx`'s own comments) would see only one combined welcome
  across `/` and `/requests`, whichever they open first, since both read/write the same
  `walkthrough_seen['resident-scheduler']` key. Per the coordinator's explicit instruction to reuse
  the same `APP_KEY`/flag — not overridden here.
- **`(a)` tab-overflow / Replay target — confirmed not an issue:** the admin "Getting Started"
  section lives inside `UserGuideTab`'s own panel content (the `<main>` area), not in the sidebar
  tab strip `SidebarNav` renders — `res_ui_prefs.tabOverflow`'s "Other" grouping only reorders/
  hides tab-strip buttons, never panel content. The User Guide tab button itself could move into
  "Other," but the Replay button inside its panel is unaffected either way.
- **`(b)`/`(c)`:** left as-is per the coordinator's ruling (inert admin role tags kept; the
  unconditional `createPortal` in `Walkthrough.jsx` kept as-is).
- **Resident unit tests are pure-logic, not component-rendered:** mirrors the admin tests'
  approach (no `@testing-library/react`/jsdom-render harness exists in this repo — `CLAUDE.md`
  is explicit that UI/tabs here have no render-level tests, and `package.json` carries no RTL
  dependency). "Welcome shows/hides" and "replay opens step 0" are instead covered by the
  Playwright pass against `/requests` below, the same division of labor round 1 used for the
  admin surface (pure logic → vitest, real DOM interaction → Playwright).
