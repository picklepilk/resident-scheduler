// src/lib/eligibilityOverrides.js
// Chief-saved shift-eligibility overrides, stored as a DIFF against the current defaults rather
// than as a wholesale snapshot of the shift list.
//
// Why: a snapshot can never learn about a shift id added after it was saved. That shipped as a
// real outage — the chief's saved overrides predated the 12h conference shifts, so during ACEP the
// 9h POD/MT/FLEX shifts were correctly suppressed and the 12h replacements could not be assigned,
// leaving residents unscheduled with no error anywhere. A diff has no such blind spot: anything
// added to BASE_ELIGIBILITY later flows through automatically unless the chief explicitly removed
// that exact id.
//
// Shape: { added: string[], removed: string[] }. Both shapes are accepted at READ time forever —
// a JSON backup, a cloud row written by an older build, or another device mid-upgrade can all still
// hand us the legacy array. normalizeEligibilityOverride() is the single door they come through.
//
// No React, no imports from ResidentScheduler.jsx (that would be circular) — the caller passes the
// base list in, which also lets rotation overrides diff against their parent's effective list.

// The 12h ids are derived variants of an existing 9h shift in the same area. Converting a legacy
// snapshot has to know that, or every pre-12h override would convert to "the chief deliberately
// removed all eight 12h shifts" and the outage would be baked in permanently rather than fixed.
const TWELVE_H_SUFFIX = { D12: 'D', N12: 'N' };

// Adds a base shift id that a legacy snapshot could not have known about: a 12h id is restored only
// when the snapshot still lists that area's matching 9h shift (POD-D for POD-D12, POD-N for
// POD-N12), so an area the chief genuinely dropped stays dropped. Returns `list` unchanged when
// there is nothing to add.
export function backfillLaterAddedShiftIds(list, base) {
  if (!Array.isArray(list) || !Array.isArray(base)) return list;
  const have = new Set(list);
  const add = [];
  for (const sid of base) {
    if (have.has(sid)) continue;
    const m = /^(.+)-(D12|N12)$/.exec(sid);
    if (!m) continue;
    if (have.has(`${m[1]}-${TWELVE_H_SUFFIX[m[2]]}`)) add.push(sid);
  }
  return add.length ? [...list, ...add] : list;
}

export function isEligibilityDiff(v) {
  return !!v && typeof v === 'object' && !Array.isArray(v) && (Array.isArray(v.added) || Array.isArray(v.removed));
}

const cleanIds = v => (Array.isArray(v) ? v.filter(x => typeof x === 'string' && x) : []);

// Plain diff of an explicit list against a base — no backfill. Used when the UI already holds the
// exact list the chief wants (a checkbox toggle), where "missing from the list" genuinely means
// "removed".
export function eligibilityDiff(list, base) {
  const want = new Set(cleanIds(list));
  const have = new Set(cleanIds(base));
  return {
    added: [...want].filter(id => !have.has(id)).sort(),
    removed: [...have].filter(id => !want.has(id)).sort(),
  };
}

export function isEligibilityDiffEmpty(diff) {
  return !diff || (cleanIds(diff.added).length === 0 && cleanIds(diff.removed).length === 0);
}

// base minus removed plus added. Base order is preserved (it drives the Shift Matrix column order);
// explicitly-added ids that aren't in the base are appended in their own order.
export function applyEligibilityDiff(base, diff) {
  const list = cleanIds(base);
  if (isEligibilityDiffEmpty(diff)) return [...list];
  const removed = new Set(cleanIds(diff.removed));
  const added = cleanIds(diff.added);
  const out = list.filter(id => !removed.has(id));
  const have = new Set(out);
  for (const id of added) if (!have.has(id)) { out.push(id); have.add(id); }
  return out;
}

// The single door every stored override comes through, whichever shape it is in. Returns a diff, or
// null when there is no override at all. Untrusted input (backup file, cloud row, hand-edited
// localStorage) — anything unrecognizable is treated as "no override" rather than throwing.
export function normalizeEligibilityOverride(value, base) {
  if (value == null) return null;
  if (isEligibilityDiff(value)) {
    return { added: cleanIds(value.added), removed: cleanIds(value.removed) };
  }
  if (Array.isArray(value)) {
    // Legacy snapshot. Backfill FIRST so later-added ids aren't misread as deliberate removals.
    return eligibilityDiff(backfillLaterAddedShiftIds(cleanIds(value), base), base);
  }
  return null;
}

// Convenience: stored value (either shape) → the effective shift list.
export function resolveEligibilityList(value, base) {
  const diff = normalizeEligibilityOverride(value, base);
  return diff ? applyEligibilityDiff(base, diff) : [...cleanIds(base)];
}
