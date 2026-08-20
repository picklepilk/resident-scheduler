import { describe, it, expect } from 'vitest';
import {
  normalizeCoverageEntry, getCoverageFor,
  DEFAULT_COVERAGE, DEFAULT_COVERAGE_MINMAX, DOW_COVERAGE_MAX_OVERRIDE, DOW_COVERAGE_OVERRIDE,
  CONF_SUPPRESSED_NORMAL_IDS, CONF_AUTO_SWAP_12H_IDS,
  TWELVE_HOUR_IDS, TWELVE_HOUR_AREAS,
  normalizeTwelveHourWindow, implicitConferenceWindows,
  resolveTwelveHourWindows, twelveHourStateFor, twelveHourAllows,
} from './coverage.js';
import { SHIFTS, SHIFT_DOW } from './shifts.js';

describe('normalizeCoverageEntry', () => {
  it('converts a legacy single-number shape to {min,max} with equal values', () => {
    expect(normalizeCoverageEntry(3)).toEqual({ min: 3, max: 3 });
  });

  it('clamps a negative legacy number to 0', () => {
    expect(normalizeCoverageEntry(-2)).toEqual({ min: 0, max: 0 });
  });

  it('passes through a well-formed {min,max} object', () => {
    expect(normalizeCoverageEntry({ min: 1, max: 3 })).toEqual({ min: 1, max: 3 });
  });

  it('clamps max up to min when max < min', () => {
    expect(normalizeCoverageEntry({ min: 3, max: 1 })).toEqual({ min: 3, max: 3 });
  });

  it('treats missing/garbage fields as 0', () => {
    expect(normalizeCoverageEntry({})).toEqual({ min: 0, max: 0 });
    expect(normalizeCoverageEntry({ min: 'x', max: 'y' })).toEqual({ min: 0, max: 0 });
  });

  it('returns null for a non-object, non-number value (untrusted shape)', () => {
    expect(normalizeCoverageEntry('nonsense')).toBeNull();
    expect(normalizeCoverageEntry(null)).toBeNull();
    expect(normalizeCoverageEntry(undefined)).toBeNull();
  });
});

describe('DEFAULT_COVERAGE_MINMAX catalog integrity', () => {
  // Regression guard for the exact bug class this repo has been bitten by before (see CLAUDE.md's
  // 12h-window phantom-minimum incident): DEFAULT_COVERAGE falls back to {min:1,max:1} for any
  // SHIFTS id absent from DEFAULT_COVERAGE_MINMAX, silently making it "1 required body every
  // day" instead of a deliberate default. A per-id assertion (e.g. just for PED-N-FM) would do
  // nothing for the NEXT shift id someone adds -- this walks the whole catalog instead.
  it('every SHIFTS id has an explicit DEFAULT_COVERAGE_MINMAX entry', () => {
    for (const s of SHIFTS) {
      expect(DEFAULT_COVERAGE_MINMAX[s.id], `missing DEFAULT_COVERAGE_MINMAX for ${s.id}`).toBeDefined();
    }
  });

  it('PED-N-FM is explicit min:0/max:1, best-effort like PED-N', () => {
    expect(DEFAULT_COVERAGE_MINMAX['PED-N-FM']).toEqual({ min: 0, max: 1 });
    expect(DEFAULT_COVERAGE['PED-N-FM']).toEqual({ min: 0, max: 1 });
  });
});

describe('getCoverageFor: base lookup', () => {
  it('falls back to DEFAULT_COVERAGE when no chief override is present', () => {
    expect(getCoverageFor('POD-D', {})).toEqual(DEFAULT_COVERAGE['POD-D']);
  });

  it('prefers a chief override over the default', () => {
    expect(getCoverageFor('POD-D', { 'POD-D': { min: 5, max: 5 } })).toEqual({ min: 5, max: 5 });
  });

  it('normalizes a legacy-number chief override', () => {
    expect(getCoverageFor('MT-D', { 'MT-D': 4 })).toEqual({ min: 4, max: 4 });
  });

  it('falls back to {min:0,max:0} for a shift id present in neither map', () => {
    expect(getCoverageFor('NOT-A-SHIFT', {})).toEqual({ min: 0, max: 0 });
  });
});

