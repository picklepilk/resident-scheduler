// src/lib/expectedFiller.js
// Pure "who's expected to fill this slot" inversion for the Coverage board's day-floor empty-slot
// panel (docs/superpowers/plans/2026-10-15-coverage-board.md, build step 3). Given a shift/date and
// the full roster, groups the residents who are effectively eligible for that shift into labeled
// chips (bucketed by category+PGY), counts how many of them are actually free that date, and names
// the HARD composition/ownership rule governing the slot, if any.
//
// SENIOR_COMPOSITION / compositionSatisfies / seniorCompositionExempt / PED_GUARD_LEGITIMATE_OWNER /
// BASE_ELIGIBILITY all live in ResidentScheduler.jsx and lib/* may never import that file (CLAUDE.md)
// — so every one of those rule tables arrives here already resolved by the caller, via
// `seniorityRules`. SHIFT_MAP (area/type per shift id) is the one table this file pulls directly,
// since lib/shifts.js is itself a pure lib module (same pattern lib/coverage.js already uses).
//
// See the ADAPTER comment at the bottom of this file for exactly what ResidentScheduler.jsx should
// build and pass as `seniorityRules` — it stays a plain-data/thin-function seam so this file never
// needs to know about Wellness Wednesday ordinals, conference defs, or the eligibility-override diff
// format; the caller resolves all of that once per render and hands over small closures.

import { SHIFT_MAP } from './shifts.js';

// resident.category + resident.pgy -> one bucket per (category, PGY). `resident.pgy` may be absent
// for an off-service category with only one PGY option in practice, but is read as-is here — never
// assumed; a resident with no PGY on record still gets its own bucket rather than being dropped.
function bucketKeyFor(resident) {
  return `${resident.category}_${resident.pgy ?? 'none'}`;
}

// "EM"/"BAMC" are hardcoded (not read off CATEGORIES) because the Coverage board's chip copy wants
// those exact short forms regardless of CATEGORIES' own label/shortLabel for EM_HOME/EM_BAMC
// ("EM – Home"/"EM-H", "EM – BAMC"/"BAMC" — shortLabel already happens to match for EM_BAMC, but not
// EM_HOME, so this can't just read shortLabel uniformly). Every other category is off-service and
// reads CATEGORIES' own shortLabel (falling back to label, then the bare id) so a category this file
// has never heard of still renders something instead of vanishing.
function categoryChipLabel(categoryId, categories) {
  if (categoryId === 'EM_HOME') return 'EM';
  if (categoryId === 'EM_BAMC') return 'BAMC';
  const cat = (categories || []).find(c => c.id === categoryId);
  const short = cat?.shortLabel || cat?.label || categoryId;
  return `Off-svc ${short}`;
}

function bucketLabel(resident, categories) {
  const chip = categoryChipLabel(resident.category, categories);
  return resident.pgy != null ? `${chip} PGY-${resident.pgy}` : chip;
}

// Plain short text for the HARD rule governing `shiftId` on `dateStr`, or null when this slot has
// none (most shifts: any eligible body fills it, no composition/ownership gate). Checked in this
// order: pgy1-only shifts (Trauma Day — BASE_ELIGIBILITY only grants it to EM_HOME_1, see
// ResidentScheduler.jsx:142/145-146), guarded-owner shifts (PED-N/PED-N-FM/PED-S —
// PED_GUARD_LEGITIMATE_OWNER, ResidentScheduler.jsx:3301-3303), then POD/FLEX senior composition
// (SENIOR_COMPOSITION, ResidentScheduler.jsx:2506) — exempt outright on a Wednesday DAY-type shift
// (seniorCompositionExempt, ResidentScheduler.jsx:2697-2699), otherwise hard-requires its primary
// PGY unless the date is that area's own Wellness Wednesday or a primary-PGY-away conference
// (compositionSatisfies/seniorWellnessSubstituteAllowed, ResidentScheduler.jsx:2602-2618), in which
// case the fallback PGY is named explicitly as today's allowed substitute.
function requirementFor(shiftId, dateStr, seniorityRules) {
  const {
    pgy1OnlyShiftIds = [],
    pgy1OnlyText = 'Trauma day: PGY-1 only',
    pedGuardOwnerLabels = {},
    composition = {},
    isCompositionExempt,
    substituteStatus,
  } = seniorityRules || {};

  if (pgy1OnlyShiftIds.includes(shiftId)) {
    return { requirement: pgy1OnlyText, requirementKind: 'pgy1Only' };
  }
  if (pedGuardOwnerLabels[shiftId]) {
    return { requirement: pedGuardOwnerLabels[shiftId], requirementKind: 'owner' };
  }

  const shift = SHIFT_MAP[shiftId];
  const comp = shift && composition[shift.area];
  if (!comp) return { requirement: null, requirementKind: null };

  if (typeof isCompositionExempt === 'function' && isCompositionExempt(shift, dateStr)) {
    return { requirement: null, requirementKind: null };
  }

  const kind = comp.primary === 3 ? 'pgy3' : 'pgy2';
  const sub = typeof substituteStatus === 'function' ? substituteStatus(shift.area, dateStr) : null;
  const base = `${shift.area} needs a PGY-${comp.primary}`;
  if (sub === 'wellness' || sub === 'conference') {
    const tag = sub === 'wellness' ? 'Wellness Wed' : 'conference';
    return { requirement: `${base}, PGY-${comp.fallback} allowed today (${tag})`, requirementKind: kind };
  }
  return { requirement: base, requirementKind: kind };
}

