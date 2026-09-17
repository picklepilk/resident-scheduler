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
 * Pure. Keeps a step when it carries no `roles` list (everyone sees it), or when `role` is in
 * that list. `role` defaults to 'admin' by every caller here — see the module doc above for why
 * that's the only role that currently reaches this shell.
 */
export function filterStepsForRole(steps, role) {
  return steps.filter(s => !s.roles || s.roles.includes(role));
}