describe('getCoverageFor: DOW_COVERAGE_MAX_OVERRIDE (POD Mon/Tue bump)', () => {
  it('raises POD-D max to 3 on Monday (dow=1)', () => {
    expect(getCoverageFor('POD-D', {}, 1)).toEqual({ min: 2, max: 3 });
  });

  it('raises POD-D max to 3 on Tuesday (dow=2)', () => {
    expect(getCoverageFor('POD-D', {}, 2)).toEqual({ min: 2, max: 3 });
  });

  it('does not raise POD-D max via DOW_COVERAGE_MAX_OVERRIDE on Wednesday (dow=3 has no entry there)', () => {
    // Wednesday DOES change POD-D's coverage, but via the separate DOW_COVERAGE_OVERRIDE
    // (Grand Rounds/APP-coverage rule) -- see the "DOW_COVERAGE_OVERRIDE" describe block below,
    // not this raise-only mechanism. {min:2,max:2} would be the answer with that rule absent.
    expect(DOW_COVERAGE_MAX_OVERRIDE['POD-D'][3]).toBeUndefined();
    expect(getCoverageFor('POD-D', {}, 3)).toEqual({ min: 1, max: 2 });
  });

  it('never lowers a chief-customized max already above the override', () => {
    expect(getCoverageFor('POD-D', { 'POD-D': { min: 2, max: 5 } }, 1)).toEqual({ min: 2, max: 5 });
  });

  it('does not affect a shift with no dow override entry', () => {
    expect(getCoverageFor('FLEX-D', {}, 1)).toEqual(DEFAULT_COVERAGE['FLEX-D']);
  });

  it('min is never touched by dow', () => {
    expect(getCoverageFor('POD-D', {}, 1).min).toBe(DEFAULT_COVERAGE['POD-D'].min);
  });
});

describe('getCoverageFor: DOW_COVERAGE_OVERRIDE (POD-D/FLEX-D Wednesday GR+APP drop)', () => {
  it('drops POD-D to min:1/max:2 on Wednesday (dow=3)', () => {
    expect(getCoverageFor('POD-D', {}, 3)).toEqual({ min: 1, max: 2 });
  });

  it('drops FLEX-D to min:1/max:2 on Wednesday (dow=3)', () => {
    expect(getCoverageFor('FLEX-D', {}, 3)).toEqual({ min: 1, max: 2 });
  });

  it('does not affect FLEX-D on any other day of the week (FLEX-D has no other dow override)', () => {
    for (const dow of [0, 1, 2, 4, 5, 6]) {
      expect(getCoverageFor('FLEX-D', {}, dow)).toEqual(DEFAULT_COVERAGE['FLEX-D']);
    }
  });

  it('does not affect POD-D on Sun/Thu/Fri/Sat -- Mon/Tue keep their own separate raise (DOW_COVERAGE_MAX_OVERRIDE), untouched by this rule', () => {
    for (const dow of [0, 4, 5, 6]) {
      expect(getCoverageFor('POD-D', {}, dow)).toEqual(DEFAULT_COVERAGE['POD-D']);
    }
    expect(getCoverageFor('POD-D', {}, 1)).toEqual({ min: 2, max: 3 });
    expect(getCoverageFor('POD-D', {}, 2)).toEqual({ min: 2, max: 3 });
  });

  it('does not affect other shifts on Wednesday, including same-area eve/night shifts', () => {
    expect(getCoverageFor('POD-E', {}, 3)).toEqual(DEFAULT_COVERAGE['POD-E']);
    expect(getCoverageFor('POD-N', {}, 3)).toEqual(DEFAULT_COVERAGE['POD-N']);
    expect(getCoverageFor('FLEX-E', {}, 3)).toEqual(DEFAULT_COVERAGE['FLEX-E']);
    expect(getCoverageFor('FLEX-N', {}, 3)).toEqual(DEFAULT_COVERAGE['FLEX-N']);
    expect(getCoverageFor('MT-D', {}, 3)).toEqual(DEFAULT_COVERAGE['MT-D']);
  });

  it('is a direct replacement, not a clamp -- overrides even a chief-customized higher value', () => {
    // Unlike DOW_COVERAGE_MAX_OVERRIDE, this one does NOT defer to a chief's bigger Rules-tab
    // number: Wednesday is a structurally different (APP-covered) day, not a bigger version of
    // a normal day.
    expect(getCoverageFor('POD-D', { 'POD-D': { min: 3, max: 5 } }, 3)).toEqual({ min: 1, max: 2 });
    expect(getCoverageFor('FLEX-D', { 'FLEX-D': { min: 2, max: 6 } }, 3)).toEqual({ min: 1, max: 2 });
  });

  it('also overrides a chief-customized value that is already below the Wednesday numbers', () => {
    expect(getCoverageFor('POD-D', { 'POD-D': { min: 0, max: 1 } }, 3)).toEqual({ min: 1, max: 2 });
  });

  it('does not interact with DOW_COVERAGE_MAX_OVERRIDE -- POD-D Mon/Tue bump is untouched', () => {
    expect(getCoverageFor('POD-D', {}, 1)).toEqual({ min: 2, max: 3 });
    expect(getCoverageFor('POD-D', {}, 2)).toEqual({ min: 2, max: 3 });
    expect(DOW_COVERAGE_OVERRIDE['POD-D'][1]).toBeUndefined();
    expect(DOW_COVERAGE_OVERRIDE['POD-D'][2]).toBeUndefined();
  });

  it('applies through the 12h-state resolution chain for a normal (non-window) Wednesday', () => {
    const state = twelveHourStateFor('2026-08-19', {}); // a Wednesday, no windows active
    expect(getCoverageFor('POD-D', {}, 3, state)).toEqual({ min: 1, max: 2 });
    expect(getCoverageFor('FLEX-D', {}, 3, state)).toEqual({ min: 1, max: 2 });
  });

  it('is bypassed (as expected) when the area is under a conference replace window -- suppressed to {0,0} first', () => {
    const ayConf = { twelveHourWindows: [{ start: '2026-08-19', end: '2026-08-19', areas: ['POD'] }] };
    const state = twelveHourStateFor('2026-08-19', ayConf); // Wednesday, POD under a replace window
    expect(getCoverageFor('POD-D', {}, 3, state)).toEqual({ min: 0, max: 0 });
  });
});

