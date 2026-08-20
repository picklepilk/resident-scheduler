/** @vitest-environment jsdom */
// src/lib/availabilityFeatures.test.js
// Unit tests for Phase 4's three chief-directed availability features (see CLAUDE.md-adjacent
// plan doc "4.1 Date ranges" / "4.2 Per-resident work restrictions" / "4.3 Wellness Wednesday
// controls"). Imports the real ResidentScheduler.jsx under jsdom, same pattern as
// grRestRules.test.js/finalSundayRule.test.js (verified import-safe there already).
//
// 4.1 (DateListEditor) is a pure UI component with no exported logic of its own — it reuses
// expandDateRangeInclusive, which has no independent behavior beyond what dates.test.js/the
// vacation-import tests already cover — so this file focuses on 4.2 and 4.3, the two features
// with real exported logic (shiftBlockedByRestrictions, and the Wellness Wednesday precedence
// baked into getEligibleShifts/validateAll).
import { describe, it, expect } from 'vitest';
import { getEligibleShifts, validateAll, shiftBlockedByRestrictions } from '../ResidentScheduler.jsx';
import { makeFixture } from './__fixtures__/syntheticRoster.js';

// ─── 4.2 work restrictions ──────────────────────────────────────────────────

// Minimal EM_HOME PGY-1 stand-in — shiftBlockedByRestrictions only reads resident.workRestrictions,
// so nothing else about the resident matters for the pure interval-math tests below.
function bareResident(workRestrictions) {
  return { id: 'bare', category: 'EM_HOME', pgy: 1, workRestrictions };
}

describe('shiftBlockedByRestrictions — interval math', () => {
  it('returns false when the resident has no restrictions', () => {
    expect(shiftBlockedByRestrictions(bareResident([]), '2026-07-06', 'POD-D')).toBe(false);
    expect(shiftBlockedByRestrictions({ id: 'x' }, '2026-07-06', 'POD-D')).toBe(false);
  });

  it('blockedWindow: shift crossing midnight overlaps a window that also crosses midnight', () => {
    // PED-N-FM 23:00-08:00 vs window 22:00-06:00 — both wrap; heavily overlapping.
    const r = bareResident([{ id: 'w1', label: 'Class', blockedWindow: { startH: 22, endH: 6 } }]);
    expect(shiftBlockedByRestrictions(r, '2026-07-06', 'PED-N-FM')).toBe(true);
  });

  it('blockedWindow: a non-wrapping day shift does NOT overlap a midnight-crossing window', () => {
    // POD-D 07:00-16:00 vs window 22:00-06:00 — window is a daily-recurring 10pm-6am block, no
    // instance of it (today's, yesterday's, or tomorrow's) reaches into the 7am-4pm day shift.
    const r = bareResident([{ id: 'w2', label: 'Class', blockedWindow: { startH: 22, endH: 6 } }]);
    expect(shiftBlockedByRestrictions(r, '2026-07-06', 'POD-D')).toBe(false);
  });

  it('blockedWindow: shift crossing midnight overlaps a window that does NOT itself wrap (both need the +24 daily-recurrence check)', () => {
    // PED-N-FM 23:00-08:00 (crosses into next day) vs window 00:00-06:00 (early morning, not
    // wrapping on its own) — the shift's early-morning portion (0:00-8:00 the next day) falls
    // inside the window's next-day recurrence. This is the case that requires checking the
    // window shifted +24h against the shift's own (unshifted) interval, not just the window as
    // literally written.
    const r = bareResident([{ id: 'w3', label: 'Early class', blockedWindow: { startH: 0, endH: 6 } }]);
    expect(shiftBlockedByRestrictions(r, '2026-07-06', 'PED-N-FM')).toBe(true);
  });

  it('blockedWindow: plain same-day overlap (no wraparound on either side)', () => {
    // TRAUMA-D 06:00-18:00 vs window 12:00-14:00 — window sits entirely inside the shift.
    const inside = bareResident([{ id: 'w4', label: 'Appt', blockedWindow: { startH: 12, endH: 14 } }]);
    expect(shiftBlockedByRestrictions(inside, '2026-07-06', 'TRAUMA-D')).toBe(true);
    // POD-D 07:00-16:00 vs window 17:00-20:00 — clean gap after the shift ends, no overlap.
    const outside = bareResident([{ id: 'w5', label: 'Evening class', blockedWindow: { startH: 17, endH: 20 } }]);
    expect(shiftBlockedByRestrictions(outside, '2026-07-06', 'POD-D')).toBe(false);
  });

  it('blockedTypes matches the shift TYPE, independent of any window', () => {
    const r = bareResident([{ id: 't1', label: 'No nights', blockedTypes: ['night'] }]);
    expect(shiftBlockedByRestrictions(r, '2026-07-06', 'POD-N')).toBe(true);
    expect(shiftBlockedByRestrictions(r, '2026-07-06', 'POD-D')).toBe(false);
  });

  it('startDate/endDate gate which dates the restriction is active on', () => {
    const r = bareResident([{ id: 'd1', label: 'Post-op', startDate: '2026-07-10', endDate: '2026-07-17', blockedTypes: ['night'] }]);
    expect(shiftBlockedByRestrictions(r, '2026-07-09', 'POD-N')).toBe(false); // before start
    expect(shiftBlockedByRestrictions(r, '2026-07-10', 'POD-N')).toBe(true);  // start (inclusive)
    expect(shiftBlockedByRestrictions(r, '2026-07-17', 'POD-N')).toBe(true);  // end (inclusive)
    expect(shiftBlockedByRestrictions(r, '2026-07-18', 'POD-N')).toBe(false); // after end
  });

  it('daysOfWeek gates which weekdays the restriction is active on', () => {
    // 2026-07-06 is a Monday (dow 1), 2026-07-07 is a Tuesday (dow 2).
    const r = bareResident([{ id: 'dow1', label: 'Mondays only', daysOfWeek: [1], blockedTypes: ['night'] }]);
    expect(shiftBlockedByRestrictions(r, '2026-07-06', 'POD-N')).toBe(true);
    expect(shiftBlockedByRestrictions(r, '2026-07-07', 'POD-N')).toBe(false);
  });

  it('an unknown shift id or a resident with no timing data is never reported as blocked', () => {
    const r = bareResident([{ id: 'x1', label: 'Anything', blockedTypes: ['day', 'eve', 'night', 'swing'] }]);
    expect(shiftBlockedByRestrictions(r, '2026-07-06', 'NOT-A-REAL-SHIFT')).toBe(false);
  });
});

