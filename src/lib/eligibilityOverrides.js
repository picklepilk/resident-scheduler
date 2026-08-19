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

// A shift id can also be RENAMED/SPLIT outright (not just gain a new sibling id) -- e.g. PED-N was
// split so FM-3's grant becomes PED-N-FM while PED-N itself goes EM-Home-only. Unlike the 12h
// backfill above (which only ever ADDS an id the old snapshot couldn't have known about), a rename
// must also DROP the old id(s): if the stored override still names PED-N/PED-N12 against the new
// base, those ids simply don't match anything anymore and go inert -- silently, with no error --
// which for a `removed` entry means the chief's revocation is lost and the resident REGAINS a grant
// they explicitly took away. That's the same class of silent outage the diff format itself exists to
// prevent (see file header), just triggered by a rename instead of a new id.
//
// This list is scoped by BASE membership (`to` granted, `from` not), not by CATEGORY_PGY key, and
// that's deliberate: `LEGACY_ELIGIBILITY_DEFAULTS` is keyed by CATEGORY_PGY and can never reach a
// CATEGORY_PGY__ROTATION override written by the Shift Matrix's per-rotation sub-rows. That exact
// blind spot is what caused the real ACEP outage documented in the file header -- a rotation-level
// override predated the 12h ids and had no key any category-keyed migration could match. A
// base-driven rule has no such blind spot: it reaches rotation-key overrides for free, because it
// only ever looks at the resolved shift list being normalized, never at which key it came from.
const LEGACY_SHIFT_ID_RENAMES = [
  { from: 'PED-N', to: 'PED-N-FM', alsoDrop: ['PED-N12'] },
];

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

// Legacy-array counterpart of renameDiffShiftIds below. For each rename rule: the scope guard
// (`base` must grant `to` and must NOT grant `from`) skips rules that don't apply to this base at
// all, AND guards against a future base that legitimately grants both ids at once (nothing to
// rename in that case -- both names are live). When the list still names the old id, drop it plus
// any `alsoDrop` id that the CURRENT base doesn't grant directly (an alsoDrop id the base still
// grants on its own, independent of the rename, must survive), then append the new id if the list
// doesn't already have it. Returns `list` unchanged (same reference) when no rule applies, matching
// backfillLaterAddedShiftIds's convention. Guards non-array inputs the same way.
export function applyLegacyShiftIdRenames(list, base) {
  if (!Array.isArray(list) || !Array.isArray(base)) return list;
  let out = list;
  let changed = false;
  for (const rule of LEGACY_SHIFT_ID_RENAMES) {
    if (!base.includes(rule.to) || base.includes(rule.from)) continue;
    if (!out.includes(rule.from)) continue;
    const dropIds = new Set([rule.from, ...(rule.alsoDrop || []).filter(id => !base.includes(id))]);
    const next = out.filter(id => !dropIds.has(id));
    if (!next.includes(rule.to)) next.push(rule.to);
    out = next;
    changed = true;
  }
  return changed ? out : list;
}

// Diff counterpart of applyLegacyShiftIdRenames -- this is the one that matters in practice, since
// the array->diff migration already shipped and ran, so every stored override is already a diff.
// A diff written against the OLD base still names the old id in `added`/`removed`; against the new
// base neither entry matches anything, so it goes inert. For `removed` that's not a no-op, it's a
// silent regression: a chief who explicitly revoked FM-3's peds night (`removed: ['PED-N','PED-N12']`)
// would see FM-3 silently REGAIN that grant, because nothing in the new base is named 'PED-N' or
// 'PED-N12' anymore for the diff to subtract. Applies the same per-rule scope guard as the array
// version, and drops/renames within EACH of `added` and `removed` independently, so a diff that
// only touched one side is only rewritten on that side. Returns `diff` unchanged (same reference)
// when nothing applies.
export function renameDiffShiftIds(diff, base) {
  if (!diff || !Array.isArray(base)) return diff;
  const addedIn = Array.isArray(diff.added) ? diff.added : [];
  const removedIn = Array.isArray(diff.removed) ? diff.removed : [];
  let added = addedIn;
  let removed = removedIn;
  for (const rule of LEGACY_SHIFT_ID_RENAMES) {
    if (!base.includes(rule.to) || base.includes(rule.from)) continue;
    const dropIds = new Set([rule.from, ...(rule.alsoDrop || []).filter(id => !base.includes(id))]);
    const rename = arr => {
      if (!arr.includes(rule.from)) return arr;
      const next = arr.filter(id => !dropIds.has(id));
      if (!next.includes(rule.to)) next.push(rule.to);
      return next;
    };
    added = rename(added);
    removed = rename(removed);
  }
  return (added === addedIn && removed === removedIn) ? diff : { added, removed };
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
    return renameDiffShiftIds({ added: cleanIds(value.added), removed: cleanIds(value.removed) }, base);
  }
  if (Array.isArray(value)) {
    // Legacy snapshot. Rename FIRST (an old id must stop meaning what it used to before backfill
    // runs), then backfill so later-added ids aren't misread as deliberate removals, then diff.
    const renamed = applyLegacyShiftIdRenames(cleanIds(value), base);
    return eligibilityDiff(backfillLaterAddedShiftIds(renamed, base), base);
  }
  return null;
}

// Convenience: stored value (either shape) → the effective shift list.
export function resolveEligibilityList(value, base) {
  const diff = normalizeEligibilityOverride(value, base);
  return diff ? applyEligibilityDiff(base, diff) : [...cleanIds(base)];
}