describe('getCoverageFor: TRAUMA clamp on the untouched (no-state) path', () => {
  it('clamps a hand-edited above-1 TRAUMA-D override down to max 1', () => {
    expect(getCoverageFor('TRAUMA-D', { 'TRAUMA-D': { min: 2, max: 4 } })).toEqual({ min: 1, max: 1 });
  });

  it('clamps a legacy-number TRAUMA-N override down to max 1', () => {
    expect(getCoverageFor('TRAUMA-N', { 'TRAUMA-N': 3 })).toEqual({ min: 1, max: 1 });
  });
});

describe('SHIFT_DOW (trauma must-fill days): TRAUMA-D/TRAUMA-N only exist on specific weekdays', () => {
  // getCoverageFor itself is day-of-week-oblivious for TRAUMA ids (it always returns the base
  // {min,max}, dow-clamped only where DOW_COVERAGE_MAX_OVERRIDE applies, which TRAUMA never is) —
  // the actual "doesn't exist today" gating lives in SHIFT_DOW and is applied by callers
  // (computeCoverageByDate in ResidentScheduler.jsx, composeCoverage in coverageComposition.js,
  // getEligibleShifts) BEFORE they ever call getCoverageFor for that date. These entries match the
  // existing EM Home trauma_day_gate/trauma_n_window shiftGate windows exactly (chief-directed
  // AY26/27 — see coverageComposition.test.js for the caller-side "absent on the wrong day" behavior).
  it('TRAUMA-D exists Sun/Tue/Thu/Sat, TRAUMA-N exists Sun/Mon/Fri/Sat', () => {
    expect(SHIFT_DOW['TRAUMA-D']).toEqual([0, 2, 4, 6]);
    expect(SHIFT_DOW['TRAUMA-N']).toEqual([0, 1, 5, 6]);
  });

  it('getCoverageFor still returns the full min/max for TRAUMA-D/TRAUMA-N regardless of dow — the caller, not this function, must consult SHIFT_DOW first', () => {
    // dow=3 (Wednesday) is outside both windows, but getCoverageFor doesn't know that — passing
    // dow here only ever affects DOW_COVERAGE_MAX_OVERRIDE (POD only), never TRAUMA.
    expect(getCoverageFor('TRAUMA-D', {}, 3)).toEqual({ min: 1, max: 1 });
    expect(getCoverageFor('TRAUMA-N', {}, 3)).toEqual({ min: 1, max: 1 });
  });
});

// ─── twelveHourStateFor / normalizeTwelveHourWindow / resolveTwelveHourWindows ───

const ACEP_CONF = { acepStart: '2026-10-05', acepEnd: '2026-10-09' };