describe('getEligibleShifts — work-restriction strip', () => {
  it('blockedTypes strips only the matching-type shift ids, leaving the rest of the day untouched', () => {
    const restricted = bareResident([{ id: 'r1', label: 'No nights', blockedTypes: ['night'] }]);
    // 2026-07-06 is a Monday — no GR/wellness/trauma-window interference for EM_HOME_1.
    const elig = getEligibleShifts(restricted, '2026-07-06', {}, {}, {}, {}, { blockStart: '2026-07-06' });
    expect(elig).not.toContain('POD-N');
    expect(elig).not.toContain('MT-N');
    expect(elig).toContain('POD-D');
  });

  it('blockedWindow strips only shift ids whose interval overlaps the window', () => {
    const restricted = bareResident([{ id: 'r2', label: 'Late class', blockedWindow: { startH: 22, endH: 6 } }]);
    const elig = getEligibleShifts(restricted, '2026-07-06', {}, {}, {}, {}, { blockStart: '2026-07-06' });
    expect(elig).not.toContain('POD-N'); // 23:00-08:00 overlaps 22:00-06:00
    expect(elig).toContain('POD-D');     // 07:00-16:00 does not
  });

  it('an inactive restriction (outside its date range) strips nothing', () => {
    const restricted = bareResident([{ id: 'r3', label: 'Post-op', startDate: '2026-08-01', endDate: '2026-08-05', blockedTypes: ['night'] }]);
    const elig = getEligibleShifts(restricted, '2026-07-06', {}, {}, {}, {}, { blockStart: '2026-07-06' });
    expect(elig).toContain('POD-N');
  });
});

describe('validateAll — work-restriction violation', () => {
  it('raises an error naming the restriction label when a schedule violates it', () => {
    const { block } = makeFixture('standard');
    const resident = {
      id: 'restricted_res', firstName: 'Test', lastName: 'Resident', category: 'EM_HOME', pgy: 1,
      blockType: 'EM', approvedDatesOff: [], vacationDates: [], jeopardyDates: [], jcPresentDates: [], grLectureDates: [],
      workRestrictions: [{ id: 'r1', label: 'Post-op — no nights', blockedTypes: ['night'] }],
    };
    // Monday inside the block, POD-N is a night shift and otherwise eligible for EM_HOME PGY-1.
    const schedule = { [resident.id]: { '2026-07-06': 'POD-N' } };
    const issues = validateAll([resident], schedule, block, {}, {}, {}, {}, [], {});
    const hit = issues.find(i => i.residentId === resident.id && i.dateStr === '2026-07-06');
    expect(hit).toBeTruthy();
    expect(hit.level).toBe('error');
    expect(hit.message).toContain('Post-op — no nights');
  });

  it('does not raise a restriction violation when the restriction is not active that date', () => {
    const { block } = makeFixture('standard');
    const resident = {
      id: 'restricted_res2', firstName: 'Test', lastName: 'Resident', category: 'EM_HOME', pgy: 1,
      blockType: 'EM', approvedDatesOff: [], vacationDates: [], jeopardyDates: [], jcPresentDates: [], grLectureDates: [],
      workRestrictions: [{ id: 'r1', label: 'Post-op — no nights', startDate: '2026-08-01', endDate: '2026-08-05', blockedTypes: ['night'] }],
    };
    const schedule = { [resident.id]: { '2026-07-06': 'POD-N' } };
    const issues = validateAll([resident], schedule, block, {}, {}, {}, {}, [], {});
    const hit = issues.find(i => i.residentId === resident.id && i.dateStr === '2026-07-06' && /Post-op/.test(i.message));
    expect(hit).toBeFalsy();
  });
});

