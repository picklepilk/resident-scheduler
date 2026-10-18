// src/lib/handOverrides.js
// Hand overrides of program-tier scheduling rules (user decision 2026-10-18; see rulePolicy.js
// HAND_OVERRIDABLE_RULE_IDS). A chief may place a shift that breaks one of those rules, BY HAND,
// case by case, after a confirm step. The confirmed override is recorded on the block:
//
//   block.handOverrides = { [residentId]: { [dateStr]: { shiftId, ruleIds, note, at, by } } }
//
// and rides inside the block object like overrideLog/activityLog (no new res_* key). validateAll /
// cellViolations downgrade a covered violation from 'error' to a flagged 'warn' (`overridden: true`,
// never export-blocking). An entry only counts while the cell STILL holds the recorded shiftId, so
// a changed/cleared/regenerated cell silently stops being covered. The generator and solver never
// read this to break a rule — an overridden cell is just a non-empty (kept) cell to them.
//
// Pure, lib-legal: may not import ResidentScheduler.jsx.
import { RULE_POLICY, isHandOverridable } from './rulePolicy.js';

const isPlainObject = v => !!v && typeof v === 'object' && !Array.isArray(v);

function normalizeEntry(e) {
  if (!isPlainObject(e) || typeof e.shiftId !== 'string' || !e.shiftId) return null;
  const ruleIds = Array.isArray(e.ruleIds) ? [...new Set(e.ruleIds.filter(r => typeof r === 'string' && r))] : [];
  if (!ruleIds.length) return null;
  return {
    shiftId: e.shiftId,
    ruleIds,
    note: typeof e.note === 'string' && e.note.trim() ? e.note : null,
    at: typeof e.at === 'string' ? e.at : null,
    by: typeof e.by === 'string' && e.by ? e.by : null,
    measured: normalizeMeasured(e.measured, ruleIds),
  };
}

// {ruleId: number} for aggregate rules (run length / count at confirm time); junk dropped.
function normalizeMeasured(m, ruleIds) {
  const out = {};
  if (isPlainObject(m)) for (const [k, v] of Object.entries(m)) if (ruleIds.includes(k) && typeof v === 'number' && Number.isFinite(v)) out[k] = v;
  return out;
}

// Groups hand-overridable violations (cellViolations-style, optionally carrying `cell` and
// `measured`) into per-cell records: [{residentId, dateStr, ruleIds, measured}]. Violations without
// their own `cell` belong to `defaultCell`. This is what makes a swap record only the cell whose
// placement actually broke the rule.
export function handOverrideCells(violations, defaultCell = null) {
  const byKey = new Map();
  for (const v of violations || []) {
    if (!isHandOverridable(v.rule)) continue;
    const cell = v.cell || defaultCell;
    if (!cell) continue;
    const key = `${cell.residentId}__${cell.dateStr}`;
    const rec = byKey.get(key) || { residentId: cell.residentId, dateStr: cell.dateStr, ruleIds: [], measured: {} };
    if (!rec.ruleIds.includes(v.rule)) rec.ruleIds.push(v.rule);
    if (typeof v.measured === 'number') rec.measured[v.rule] = Math.max(rec.measured[v.rule] ?? -Infinity, v.measured);
    byKey.set(key, rec);
  }
  return [...byKey.values()];
}

// Untrusted shape (old snapshot, backup, cloud doc): returns a clean map or {}.
export function normalizeHandOverrides(raw) {
  const out = {};
  if (!isPlainObject(raw)) return out;
  for (const [rid, byDate] of Object.entries(raw)) {
    if (!isPlainObject(byDate)) continue;
    const row = {};
    for (const [ds, e] of Object.entries(byDate)) {
      const n = normalizeEntry(e);
      if (n) row[ds] = n;
    }
    if (Object.keys(row).length) out[rid] = row;
  }
  return out;
}