describe('twelveHourStateFor: always returns a defined state, never null/undefined', () => {
  it('returns empty sets for an ordinary date with ayConf undefined', () => {
    const state = twelveHourStateFor('2026-09-01', undefined);
    expect(state).toBeTruthy();
    expect(state.replaceAreas.size).toBe(0);
    expect(state.addAreas.size).toBe(0);
    expect(state.covOverride).toEqual({});
  });

  it('returns empty sets for an ordinary date with ayConf = {}', () => {
    const state = twelveHourStateFor('2026-09-01', {});
    expect(state).toBeTruthy();
    expect(state.replaceAreas.size).toBe(0);
    expect(state.addAreas.size).toBe(0);
  });

  it('returns empty sets for an ayConf full of empty strings', () => {
    const state = twelveHourStateFor('2026-09-01', { acepStart: '', acepEnd: '', aaemStart: '', saemStart: '' });
    expect(state.replaceAreas.size).toBe(0);
    expect(state.addAreas.size).toBe(0);
  });

  it('never returns null even for a garbage ayConf shape', () => {
    expect(twelveHourStateFor('2026-09-01', 'nonsense')).toBeTruthy();
    expect(twelveHourStateFor('2026-09-01', null)).toBeTruthy();
    expect(twelveHourStateFor('2026-09-01', 42)).toBeTruthy();
  });
});

describe('getCoverageFor + twelveHourStateFor: latent-bug fix', () => {
  // Regression guard for the real bug this task fixes: the old getCoverageFor(shiftId, coverage,
  // dow, confActive) guard was `if (confActive != null)`, and isConferenceCoverageDate returned
  // undefined for an ayConf with undefined fields (e.g. {}) — so the branch was SKIPPED and every
  // 12h id fell through to its non-zero DEFAULT_COVERAGE minimum on every ordinary date. Test
  // fixtures that passed {} as ayConf scored ~10 phantom unfillable minimums per day as a result.
  it('resolves every 12h id to {0,0} on an ordinary date when ayConf is {}', () => {
    const state = twelveHourStateFor('2026-09-01', {});
    for (const sid of TWELVE_HOUR_IDS) {
      expect(getCoverageFor(sid, {}, undefined, state)).toEqual({ min: 0, max: 0 });
    }
  });
});

describe('backward compat: implicit ACEP/AAEM/SAEM windows reproduce today\'s confActive behavior', () => {
  const inWindowDate = '2026-10-07'; // inside ACEP_CONF's range
  const outOfWindowDate = '2026-09-01';

  it('normal POD/MT/FLEX id in-window -> {0,0}, matching old confActive=true suppression', () => {
    const state = twelveHourStateFor(inWindowDate, ACEP_CONF);
    for (const sid of CONF_SUPPRESSED_NORMAL_IDS) {
      expect(getCoverageFor(sid, {}, undefined, state)).toEqual({ min: 0, max: 0 });
    }
  });

  it('12h POD/MT/FLEX id in-window -> DEFAULT_COVERAGE, matching old confActive=true activation', () => {
    const state = twelveHourStateFor(inWindowDate, ACEP_CONF);
    for (const sid of CONF_AUTO_SWAP_12H_IDS) {
      expect(getCoverageFor(sid, {}, undefined, state)).toEqual(DEFAULT_COVERAGE[sid]);
    }
  });

  it('out-of-window: normal id gets DEFAULT_COVERAGE, matching old confActive=false fallthrough', () => {
    const state = twelveHourStateFor(outOfWindowDate, ACEP_CONF);
    for (const sid of CONF_SUPPRESSED_NORMAL_IDS) {
      expect(getCoverageFor(sid, {}, undefined, state)).toEqual(DEFAULT_COVERAGE[sid]);
    }
  });

  it('out-of-window: 12h id gets {0,0}, matching old confActive=false suppression', () => {
    const state = twelveHourStateFor(outOfWindowDate, ACEP_CONF);
    for (const sid of CONF_AUTO_SWAP_12H_IDS) {
      expect(getCoverageFor(sid, {}, undefined, state)).toEqual({ min: 0, max: 0 });
    }
  });
});