// ─── 4.3 Wellness Wednesday controls ────────────────────────────────────────
// syntheticRoster's fixed block window (2026-07-06, a Monday) makes the computed Wellness
// Wednesday dates deterministic via nthWeekdayOnOrAfter(start, 3, ordinal):
//   PGY-1 (ordinal 1) -> 2026-07-08, PGY-2 (ordinal 2) -> 2026-07-15, PGY-3 (ordinal 3) -> 2026-07-22.
// 'Foxtrot' (EM_HOME PGY-1, no other special date-chip data) is used below so the effect under
// test isn't confounded by another rule (vacation/JC/GR) touching the same resident.

function foxtrot(fixture, overrides = {}) {
  const base = fixture.allResidents.find(r => r.id === 'syn_foxtrot');
  return { ...base, ...overrides };
}

const WELLNESS_WED_PGY1 = '2026-07-08';
// A regular (non-wellness) GR Wednesday for the same PGY-1 resident — GR Wednesday's own
// dayTypeRestrictions strips 'day' every Wednesday, but NOT 'eve', so POD-E isolates the
// wellness-specific strip from the always-on GR Wednesday strip.
const REGULAR_WED = '2026-07-15';
// An arbitrary non-Wednesday date, used to prove a custom wellnessOverride date strips
// eligibility on ITS OWN date regardless of weekday.
const CUSTOM_MONDAY = '2026-07-20';

describe('getEligibleShifts — Wellness Wednesday precedence (4.3)', () => {
  it('default: strips eve (and day) on the computed date, not on an ordinary GR Wednesday', () => {
    const fixture = makeFixture('standard');
    const r = foxtrot(fixture);
    const onWellness = getEligibleShifts(r, WELLNESS_WED_PGY1, {}, {}, {}, {}, { blockStart: fixture.block.startDate });
    const onRegular = getEligibleShifts(r, REGULAR_WED, {}, {}, {}, {}, { blockStart: fixture.block.startDate });
    expect(onWellness).not.toContain('POD-E');
    expect(onRegular).toContain('POD-E');
  });

  it("optOut: this resident's Wellness Wednesday strips nothing at all", () => {
    const fixture = makeFixture('standard');
    const r = foxtrot(fixture, { wellnessOverride: 'optOut' });
    const elig = getEligibleShifts(r, WELLNESS_WED_PGY1, {}, {}, {}, {}, { blockStart: fixture.block.startDate });
    expect(elig).toContain('POD-E');
  });

  it('custom date: strips on the chief-picked date (even a non-Wednesday) instead of the computed one', () => {
    const fixture = makeFixture('standard');
    const r = foxtrot(fixture, { wellnessOverride: CUSTOM_MONDAY });
    const onCustom = getEligibleShifts(r, CUSTOM_MONDAY, {}, {}, {}, {}, { blockStart: fixture.block.startDate });
    const onComputed = getEligibleShifts(r, WELLNESS_WED_PGY1, {}, {}, {}, {}, { blockStart: fixture.block.startDate });
    expect(onCustom).not.toContain('POD-E');
    expect(onCustom).not.toContain('POD-D'); // Monday isn't otherwise GR-Wednesday-restricted
    expect(onComputed).toContain('POD-E'); // the computed date is no longer special for this resident
  });

  it('global toggle off: no strip anywhere, even for a resident with no override', () => {
    const fixture = makeFixture('standard');
    const r = foxtrot(fixture);
    const elig = getEligibleShifts(r, WELLNESS_WED_PGY1, {}, {}, { wellnessWednesdaysEnabled: false }, {}, { blockStart: fixture.block.startDate });
    expect(elig).toContain('POD-E');
  });
});

describe('validateAll — Wellness Wednesday message honors overrides', () => {
  it('a custom-date violation names it as a custom-date Wellness Wednesday', () => {
    const fixture = makeFixture('standard');
    const r = foxtrot(fixture, { wellnessOverride: CUSTOM_MONDAY });
    const schedule = { [r.id]: { [CUSTOM_MONDAY]: 'POD-E' } };
    const issues = validateAll([r], schedule, fixture.block, {}, {}, {}, {}, [], {});
    const hit = issues.find(i => i.residentId === r.id && i.dateStr === CUSTOM_MONDAY);
    expect(hit).toBeTruthy();
    expect(hit.message).toMatch(/Wellness Wednesday/);
    expect(hit.message).toMatch(/custom date/);
  });

  it('an optOut resident scheduled on their computed Wellness Wednesday raises no wellness violation', () => {
    const fixture = makeFixture('standard');
    const r = foxtrot(fixture, { wellnessOverride: 'optOut' });
    const schedule = { [r.id]: { [WELLNESS_WED_PGY1]: 'POD-E' } };
    const issues = validateAll([r], schedule, fixture.block, {}, {}, {}, {}, [], {});
    const hit = issues.find(i => i.residentId === r.id && i.dateStr === WELLNESS_WED_PGY1 && /Wellness/.test(i.message));
    expect(hit).toBeFalsy();
  });
});
