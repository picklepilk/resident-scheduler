// Pure UI-prefs shape helpers — no React, no ResidentScheduler.jsx import (lib module rule, see
// CLAUDE.md). Kept separate from src/uiPrefs.js (the React hook/Context wrapper that actually
// reads/writes localStorage and Supabase) purely so this normalization logic sits under
// src/lib/**/*.test.js, matching every other pure-logic module's test convention.
// showUnscheduled: Schedule tab's "hide off-rotation residents with no shifts" toggle (see
// CLAUDE.md Phase 8) — default OFF (hidden), same device/viewer-preference posture as
// tabOverflow/cardOpen above.
export const DEFAULT_UI_PREFS = { tabOverflow: [], cardOpen: {}, showUnscheduled: false };

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
  return { tabOverflow, cardOpen, showUnscheduled };
}