describe('normalizeTwelveHourWindow: validation', () => {
  it('accepts a well-formed window and defaults mode to replace, label to \'\'', () => {
    const w = normalizeTwelveHourWindow({ start: '2026-10-05', end: '2026-10-09', areas: ['POD', 'MT'] });
    expect(w).toEqual({
      id: '12h_2026-10-05_2026-10-09',
      label: '',
      start: '2026-10-05',
      end: '2026-10-09',
      areas: ['POD', 'MT'],
      mode: 'replace',
      coverage: {},
    });
  });

  it('defaults end to start when end is absent', () => {
    const w = normalizeTwelveHourWindow({ start: '2026-10-05', areas: ['POD'] });
    expect(w.end).toBe('2026-10-05');
  });

  it('accepts mode: "add" exactly, but treats any other value as replace', () => {
    expect(normalizeTwelveHourWindow({ start: '2026-01-01', areas: ['POD'], mode: 'add' }).mode).toBe('add');
    expect(normalizeTwelveHourWindow({ start: '2026-01-01', areas: ['POD'], mode: 'ADD' }).mode).toBe('replace');
    expect(normalizeTwelveHourWindow({ start: '2026-01-01', areas: ['POD'], mode: 'bogus' }).mode).toBe('replace');
  });

  it('derives a stable, deterministic id from start+end when id is not given', () => {
    const a = normalizeTwelveHourWindow({ start: '2026-10-05', end: '2026-10-09', areas: ['POD'] });
    const b = normalizeTwelveHourWindow({ start: '2026-10-05', end: '2026-10-09', areas: ['MT'] });
    expect(a.id).toBe(b.id); // same start/end -> same derived id, regardless of areas
    expect(a.id).toBe('12h_2026-10-05_2026-10-09');
  });

  it('preserves an explicit id when given', () => {
    expect(normalizeTwelveHourWindow({ id: 'my-window', start: '2026-01-01', areas: ['POD'] }).id).toBe('my-window');
  });

  it('filters areas down to TWELVE_HOUR_AREAS, dropping unknown values', () => {
    const w = normalizeTwelveHourWindow({ start: '2026-01-01', areas: ['POD', 'TRAUMA', 'BOGUS'] });
    expect(w.areas).toEqual(['POD']);
  });

  it('rejects a window with a malformed start date', () => {
    expect(normalizeTwelveHourWindow({ start: 'not-a-date', areas: ['POD'] })).toBeNull();
    expect(normalizeTwelveHourWindow({ start: '2026-1-1', areas: ['POD'] })).toBeNull();
    expect(normalizeTwelveHourWindow({ start: 123, areas: ['POD'] })).toBeNull();
  });

  it('rejects a window whose end is before its start', () => {
    expect(normalizeTwelveHourWindow({ start: '2026-10-09', end: '2026-10-05', areas: ['POD'] })).toBeNull();
  });

  it('rejects a window with no valid areas after filtering', () => {
    expect(normalizeTwelveHourWindow({ start: '2026-01-01', areas: [] })).toBeNull();
    expect(normalizeTwelveHourWindow({ start: '2026-01-01', areas: ['TRAUMA', 'BOGUS'] })).toBeNull();
    expect(normalizeTwelveHourWindow({ start: '2026-01-01', areas: 'POD' })).toBeNull(); // not an array
  });

  it('rejects non-object input entirely', () => {
    expect(normalizeTwelveHourWindow(null)).toBeNull();
    expect(normalizeTwelveHourWindow(undefined)).toBeNull();
    expect(normalizeTwelveHourWindow('nonsense')).toBeNull();
    expect(normalizeTwelveHourWindow(42)).toBeNull();
    expect(normalizeTwelveHourWindow(['2026-01-01'])).toBeNull();
  });

  it('drops junk coverage keys not in TWELVE_HOUR_IDS or the window\'s own area normal ids', () => {
    const w = normalizeTwelveHourWindow({
      start: '2026-01-01', areas: ['POD'],
      coverage: { 'POD-D12': { min: 1, max: 2 }, 'TRAUMA-D': { min: 5, max: 5 }, 'BOGUS-ID': 3 },
    });
    expect(w.coverage).toEqual({ 'POD-D12': { min: 1, max: 2 } });
  });

  it('allows a window to tune its own area\'s normal 9h ids too (for add-mode use)', () => {
    const w = normalizeTwelveHourWindow({
      start: '2026-01-01', areas: ['POD'], mode: 'add',
      coverage: { 'POD-D': { min: 1, max: 1 } },
    });
    expect(w.coverage).toEqual({ 'POD-D': { min: 1, max: 1 } });
  });

  it('drops a coverage entry whose value fails normalizeCoverageEntry', () => {
    const w = normalizeTwelveHourWindow({
      start: '2026-01-01', areas: ['POD'],
      coverage: { 'POD-D12': 'garbage', 'POD-N12': null },
    });
    expect(w.coverage).toEqual({});
  });
});