/**
 * @param {object} args
 * @param {string} args.shiftId
 * @param {string} args.dateStr
 * @param {object[]} args.residents  full roster (EM + off-service), each {id, category, pgy, blockType?}
 * @param {(resident:object) => string[]} args.effectiveEligibleShifts  resident-first eligibility
 *   (app passes `getEffectiveEligibility(resident, eligOverrides).list`, already PED-guard-stripped)
 * @param {(resident:object, dateStr:string, shiftId:string) => boolean} [args.isEligibleOnDate]
 *   date-scoped eligibility (day rules/gates + availability windows); when provided this REPLACES
 *   the static effectiveEligibleShifts check (it's expected to already incorporate it), so vacation/
 *   rotation-window residents are correctly excluded/included for this specific date
 * @param {(resident:object, dateStr:string) => boolean} [args.isAvailableOnDate]  defaults to "always
 *   available" when omitted
 * @param {object[]} [args.categories]  CATEGORIES (src/lib/parse.js) for off-service bucket labels
 * @param {object} [args.seniorityRules]  see the ADAPTER comment below
 * @returns {{buckets: object[], requirement: string|null, requirementKind: string|null}}
 */
export function expectedFillerFor({
  shiftId,
  dateStr,
  residents,
  effectiveEligibleShifts,
  isEligibleOnDate,
  isAvailableOnDate,
  categories = [],
  seniorityRules = {},
}) {
  const roster = Array.isArray(residents) ? residents : [];
  const bucketsByKey = new Map();

  for (const resident of roster) {
    if (!resident) continue;
    const staticList = typeof effectiveEligibleShifts === 'function' ? effectiveEligibleShifts(resident) : [];
    const staticEligible = Array.isArray(staticList) && staticList.includes(shiftId);
    const eligible = typeof isEligibleOnDate === 'function'
      ? isEligibleOnDate(resident, dateStr, shiftId)
      : staticEligible;
    if (!eligible) continue;

    const key = bucketKeyFor(resident);
    let bucket = bucketsByKey.get(key);
    if (!bucket) {
      bucket = {
        key,
        label: bucketLabel(resident, categories),
        category: resident.category,
        pgy: resident.pgy ?? null,
        rotation: resident.blockType || null,
        count: 0,
        availableCount: 0,
      };
      bucketsByKey.set(key, bucket);
    }
    bucket.count += 1;
    const available = typeof isAvailableOnDate === 'function' ? isAvailableOnDate(resident, dateStr) : true;
    if (available) bucket.availableCount += 1;
  }

  const buckets = [...bucketsByKey.values()].sort((a, b) => a.label.localeCompare(b.label));
  const { requirement, requirementKind } = requirementFor(shiftId, dateStr, seniorityRules);
  return { buckets, requirement, requirementKind };
}

// ─── ADAPTER (what ResidentScheduler.jsx's Coverage-board step should pass as `seniorityRules`) ──
//
// seniorityRules = {
//   // Trauma Day is EM_HOME_1-only in BASE_ELIGIBILITY (no other category/PGY lists 'TRAUMA-D') —
//   // a static id list, not derived per-call.
//   pgy1OnlyShiftIds: ['TRAUMA-D'],
//
//   // One formatted line per PED_GUARD_LEGITIMATE_OWNER-guarded id, built ONCE from that map plus
//   // CATEGORIES (not per shift/date — the owner set doesn't change). Example construction:
//   //   const ownerLabel = (key) => { // key = 'EM_HOME_2' etc, CATEGORY_PGY
//   //     const [, cat, pgy] = /^(.+)_(\d+)$/.exec(key) || [];
//   //     const short = cat === 'EM_HOME' ? 'EM' : cat === 'EM_BAMC' ? 'BAMC' : (CAT_MAP[cat]?.shortLabel || cat);
//   //     return `${short}${pgy ? ' PGY-' + pgy : ''}`;
//   //   };
//   //   const pedGuardOwnerLabels = Object.fromEntries(
//   //     Object.entries(PED_GUARD_LEGITIMATE_OWNER).map(([shiftId, owners]) =>
//   //       [shiftId, `Owners only: ${owners.map(ownerLabel).join(', ')}`]));
//   //   // e.g. PED-N-FM -> "Owners only: FM PGY-3"; PED-N -> "Owners only: EM PGY-1, EM PGY-2, ..."
//   pedGuardOwnerLabels,
//
//   // SENIOR_COMPOSITION verbatim ({ POD: {primary:3, fallback:2}, FLEX: {primary:2, fallback:3} }).
//   composition: SENIOR_COMPOSITION,
//
//   // Bind once per render (block/appSettings/ayConf don't change per shift/date call):
//   isCompositionExempt: (shift, ds) => seniorCompositionExempt(shift, ds),
//   substituteStatus: (area, ds) => substituteReasonFor(area, ds, block.startDate, appSettings, ayConf),
//   // (substituteReasonFor already returns 'wellness' | 'conference' | null — exactly this file's
//   // expected shape; no new logic needed on the app side beyond binding its trailing args.)
// };
//
// effectiveEligibleShifts = (resident) =>
//   getEffectiveEligibility(resident, eligOverrides).list;
//
// isEligibleOnDate = (resident, dateStr, shiftId) =>
//   getEligibleShifts(resident, dateStr, { blockStart: block.startDate, ... }).includes(shiftId);
// (optional — omitting it falls back to the static list above, which misses vacation/rotation-window
// exclusions for that specific date; pass it when the board needs date-accurate availability, which
// the day-floor view always does)
//
// isAvailableOnDate = isAvailableOnDate  (ResidentScheduler.jsx's own off-service-range function,
// verbatim — see ResidentScheduler.jsx:2513)
