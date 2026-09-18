/**
 * Content for the first-login walkthrough (see docs/WALKTHROUGH.md for the
 * copy in one place, reviewed alongside the welcome text).
 *
 * @typedef {Object} WalkthroughStep
 * @property {string} title
 * @property {string} headline - one sentence, what this step's target does
 * @property {string[]} bullets - 2-3 items; at least one is a concrete example
 * @property {string} [target] - data-tour key of the element to spotlight; omit for a page-level step
 * @property {string} [route] - tab id to switch to on step entry
 * @property {string[]} [roles] - omit = every role sees the step; else only these roles do
 */

// Shared with sibling apps' `auth.users` (ems-inventory, Fellow-Eval, EMS-Rotation-Resident all
// live on the same Supabase project) — this key namespaces this app's flag inside the shared
// `user_metadata.walkthrough_seen` object. Never write that object wholesale; always merge (see
// useWalkthroughSeen.js).
export const APP_KEY = 'resident-scheduler';

/**
 * In the current app, only an admin (profiles.role === 'admin') ever reaches the shell this
 * walkthrough mounts in — AppGate routes every other role to a separate, simpler request-only
 * view that never imports ResidentScheduler.jsx (see AppGate.jsx). Steps below are still tagged
 * `roles: ['admin']` for the tabs that are admin-config surfaces (matches the per-repo spec's
 * "Admin-only tabs" guidance and keeps `filterStepsForRole` meaningful if a future resident-
 * facing view of this shell is ever built) — see docs/WALKTHROUGH.md "Decisions".
 *
 * @type {WalkthroughStep[]}
 */
export const WALKTHROUGH_STEPS = [
  {
    title: 'Dashboard — your command center',
    headline: "Dashboard is where you build and archive each month's block, one step at a time.",
    bullets: [
      'The Block Calendar shows every saved block for an academic year with a coverage heatmap.',
      'Current Block is your active workspace — name, dates, and special days live here.',
      'e.g. set the block name and start date, then Save Block to archive it.',
    ],
    target: 'tab-dashboard',
    route: 'dashboard',
  },
  {
    title: 'EM Residents — the roster',
    headline: "Add residents once a year and set each one's rotation per block.",
    bullets: [
      'Import Roster pastes or uploads a spreadsheet instead of adding residents one at a time.',
      "Vacation dates, approved days off, and jeopardy call dates all live on each resident's tile.",
      'e.g. paste a roster row like "Smith, Jane — EM — PGY-2" straight from a spreadsheet.',
    ],
    target: 'tab-em',
    route: 'em',
    roles: ['admin'],
  },
  {
    title: 'Shift Matrix — who can work what',
    headline: 'The matrix defines which shift types each residency and PGY year is eligible for.',
    bullets: [
      'Click any cell to toggle; modified rows show a pencil icon and a per-row reset.',
      'e.g. expand a row to set a per-rotation override — an EMS month can have a different shift list than a standard EM month.',
    ],
    target: 'tab-matrix',
    route: 'matrix',
    roles: ['admin'],
  },
  {
    title: 'Schedule — the grid',
    headline: 'Generate fills every open slot automatically, respecting eligibility and rest rules.',
    bullets: [
      'Click any cell to assign or adjust a shift by hand — the picker only offers legal options.',
      'e.g. Generate Schedule fills the whole block in one click; Trauma Day is filled last so it never crowds out other coverage.',
    ],
    target: 'tab-schedule',
    route: 'schedule',
  },
  {
    title: 'Scheduling Rules — coverage targets',
    headline: 'Set how many residents each shift needs per day before you generate.',
    bullets: [
      'e.g. POD Day needs 2 on weekdays, 3 on Monday/Tuesday — coverage is a min/max, not one number.',
      'Day-of-week rules like Grand Rounds Wednesday and EMS Mon/Tue live here too.',
    ],
    target: 'tab-rules',
    route: 'rules',
    roles: ['admin'],
  },
  {
    title: 'Violations — the generation report',
    headline: 'Every coverage gap and rule conflict from the last generate lands here.',
    bullets: [
      'e.g. an unfilled Trauma Night slot shows why — no eligible resident, or everyone rest-blocked.',
      'Clear this list before exporting — QGenda export warns on any unresolved issue.',
    ],
    target: 'tab-validation',
    route: 'validation',
    roles: ['admin'],
  },
  {
    title: 'Jeopardy — backup call',
    headline: 'Track who is on backup call and see any day nobody is covering it.',
    bullets: [
      'Jeopardy never overlaps a clinical shift — the app blocks that combination automatically.',
      'e.g. Auto-fill assigns PGY-1/2/3 jeopardy tracks from whoever is on an EM Home rotation that block.',
    ],
    target: 'tab-jeopardy',
    route: 'jeopardy',
  },
  {
    title: 'Requests — resident day-off requests',
    headline: 'Residents submit their own day-off requests here; you approve or decline.',
    bullets: [
      'e.g. approve a request and it becomes an orange OFF marker on the Schedule grid automatically.',
      "A note you add when deciding shows on that resident's PDF export.",
    ],
    target: 'tab-requests',
    route: 'requests',
  },
  {
    title: 'Settings — backup and export config',
    headline: 'Back up your data, restore from a backup, and tune how exports look.',
    bullets: [
      "e.g. QGenda Task Names lets you override a shift's exported task label per resident.",
      'JSON backup/restore covers the roster, blocks, rules, and coverage in one file.',
    ],
    target: 'tab-settings',
    route: 'settings',
    roles: ['admin'],
  },
];