describe('resolveTwelveHourWindows', () => {
  it('falls back to implicitConferenceWindows when ayConf.twelveHourWindows is absent', () => {
    expect(resolveTwelveHourWindows(ACEP_CONF)).toEqual(implicitConferenceWindows(ACEP_CONF));
  });

  it('an explicit [] means no windows at all -- does NOT fall back to implicit', () => {
    expect(resolveTwelveHourWindows({ ...ACEP_CONF, twelveHourWindows: [] })).toEqual([]);
  });

  it('uses explicit windows, normalizing and dropping invalid entries, preserving order', () => {
    const ayConf = {
      twelveHourWindows: [
        { start: '2026-11-01', areas: ['MT'] },
        { start: 'garbage', areas: ['POD'] }, // dropped
        { start: '2026-12-01', areas: ['FLEX'] },
      ],
    };
    const resolved = resolveTwelveHourWindows(ayConf);
    expect(resolved.length).toBe(2);
    expect(resolved[0].start).toBe('2026-11-01');
    expect(resolved[1].start).toBe('2026-12-01');
  });

  it('explicit windows override implicit -- implicit ACEP window is not consulted when explicit array present', () => {
    const ayConf = { ...ACEP_CONF, twelveHourWindows: [{ start: '2026-11-01', areas: ['MT'] }] };
    const state = twelveHourStateFor('2026-10-07', ayConf); // inside ACEP_CONF's range, but explicit array wins
    expect(state.replaceAreas.size).toBe(0);
  });
});

describe('implicitConferenceWindows', () => {
  it('produces one replace window per set conference date, over POD/MT/FLEX (never PED)', () => {
    const windows = implicitConferenceWindows({
      acepStart: '2026-10-05', acepEnd: '2026-10-09',
      aaemStart: '2027-02-01',
      saemStart: '2027-05-01', saemEnd: '2027-05-05',
    });
    expect(windows.length).toBe(3);
    for (const w of windows) {
      expect(w.mode).toBe('replace');
      expect(w.areas).toEqual(['POD', 'MT', 'FLEX']);
    }
    expect(windows.map(w => w.label)).toEqual(['ACEP', 'AAEM', 'SAEM']);
    // aaem/saem end fall back to their own start when *End is absent
    expect(windows[1].end).toBe('2027-02-01');
  });

  it('excludes ITE -- iteDate never produces a window', () => {
    const windows = implicitConferenceWindows({ iteDate: '2027-01-15' });
    expect(windows).toEqual([]);
  });

  it('skips a conference whose start is missing or an empty string', () => {
    expect(implicitConferenceWindows({})).toEqual([]);
    expect(implicitConferenceWindows({ acepStart: '', aaemStart: undefined, saemStart: null })).toEqual([]);
  });

  it('is defensive against a null/undefined ayConf', () => {
    expect(implicitConferenceWindows(undefined)).toEqual([]);
    expect(implicitConferenceWindows(null)).toEqual([]);
  });
});