// The entry covering (residentId, dateStr) - only while the cell still holds entry.shiftId (and,
// when `shiftId` is passed, only if that matches too). Otherwise null.
export function getHandOverride(handOverrides, schedule, residentId, dateStr, shiftId) {
  const raw = isPlainObject(handOverrides) ? handOverrides[residentId]?.[dateStr] : null;
  const e = normalizeEntry(raw);
  if (!e) return null;
  const cur = schedule?.[residentId]?.[dateStr];
  if (cur !== e.shiftId) return null;
  if (shiftId !== undefined && shiftId !== e.shiftId) return null;
  return e;
}

// Drops every entry whose cell no longer holds its recorded shift.
export function pruneHandOverrides(handOverrides, schedule) {
  const out = {};
  for (const [rid, byDate] of Object.entries(normalizeHandOverrides(handOverrides))) {
    const row = {};
    for (const [ds, e] of Object.entries(byDate)) {
      if (schedule?.[rid]?.[ds] === e.shiftId) row[ds] = e;
    }
    if (Object.keys(row).length) out[rid] = row;
  }
  return out;
}

function changedCells(prevSchedule = {}, nextSchedule = {}) {
  const out = [];
  for (const rid of new Set([...Object.keys(prevSchedule || {}), ...Object.keys(nextSchedule || {})])) {
    const a = prevSchedule?.[rid] || {}, b = nextSchedule?.[rid] || {};
    for (const ds of new Set([...Object.keys(a), ...Object.keys(b)])) {
      if ((a[ds] || null) !== (b[ds] || null)) out.push({ residentId: rid, dateStr: ds, to: b[ds] || null });
    }
  }
  return out;
}

// Called from updateBlockTracked with the block before/after one tracked change. Returns `next`
// with handOverrides (a) pruned of stale entries - any path that changes or clears a cell lands
// here - and (b) extended with one entry per newly placed cell when `meta` (the confirmed
// {ruleIds, note} from a hand-edit surface) carries hand-overridable rule ids. Both happen in the
// SAME block update as the cell change, so one undo restores both. `next` is returned untouched
// when there is nothing to record and nothing stale (no key churn on ordinary edits).
export function syncHandOverrides(prev, next, meta, by = null, now = new Date().toISOString()) {
  const carried = next?.handOverrides !== undefined ? next.handOverrides : prev?.handOverrides;
  const had = isPlainObject(carried) && Object.keys(carried).length > 0;
  const ruleIds = Array.isArray(meta?.ruleIds) ? [...new Set(meta.ruleIds.filter(isHandOverridable))] : [];
  if (!had && !ruleIds.length) return next;
  const out = pruneHandOverrides(carried, next?.schedule);
  if (ruleIds.length) {
    const note = typeof meta.note === 'string' && meta.note.trim() ? meta.note.trim() : null;
    const changed = changedCells(prev?.schedule, next?.schedule).filter(c => c.to);
    // meta.cells (preferred): record ONLY the cells whose placement broke the rule. Without it
    // (legacy callers) every changed, placed cell gets the whole ruleIds list.
    const targets = Array.isArray(meta.cells)
      ? meta.cells.map(c => ({ ...c, ruleIds: (c.ruleIds || []).filter(isHandOverridable) })).filter(c => c.ruleIds.length)
      : changed.map(c => ({ residentId: c.residentId, dateStr: c.dateStr, ruleIds, measured: {} }));
    for (const t of targets) {
      const c = changed.find(x => x.residentId === t.residentId && x.dateStr === t.dateStr);
      if (!c) continue;
      (out[t.residentId] ||= {})[t.dateStr] = { shiftId: c.to, ruleIds: t.ruleIds, note, at: now, by, measured: normalizeMeasured(t.measured, t.ruleIds) };
    }
  }
  return { ...next, handOverrides: out };
}

const labelFor = id => RULE_POLICY[id]?.label || id;

function downgradeOne(v, entry) {
  if (v.level !== 'error' || !v.rule || !isHandOverridable(v.rule) || !entry.ruleIds.includes(v.rule)) return v;
  // Aggregate rules: the override covers the measured value confirmed (run length / count); a
  // worse value than that is a NEW violation and stays an error.
  const stored = entry.measured?.[v.rule];
  if (typeof stored === 'number' && typeof v.measured === 'number' && v.measured > stored) return v;
  return { ...v, level: 'warn', overridden: true, message: `Overridden: ${v.message}`, ...(entry.note ? { overrideNote: entry.note } : {}) };
}

