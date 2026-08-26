// Pure UI-prefs shape helpers — no React, no ResidentScheduler.jsx import (lib module rule, see
// CLAUDE.md). Kept separate from src/uiPrefs.js (the React hook/Context wrapper that actually
// reads/writes localStorage and Supabase) purely so this normalization logic sits under
// src/lib/**/*.test.js, matching every other pure-logic module's test convention.
// showUnscheduled: Schedule tab's "hide off-rotation residents with no shifts" toggle (see
// CLAUDE.md Phase 8) — default OFF (hidden), same device/viewer-preference posture as
// tabOverflow/cardOpen above.
// gridZoom (percent) / gridColExtra (px added to each date column): Schedule-grid readability
// controls. Same posture again — how big someone wants the grid on THEIR screen is a display
// preference, not chief scheduling data, so it never rides LS_BACKUP_KEYS or the res_state sync.
// Persisted rather than left as component state on purpose: the sibling em-scheduler app ships a
// "default matrix zoom" setting its matrix never reads, so the value silently resets on every
// mount — one source of truth here instead.
export const GRID_ZOOM_MIN = 50;
export const GRID_ZOOM_MAX = 150;
export const GRID_ZOOM_DEFAULT = 100;
export const GRID_COL_EXTRA_MAX = 120;
// gridGroupBy: which axis the Schedule tab banners rows by — see lib/scheduleGrouping.js. Same
// device/viewer-preference posture as everything else here (how one person likes to read the grid
// on their own screen is not chief scheduling data), so it rides res_ui_prefs and never
// LS_BACKUP_KEYS. Re-exported from the grouping module rather than restated, so the allowed values
// and the code that acts on them can't drift apart.
export { GRID_GROUP_MODES, GRID_GROUP_MODE_DEFAULT } from './scheduleGrouping.js';
import { GRID_GROUP_MODES as GROUP_MODES, GRID_GROUP_MODE_DEFAULT as GROUP_MODE_DEFAULT } from './scheduleGrouping.js';

export const DEFAULT_UI_PREFS = {
  tabOverflow: [], cardOpen: {}, showUnscheduled: false,
  gridZoom: GRID_ZOOM_DEFAULT, gridColExtra: 0,
  gridGroupBy: GROUP_MODE_DEFAULT,
};

// Clamps to the same bounds every writer uses. A persisted value outside them (hand-edited
// localStorage, a bound changed in a later build) is pulled back in range rather than dropped, so
// an out-of-range zoom can never render the grid at an unusable size with no way back.
// Deliberately typeof-checked rather than Number()-coerced: Number(true) is 1 and Number([]) is 0,
// so a coercing clamp would silently turn junk into a REAL (minimum) zoom instead of the default,
// leaving the grid at 50% with nothing to explain why.
export function clampGridZoom(v) {
  if (typeof v !== 'number' || !Number.isFinite(v)) return GRID_ZOOM_DEFAULT;
  return Math.min(GRID_ZOOM_MAX, Math.max(GRID_ZOOM_MIN, Math.round(v)));
}

export function clampGridColExtra(v) {
  if (typeof v !== 'number' || !Number.isFinite(v)) return 0;
  return Math.min(GRID_COL_EXTRA_MAX, Math.max(0, Math.round(v)));
}

// Guards against an untrusted shape (hand-edited localStorage, a stale/foreign `profiles.ui_prefs`
// row from a future build) — same discipline as `reconcileTabOrder`/`normalizeCoverageEntry`
// elsewhere in this app: never trust a persisted value's shape without checking it first.
export function normalizeUiPrefs(raw) {
  const tabOverflow = Array.isArray(raw?.tabOverflow)
    ? raw.tabOverflow.filter(id => typeof id === 'string')
    : [];
  const cardOpen = {};
  if (raw?.cardOpen && typeof raw.cardOpen === 'object' && !Array.isArray(raw.cardOpen)) {
    for (const [k, v] of Object.entries(raw.cardOpen)) {
      if (typeof v === 'boolean') cardOpen[k] = v;
    }
  }
  const showUnscheduled = typeof raw?.showUnscheduled === 'boolean' ? raw.showUnscheduled : false;
  const gridZoom = raw?.gridZoom == null ? GRID_ZOOM_DEFAULT : clampGridZoom(raw.gridZoom);
  const gridColExtra = raw?.gridColExtra == null ? 0 : clampGridColExtra(raw.gridColExtra);
  // Membership test rather than a numeric clamp, but the same refusal to coerce: an unknown string
  // (a mode removed in a later build, a hand-edited value) falls back to the default instead of
  // being passed through to render an empty grid.
  const gridGroupBy = GROUP_MODES.includes(raw?.gridGroupBy) ? raw.gridGroupBy : GROUP_MODE_DEFAULT;
  return { tabOverflow, cardOpen, showUnscheduled, gridZoom, gridColExtra, gridGroupBy };
}