describe('twelveHourStateFor: replace vs add, overlap resolution', () => {
  it('replace mode populates replaceAreas', () => {
    const ayConf = { twelveHourWindows: [{ start: '2026-06-01', end: '2026-06-05', areas: ['POD'], mode: 'replace' }] };
    const state = twelveHourStateFor('2026-06-03', ayConf);
    expect(state.replaceAreas.has('POD')).toBe(true);
    expect(state.addAreas.has('POD')).toBe(false);
  });

  it('add mode populates addAreas, not replaceAreas', () => {
    const ayConf = { twelveHourWindows: [{ start: '2026-06-01', end: '2026-06-05', areas: ['MT'], mode: 'add' }] };
    const state = twelveHourStateFor('2026-06-03', ayConf);
    expect(state.addAreas.has('MT')).toBe(true);
    expect(state.replaceAreas.has('MT')).toBe(false);
  });

  it('a date outside every window range gets neither', () => {
    const ayConf = { twelveHourWindows: [{ start: '2026-06-01', end: '2026-06-05', areas: ['POD'], mode: 'replace' }] };
    const state = twelveHourStateFor('2026-07-01', ayConf);
    expect(state.replaceAreas.size).toBe(0);
    expect(state.addAreas.size).toBe(0);
  });

  it('overlapping windows on the same area/date: replace beats add regardless of order', () => {
    const replaceFirst = {
      twelveHourWindows: [
        { start: '2026-06-01', end: '2026-06-10', areas: ['POD'], mode: 'replace' },
        { start: '2026-06-03', end: '2026-06-07', areas: ['POD'], mode: 'add' },
      ],
    };
    const addFirst = {
      twelveHourWindows: [
        { start: '2026-06-03', end: '2026-06-07', areas: ['POD'], mode: 'add' },
        { start: '2026-06-01', end: '2026-06-10', areas: ['POD'], mode: 'replace' },
      ],
    };
    for (const ayConf of [replaceFirst, addFirst]) {
      const state = twelveHourStateFor('2026-06-05', ayConf);
      expect(state.replaceAreas.has('POD')).toBe(true);
      expect(state.addAreas.has('POD')).toBe(false);
    }
  });

  it('per-window coverage override merges into covOverride, later windows win', () => {
    const ayConf = {
      twelveHourWindows: [
        { start: '2026-06-01', end: '2026-06-10', areas: ['POD'], coverage: { 'POD-D12': { min: 1, max: 1 } } },
        { start: '2026-06-03', end: '2026-06-07', areas: ['POD'], coverage: { 'POD-D12': { min: 3, max: 3 } } },
      ],
    };
    const state = twelveHourStateFor('2026-06-05', ayConf);
    expect(state.covOverride['POD-D12']).toEqual({ min: 3, max: 3 });
  });
});

describe('getCoverageFor: per-window coverage override wins over the global chief map', () => {
  it('uses the window\'s own coverage override instead of the global res_coverage entry', () => {
    const ayConf = {
      twelveHourWindows: [
        { start: '2026-06-01', end: '2026-06-10', areas: ['POD'], coverage: { 'POD-D12': { min: 5, max: 5 } } },
      ],
    };
    const state = twelveHourStateFor('2026-06-05', ayConf);
    const globalCoverage = { 'POD-D12': { min: 1, max: 1 } };
    expect(getCoverageFor('POD-D12', globalCoverage, undefined, state)).toEqual({ min: 5, max: 5 });
  });
});

describe('getCoverageFor: add-mode does not demand both normal and 12h minimums, and defaults to {0,0}', () => {
  it('a 12h id under an add window with no override falls to {0,0}, not DEFAULT_COVERAGE', () => {
    const ayConf = { twelveHourWindows: [{ start: '2026-06-01', end: '2026-06-10', areas: ['POD'], mode: 'add' }] };
    const state = twelveHourStateFor('2026-06-05', ayConf);
    expect(getCoverageFor('POD-D12', {}, undefined, state)).toEqual({ min: 0, max: 0 });
  });

  it('the normal id stays at its own base coverage (untouched) under an add window', () => {
    const ayConf = { twelveHourWindows: [{ start: '2026-06-01', end: '2026-06-10', areas: ['POD'], mode: 'add' }] };
    const state = twelveHourStateFor('2026-06-05', ayConf);
    expect(getCoverageFor('POD-D', {}, undefined, state)).toEqual(DEFAULT_COVERAGE['POD-D']);
  });
});

describe('getCoverageFor: global 12h opt-in survives an add-mode PED window (chain-ordering regression guard)', () => {
  it('a global PED-D12 {1,1} chief override still applies inside an add-mode PED window', () => {
    const ayConf = { twelveHourWindows: [{ start: '2026-06-01', end: '2026-06-10', areas: ['PED'], mode: 'add' }] };
    const state = twelveHourStateFor('2026-06-05', ayConf);
    const globalCoverage = { 'PED-D12': { min: 1, max: 1 } };
    expect(getCoverageFor('PED-D12', globalCoverage, undefined, state)).toEqual({ min: 1, max: 1 });
  });
});