// `violations` are cellViolations-style objects; `entry` is the getHandOverride() result for the cell.
export function applyHandOverrideToViolations(violations, entry) {
  if (!entry) return violations;
  return violations.map(v => downgradeOne(v, entry));
}

// validateAll post-pass. Issues carrying a dateStr are matched against that cell's entry; aggregate
// issues (dateStr null: night-run caps, BAMC Wednesday nights, JC/AY caps, Trauma/Peds split) are
// matched against ANY live entry of that resident that names the rule.
export function applyHandOverridesToIssues(issues, handOverrides, schedule) {
  const live = pruneHandOverrides(handOverrides, schedule);
  if (!Object.keys(live).length) return issues;
  return issues.map(i => {
    if (i.level !== 'error' || !i.rule || !i.residentId || !isHandOverridable(i.rule)) return i;
    const row = live[i.residentId];
    if (!row) return i;
    if (i.dateStr) return row[i.dateStr] ? downgradeOne(i, row[i.dateStr]) : i;
    for (const e of Object.values(row)) {
      const d = downgradeOne(i, e);
      if (d !== i) return d;
    }
    return i;
  });
}

// Flat, sorted list for the review panel count and the export-confirm summary.
export function listHandOverrides(handOverrides, schedule, residentsById = {}) {
  const out = [];
  for (const [rid, byDate] of Object.entries(pruneHandOverrides(handOverrides, schedule))) {
    const r = residentsById[rid];
    const name = r ? `${r.firstName} ${r.lastName}` : rid;
    for (const [dateStr, e] of Object.entries(byDate)) {
      out.push({ residentId: rid, name, dateStr, shiftId: e.shiftId, ruleIds: e.ruleIds, ruleLabels: e.ruleIds.map(labelFor), note: e.note, at: e.at, by: e.by });
    }
  }
  return out.sort((a, b) => a.dateStr.localeCompare(b.dateStr) || a.name.localeCompare(b.name));
}

// Cell-badge tooltip: rule labels + note + who/when.
export function overrideTooltip(entry) {
  if (!entry) return '';
  const parts = [`Hand override: ${entry.ruleIds.map(labelFor).join('; ')}`];
  if (entry.note) parts.push(`Note: ${entry.note}`);
  const who = [entry.by, entry.at ? new Date(entry.at).toLocaleString() : null].filter(Boolean).join(' · ');
  if (who) parts.push(who);
  return parts.join('\n');
}

// Solver compatibility. The CP-SAT payload hard-pins every non-empty cell (`locked[]`), so an
// overridden cell that breaks a rule the solver enforces as a CONSTRAINT (night-run cap, BAMC
// Wednesday nights, Trauma/Peds split, JC cap, jeopardy window, ...) would make the model
// INFEASIBLE. Only overrides of pure eligibility guards are safe: locked cells get a decision
// variable even when absent from `eligible` (solver/model/variables.py), and no constraint reads
// the guard. buildSolverPayload throws when any live override is NOT in this set and the generate
// path falls back to the built-in engine (which keeps the cell via keptCells).
const SOLVER_SAFE_OVERRIDE_RULE_IDS = new Set(['traumaDayRotationGuard']);

// A trauma-cap subject (EM Home PGY-2/3) with a locked TRAUMA-D could bind the solver's caps.trauma
// count, so only non-subjects (e.g. PGY-1) are safe. Unknown resident = unsafe.
export function solverUnsafeHandOverrides(handOverrides, schedule, residentsById = {}, isTraumaCapSubject = () => true) {
  return listHandOverrides(handOverrides, schedule).filter(o => {
    if (o.ruleIds.some(r => !SOLVER_SAFE_OVERRIDE_RULE_IDS.has(r))) return true;
    const r = residentsById[o.residentId];
    return !r || isTraumaCapSubject(r);
  });
}