/**
 * Round 2: residents are this app's actual majority of users, and until now they got nothing —
 * `/requests` (ResidentRequestsApp.jsx) mounts none of the above; it's a single-flow page (no
 * tabs, no `route`s to switch), so these steps omit `route` entirely and never carry `roles`
 * (nothing else reaches this surface — a linked admin visiting `/requests` gets the identical
 * self-service form, see AppGate.jsx/ResidentRequestsApp.jsx's own comments). Reuses the SAME
 * `APP_KEY` and seen-flag as the admin steps above, per product decision — a resident and an
 * admin never share one physical account in practice, so the shared flag has no real double-count
 * case today.
 *
 * @type {WalkthroughStep[]}
 */
export const RESIDENT_WALKTHROUGH_STEPS = [
  {
    title: 'Request a day off',
    headline: 'Pick any date you want off and it goes straight to the chief for a decision.',
    bullets: [
      'Use the date field to add a single day, or one row per day for a stretch.',
      'e.g. click the date field and pick Oct 12 for a single day off.',
    ],
    target: 'resident-date-field',
  },
  {
    title: 'Requesting more than one date',
    headline: '"+ Add another date" adds a new row — each date is its own line in the request.',
    bullets: [
      "There's no limit on how many dates one request can cover.",
      'e.g. requesting a long weekend? Add Oct 12, Oct 13, and Oct 14 as three separate rows.',
    ],
    target: 'resident-add-date',
  },
  {
    title: 'Reason (optional)',
    headline: "A short reason is optional, but it's the only context the chief sees when deciding.",
    bullets: [
      'Nothing here is required — an empty reason is a perfectly normal request.',
      'e.g. type "sister\'s wedding" so the chief has context without you having to explain in person.',
    ],
    target: 'resident-reason',
  },
  {
    title: 'Submit request',
    headline: 'Submitting sends the request immediately — there is no draft or save-for-later.',
    bullets: [
      'A request within 8 weeks of that block still submits — you just get a heads-up that the chief has less flexibility.',
      'e.g. a date that falls on a tracked holiday shows a note too; it still submits the same way.',
    ],
    target: 'resident-submit',
  },
  {
    title: 'Track your requests',
    headline: 'Every request you\'ve submitted lists below, grouped by which block it falls in.',
    bullets: [
      'Status shows as pending (amber), approved (green), or denied (red) as the chief decides.',
      'e.g. click the × next to a still-pending request to withdraw it yourself before a decision is made.',
    ],
    target: 'resident-request-list',
  },
];

/**
 * Pure. Keeps a step when it carries no `roles` list (everyone sees it), or when `role` is in
 * that list. `role` defaults to 'admin' by every caller here — see the module doc above for why
 * that's the only role that currently reaches this shell.
 */
export function filterStepsForRole(steps, role) {
  return steps.filter(s => !s.roles || s.roles.includes(role));
}