describe('getCoverageFor + twelveHourAllows: PED-D12/PED-N12 year-round opt-in', () => {
  it('PED-D12/PED-N12 stay available with NO PED window (falls through to base/DEFAULT_COVERAGE path)', () => {
    const state = twelveHourStateFor('2026-06-05', {}); // no windows at all
    expect(twelveHourAllows('PED-D12', state)).toBe(true);
    expect(twelveHourAllows('PED-N12', state)).toBe(true);
    // coverage is {0,0} by DEFAULT_COVERAGE_MINMAX's own explicit opt-in-only default, but a chief
    // override still applies via the untouched base path (this is the "opt-in" itself).
    expect(getCoverageFor('PED-D12', { 'PED-D12': { min: 1, max: 1 } }, undefined, state)).toEqual({ min: 1, max: 1 });
    expect(getCoverageFor('PED-D12', {}, undefined, state)).toEqual({ min: 0, max: 0 });
  });

  it('POD-D12 (unlike PED-D12) is NOT available with no POD window', () => {
    const state = twelveHourStateFor('2026-06-05', {});
    expect(twelveHourAllows('POD-D12', state)).toBe(false);
    expect(getCoverageFor('POD-D12', { 'POD-D12': { min: 1, max: 1 } }, undefined, state)).toEqual({ min: 0, max: 0 });
  });
});

describe('twelveHourAllows', () => {
  const noWindowState = twelveHourStateFor('2026-06-05', {});

  it('normal id with no active replace window -> true', () => {
    expect(twelveHourAllows('POD-D', noWindowState)).toBe(true);
  });

  it('normal id whose area is under a replace window -> false', () => {
    const ayConf = { twelveHourWindows: [{ start: '2026-06-01', end: '2026-06-10', areas: ['POD'] }] };
    const state = twelveHourStateFor('2026-06-05', ayConf);
    expect(twelveHourAllows('POD-D', state)).toBe(false);
  });

  it('normal id whose area is under an add window (not replace) -> still true', () => {
    const ayConf = { twelveHourWindows: [{ start: '2026-06-01', end: '2026-06-10', areas: ['POD'], mode: 'add' }] };
    const state = twelveHourStateFor('2026-06-05', ayConf);
    expect(twelveHourAllows('POD-D', state)).toBe(true);
  });

  it('12h id whose area is in replaceAreas -> true', () => {
    const ayConf = { twelveHourWindows: [{ start: '2026-06-01', end: '2026-06-10', areas: ['MT'] }] };
    const state = twelveHourStateFor('2026-06-05', ayConf);
    expect(twelveHourAllows('MT-D12', state)).toBe(true);
  });

  it('12h id whose area is in addAreas -> true', () => {
    const ayConf = { twelveHourWindows: [{ start: '2026-06-01', end: '2026-06-10', areas: ['FLEX'], mode: 'add' }] };
    const state = twelveHourStateFor('2026-06-05', ayConf);
    expect(twelveHourAllows('FLEX-N12', state)).toBe(true);
  });

  it('12h id whose area is in neither -> false, except PED-D12/PED-N12', () => {
    expect(twelveHourAllows('POD-D12', noWindowState)).toBe(false);
    expect(twelveHourAllows('MT-N12', noWindowState)).toBe(false);
    expect(twelveHourAllows('FLEX-D12', noWindowState)).toBe(false);
    expect(twelveHourAllows('PED-D12', noWindowState)).toBe(true);
    expect(twelveHourAllows('PED-N12', noWindowState)).toBe(true);
  });

  it('every other shift (e.g. TRAUMA-D, PED-S) -> true', () => {
    expect(twelveHourAllows('TRAUMA-D', noWindowState)).toBe(true);
    expect(twelveHourAllows('PED-S', noWindowState)).toBe(true);
  });
});

describe('getCoverageFor: dow max-raise still applies through the 12h resolution chain', () => {
  it('does not accidentally apply POD_D\'s dow bump to a 12h id (no DOW_COVERAGE_MAX_OVERRIDE entry for POD-D12)', () => {
    const ayConf = { twelveHourWindows: [{ start: '2026-06-01', end: '2026-06-10', areas: ['POD'] }] }; // a Monday
    const mondayDs = '2026-06-01'; // confirm this is dow-agnostic since POD-D12 has no override entry
    const state = twelveHourStateFor(mondayDs, ayConf);
    expect(DOW_COVERAGE_MAX_OVERRIDE['POD-D12']).toBeUndefined();
    expect(getCoverageFor('POD-D12', {}, 1, state)).toEqual(DEFAULT_COVERAGE['POD-D12']);
  });
});

describe('getCoverageFor: state undefined vs state defined', () => {
  it('state undefined ignores 12h/window logic entirely -- a 12h id resolves to its own DEFAULT_COVERAGE', () => {
    expect(getCoverageFor('POD-D12', {})).toEqual(DEFAULT_COVERAGE['POD-D12']);
    expect(getCoverageFor('FLEX-N12', {})).toEqual(DEFAULT_COVERAGE['FLEX-N12']);
  });
});
