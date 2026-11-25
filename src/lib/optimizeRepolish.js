// Pure helpers for "hand edits made while Optimize runs are kept". No React, never imports ResidentScheduler.jsx.
// Schedule maps are { residentId: { 'YYYY-MM-DD': shiftId | falsy } }; shapes may be odd (untrusted data).

export const REPOLISH_SECONDS = 60;
export const REPOLISH_CONFLICT_TOAST = 'Your edits conflict with the optimized schedule. Run Optimize again.';

const isFilled = v => v !== undefined && v !== null && v !== '' && v !== false;
const rowOf = (sched, rid) => {
  const row = sched && typeof sched === 'object' ? sched[rid] : null;
  return row && typeof row === 'object' ? row : null;
};
const valueAt = (sched, rid, date) => { const v = rowOf(sched, rid)?.[date]; return isFilled(v) ? v : ''; };

// Resident-days whose value differs between the two grids (empty and missing count as the same). -> [[rid, date], ...] sorted
export function changedResidentDays(startSchedule, currentSchedule) {
  const out = [];
  const rids = new Set([
    ...(startSchedule && typeof startSchedule === 'object' ? Object.keys(startSchedule) : []),
    ...(currentSchedule && typeof currentSchedule === 'object' ? Object.keys(currentSchedule) : []),
  ]);
  for (const rid of rids) {
    const dates = new Set([...Object.keys(rowOf(startSchedule, rid) || {}), ...Object.keys(rowOf(currentSchedule, rid) || {})]);
    for (const date of dates) if (valueAt(startSchedule, rid, date) !== valueAt(currentSchedule, rid, date)) out.push([rid, date]);
  }
  out.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0));
  return out;
}

// The solver's grid with the chief's CURRENT value on every changed resident-day (a cleared cell stays empty). Inputs untouched.
export function mergeEditsIntoResult(resultSchedule, currentSchedule, changed) {
  const merged = {};
  if (resultSchedule && typeof resultSchedule === 'object') {
    for (const rid of Object.keys(resultSchedule)) merged[rid] = { ...(rowOf(resultSchedule, rid) || {}) };
  }
  for (const pair of Array.isArray(changed) ? changed : []) {
    if (!Array.isArray(pair)) continue;
    const [rid, date] = pair;
    const v = valueAt(currentSchedule, rid, date);
    if (v) (merged[rid] = merged[rid] || {})[date] = v;
    else if (merged[rid]) delete merged[rid][date];
  }
  return merged;
}

// True when every changed resident-day in the result still equals the chief's current value.
export function editsPreserved(resultSchedule, currentSchedule, changed) {
  for (const pair of Array.isArray(changed) ? changed : []) {
    if (!Array.isArray(pair)) return false;
    const [rid, date] = pair;
    if (valueAt(resultSchedule, rid, date) !== valueAt(currentSchedule, rid, date)) return false;
  }
  return true;
}

// Solver config.scope that keeps the chief's resident-days fixed (solver-service/docs/PAYLOAD_SCHEMA.md, "Round 2 options").
export function repolishScope(changed) {
  const keepCells = (Array.isArray(changed) ? changed : []).filter(p => Array.isArray(p) && p.length >= 2).map(p => [p[0], p[1]]);
  return { keepCells };
}

const plural = (n, one, many) => (n === 1 ? one : many);
export function editsNoticeText(n) {
  if (!(n > 0)) return null;
  return `You changed ${n} ${plural(n, 'cell', 'cells')}. Optimize will keep ${plural(n, 'it', 'them')} and re-polish around ${plural(n, 'it', 'them')} when it finishes (about 1 minute).`;
}
export function repolishLabel(n) {
  return `Re-polishing around your ${n} ${plural(n, 'edit', 'edits')}, about 1 minute.`;
}
