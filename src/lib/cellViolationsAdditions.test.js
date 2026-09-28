/** @vitest-environment jsdom */
// src/lib/cellViolationsAdditions.test.js
// R2 (rule-policy plan, 2026-09-26): cellViolations used to be silent on several hard/override-tier
// rules the generator and validateAll already enforce — a chief could hand-place a violation through
// the picker/drag-drop/inspector and only find out from validateAll afterward. These tests hit
// cellViolations directly (exported alongside the other generator-core helpers) with a hand-built
// `row`/`block.schedule` that already sits AT the relevant cap, then ask it to add one more shift —
// mirroring grRestRules.test.js/traumaRunCap.test.js's own "hand-built schedule" pattern.
import { describe, it, expect } from 'vitest';
import { cellViolations, eligibilityBlockReasons } from '../ResidentScheduler.jsx';

function res(overrides) {
  return {
    id: overrides.id, firstName: overrides.firstName ?? 'Test', lastName: 'Resident',
    category: overrides.category, pgy: overrides.pgy, blockType: overrides.blockType,
    chiefRole: overrides.chiefRole ?? null,
    approvedDatesOff: overrides.approvedDatesOff ?? [], vacationDates: overrides.vacationDates ?? [],
    jeopardyDates: [], jcPresentDates: [], grLectureDates: [],
  };
}

const block = { id: 'blk', startDate: '2026-07-06', endDate: '2026-08-02', academicYear: 'AY26/27', specialDays: {} };

function ruleIds(vs) { return vs.map(v => v.rule).filter(Boolean); }

describe('cellViolations — R2 additions', () => {
  it('rolling 80h/4-week average: 27 pre-existing 12h shifts + one more flags rolling80h as an error', () => {
    const r1 = res({ id: 'r1', category: 'EM_HOME', pgy: 3, blockType: 'EM' });
    const row = {};
    // 27 consecutive-ish 12h shifts inside the block's own 28-day span — the check only reads
    // SHIFT_TIMING durations off whatever is already in `row`, so real per-shift eligibility of
    // these placeholder entries doesn't matter for this test.
    for (let i = 0; i < 27; i++) row[`2026-07-${String(6 + i).padStart(2, '0')}`] = 'TRAUMA-N';
    const b = { ...block, schedule: { r1: row } };
    const vs = cellViolations(r1, '2026-08-02', 'TRAUMA-N', b, {}, {}, {}, {});
    const rolling = vs.find(v => v.rule === 'rolling80h');
    expect(rolling).toBeTruthy();
    expect(rolling.level).toBe('error');
  });

  it('nights total per block: 6 existing nights + a 7th flags nightsTotalBlock as a warn (override tier)', () => {
    const r1 = res({ id: 'r1', category: 'EM_HOME', pgy: 2, blockType: 'EM' });
    const row = {};
    for (let i = 0; i < 6; i++) row[`2026-07-${String(6 + i).padStart(2, '0')}`] = 'PED-N';
    const b = { ...block, schedule: { r1: row } };
    const vs = cellViolations(r1, '2026-07-20', 'PED-N', b, {}, {}, {}, {});
    const v = vs.find(x => x.rule === 'nightsTotalBlock');
    expect(v).toBeTruthy();
    expect(v.level).toBe('warn');
  });

  it('night stint count: 2 existing separate stints + a 3rd flags nightStintCount as a warn', () => {
    const r1 = res({ id: 'r1', category: 'EM_HOME', pgy: 2, blockType: 'EM' });
    const row = { '2026-07-06': 'PED-N', '2026-07-07': 'PED-N', '2026-07-13': 'PED-N', '2026-07-14': 'PED-N' };
    const b = { ...block, schedule: { r1: row } };
    const vs = cellViolations(r1, '2026-07-20', 'PED-N', b, {}, {}, {}, {});
    const v = vs.find(x => x.rule === 'nightStintCount');
    expect(v).toBeTruthy();
    expect(v.level).toBe('warn');
  });

  it('trauma-run cap: 2 existing contiguous TRAUMA-N + a 3rd flags traumaRunCap as a warn (not an error)', () => {
    const r1 = res({ id: 'r1', category: 'EM_HOME', pgy: 2, blockType: 'EM' });
    // 07-04/05 Sat/Sun are inside TRAUMA-N's own SHIFT_DOW window (0,1,5,6); 07-06 (Mon) isn't, but
    // this check only reads adjacency, never re-validates SHIFT_DOW on the hypothetical placement.
    const row = { '2026-07-04': 'TRAUMA-N', '2026-07-05': 'TRAUMA-N' };
    const b = { ...block, startDate: '2026-07-04', schedule: { r1: row } };
    const vs = cellViolations(r1, '2026-07-06', 'TRAUMA-N', b, {}, {}, {}, {});
    const v = vs.find(x => x.rule === 'traumaRunCap');
    expect(v).toBeTruthy();
    expect(v.level).toBe('warn');
  });

  it('POD PGY-3 composition: placing a PGY-2 alone on POD with no PGY-3 present flags podPgy3Composition as a warn', () => {
    const pgy2 = res({ id: 'p2', category: 'EM_HOME', pgy: 2, blockType: 'EM' });
    const b = { ...block, schedule: { p2: {} } };
    // 2026-07-09 is a Thursday inside the fixture block, clear of any Wellness Wednesday.
    const vs = cellViolations(pgy2, '2026-07-09', 'POD-E', b, {}, {}, {}, {}, {}, null, {}, [pgy2]);
    const v = vs.find(x => x.rule === 'podPgy3Composition');
    expect(v).toBeTruthy();
    expect(v.level).toBe('warn');
  });

  it('POD PGY-3 composition: raises nothing when a PGY-3 is already on the same shift/date', () => {
    const pgy2 = res({ id: 'p2', category: 'EM_HOME', pgy: 2, blockType: 'EM' });
    const pgy3 = res({ id: 'p3', category: 'EM_HOME', pgy: 3, blockType: 'EM' });
    const b = { ...block, schedule: { p2: {}, p3: { '2026-07-09': 'POD-E' } } };
    const vs = cellViolations(pgy2, '2026-07-09', 'POD-E', b, {}, {}, {}, {}, {}, null, {}, [pgy2, pgy3]);
    expect(vs.some(x => x.rule === 'podPgy3Composition')).toBe(false);
  });

  it('BAMC Wednesday-night cap: a 2nd Wednesday-night shift flags bamcWedNight as an error (program tier)', () => {
    const bamc = res({ id: 'b1', category: 'EM_BAMC', pgy: 1, blockType: 'EM' });
    const row = { '2026-07-08': 'PED-N' }; // 1st Wednesday
    const b = { ...block, schedule: { b1: row } };
    const vs = cellViolations(bamc, '2026-07-15', 'PED-N', b, {}, {}, {}, {}); // 2nd Wednesday
    const v = vs.find(x => x.rule === 'bamcWedNight');
    expect(v).toBeTruthy();
    expect(v.level).toBe('error');
  });

  it('Trauma/Peds split: exceeding the trauma sub-cap (8) flags traumaPedsSplit as an error', () => {
    const r1 = res({ id: 'r1', category: 'EM_HOME', pgy: 2, blockType: 'TRAUMA_PEDS' });
    const row = {};
    // 8 TRAUMA-area shifts already on file (TRAUMA_PEDS_SPLIT.trauma === 8) — a 9th tips it over.
    const traumaDates = ['2026-07-04', '2026-07-05', '2026-07-11', '2026-07-12', '2026-07-18', '2026-07-19', '2026-07-25', '2026-07-26'];
    for (const ds of traumaDates) row[ds] = 'TRAUMA-D';
    const b = { ...block, schedule: { r1: row } };
    const vs = cellViolations(r1, '2026-08-01', 'TRAUMA-D', b, {}, {}, {}, {});
    const v = vs.find(x => x.rule === 'traumaPedsSplit');
    expect(v).toBeTruthy();
    expect(v.level).toBe('error');
  });

  it('Journal Club cap: a 4th JC-overlapping shift on an AY26/27 JC date flags jcMaxPerAy as an error', () => {
    const r1 = res({ id: 'r1', category: 'EM_HOME', pgy: 2, blockType: 'EM' });
    const jcDates = ['2026-07-07', '2026-07-14', '2026-07-21', '2026-07-28'];
    const row = { [jcDates[0]]: 'POD-E', [jcDates[1]]: 'POD-E', [jcDates[2]]: 'POD-E' }; // 3 already worked
    const b = { ...block, schedule: { r1: row } };
    const ayConf = { jcDates };
    const vs = cellViolations(r1, jcDates[3], 'POD-E', b, {}, {}, {}, ayConf, {}, null, {}, [r1], []);
    const v = vs.find(x => x.rule === 'jcMaxPerAy');
    expect(v).toBeTruthy();
    expect(v.level).toBe('error');
  });

  it('no false positive: an ordinary placement well clear of every cap raises none of the new rule ids', () => {
    const r1 = res({ id: 'r1', category: 'EM_HOME', pgy: 3, blockType: 'EM' });
    const b = { ...block, schedule: { r1: {} } };
    const vs = cellViolations(r1, '2026-07-09', 'TRAUMA-D', b, {}, {}, {}, {}, {}, null, {}, [r1], []);
    const newRuleIds = ['rolling80h', 'nightsTotalBlock', 'nightStintCount', 'traumaRunCap', 'podPgy3Composition', 'flexSeniorComposition', 'bamcWedNight', 'traumaPedsSplit', 'jcMaxPerAy'];
    expect(ruleIds(vs).filter(r => newRuleIds.includes(r))).toEqual([]);
  });
});

describe('cellViolations — R3/R4 additions (2026-09-26 policy, ACGME 6.17.a + jeopardy window)', () => {
  it('rest >= shift length (restShiftLength): FLEX-E ending 23:00 Tue then POD-D starting 07:00 Wed is only an 8h gap — blocked', () => {
    const r1 = res({ id: 'r1', category: 'EM_HOME', pgy: 2, blockType: 'EM' });
    const row = { '2026-07-07': 'FLEX-E' }; // Tue 14:00-23:00
    const b = { ...block, schedule: { r1: row } };
    const vs = cellViolations(r1, '2026-07-08', 'POD-D', b, {}, {}, {}, {}); // Wed 07:00
    const v = vs.find(x => x.rule === 'restShiftLength');
    expect(v).toBeTruthy();
    expect(v.level).toBe('error');
  });

  it('rest >= shift length: the same FLEX-E then PED-S starting 11:00 Wed is a 12h gap — clears the 9h requirement, no violation', () => {
    const r1 = res({ id: 'r1', category: 'EM_HOME', pgy: 2, blockType: 'EM' });
    const row = { '2026-07-07': 'FLEX-E' };
    const b = { ...block, schedule: { r1: row } };
    const vs = cellViolations(r1, '2026-07-08', 'PED-S', b, {}, {}, {}, {});
    expect(vs.some(x => x.rule === 'restShiftLength')).toBe(false);
  });

  it('rest >= shift length, Grand Rounds adjustment: POD-N ending 08:00 Wed (this resident\'s GR day) then PED-N at 19:00 same day clears 08:00+9h but NOT Grand-Rounds-end(12:00)+9h — blocked', () => {
    const r1 = res({ id: 'r1', category: 'EM_HOME', pgy: 2, blockType: 'EM' });
    const row = { '2026-07-07': 'POD-N' }; // Tue 23:00 -> Wed 08:00
    const b = { ...block, schedule: { r1: row } };
    const vs = cellViolations(r1, '2026-07-08', 'PED-N', b, {}, {}, {}, {}); // Wed 19:00
    const v = vs.find(x => x.rule === 'restShiftLength');
    expect(v).toBeTruthy();
    expect(v.level).toBe('error');
    expect(v.message).toMatch(/Grand Rounds/);
  });

  it('ACGME weekly caps (edWeekly60/totalWeekly72): 6 existing 12h Trauma Days + Grand Rounds inside one rolling week breaches both', () => {
    const r1 = res({ id: 'r1', category: 'EM_HOME', pgy: 2, blockType: 'EM' });
    const row = {};
    // 07-06,07,09,10,11,12 (skipping Wed 07-08, this resident's GR day) — 6 * 12h = 72 ED hours;
    // + Grand Rounds (4h) on the skipped Wednesday = 76 total, inside the 07-06..07-12 window.
    for (const ds of ['2026-07-06', '2026-07-07', '2026-07-09', '2026-07-10', '2026-07-11']) row[ds] = 'TRAUMA-D';
    const b = { ...block, schedule: { r1: row } };
    const vs = cellViolations(r1, '2026-07-12', 'TRAUMA-D', b, {}, {}, {}, {});
    const ed = vs.find(x => x.rule === 'edWeekly60');
    const total = vs.find(x => x.rule === 'totalWeekly72');
    expect(ed).toBeTruthy();
    expect(ed.level).toBe('error');
    expect(total).toBeTruthy();
    expect(total.level).toBe('error');
  });

  it('ACGME weekly caps: an off-service (non-schedulable) resident is exempt — only the 80h/4wk rule applies to them', () => {
    const r1 = res({ id: 'r1', category: 'EM_HOME', pgy: 2, blockType: 'METRO' }); // METRO = non-schedulable
    const row = {};
    for (const ds of ['2026-07-06', '2026-07-07', '2026-07-09', '2026-07-10', '2026-07-11']) row[ds] = 'TRAUMA-D';
    const b = { ...block, schedule: { r1: row } };
    const vs = cellViolations(r1, '2026-07-12', 'TRAUMA-D', b, {}, {}, {}, {});
    expect(vs.some(x => x.rule === 'edWeekly60' || x.rule === 'totalWeekly72')).toBe(false);
  });

  it('jeopardy window: an overnight (POD-N) starting the day before a jeopardy call, running past 07:00 into it, is blocked', () => {
    const r1 = res({ id: 'r1', category: 'EM_HOME', pgy: 2, blockType: 'EM' });
    const b = { ...block, schedule: { r1: {} }, jeopardySchedule: { pgy1: {}, pgy2: { '2026-07-08': 'r1' }, pgy3: {} } };
    const vs = cellViolations(r1, '2026-07-07', 'POD-N', b, {}, { jeopardyPolicy: 'warn' }, {}, {});
    const v = vs.find(x => x.rule === 'jeopardyWindow');
    expect(v).toBeTruthy();
    expect(v.level).toBe('error');
  });

  it('jeopardy window: the same overnight-the-day-before as PED-N (clears the 07:00 window) is NOT blocked by the window rule', () => {
    const r1 = res({ id: 'r1', category: 'EM_HOME', pgy: 2, blockType: 'EM' });
    const b = { ...block, schedule: { r1: {} }, jeopardySchedule: { pgy1: {}, pgy2: { '2026-07-08': 'r1' }, pgy3: {} } };
    const vs = cellViolations(r1, '2026-07-07', 'PED-N', b, {}, { jeopardyPolicy: 'warn' }, {}, {});
    expect(vs.some(x => x.rule === 'jeopardyWindow')).toBe(false);
  });

  it('jeopardy window: policy "off" is a full escape hatch, same as the existing jeopardyCollision rule', () => {
    const r1 = res({ id: 'r1', category: 'EM_HOME', pgy: 2, blockType: 'EM' });
    const b = { ...block, schedule: { r1: {} }, jeopardySchedule: { pgy1: {}, pgy2: { '2026-07-08': 'r1' }, pgy3: {} } };
    const vs = cellViolations(r1, '2026-07-07', 'POD-N', b, {}, { jeopardyPolicy: 'off' }, {}, {});
    expect(vs.some(x => x.rule === 'jeopardyWindow')).toBe(false);
  });

  it('no false positive: an ordinary placement well clear of every R3/R4 cap raises none of the new rule ids', () => {
    const r1 = res({ id: 'r1', category: 'EM_HOME', pgy: 3, blockType: 'EM' });
    const b = { ...block, schedule: { r1: {} } };
    const vs = cellViolations(r1, '2026-07-09', 'TRAUMA-D', b, {}, {}, {}, {}, {}, null, {}, [r1], []);
    const newRuleIds = ['restShiftLength', 'edWeekly60', 'totalWeekly72', 'jeopardyWindow'];
    expect(ruleIds(vs).filter(r => newRuleIds.includes(r))).toEqual([]);
  });
});

describe('eligibilityBlockReasons', () => {
  it('returns null when the shift IS eligible', () => {
    const r1 = res({ id: 'r1', category: 'EM_HOME', pgy: 3, blockType: 'EM' });
    expect(eligibilityBlockReasons(r1, '2026-07-09', 'POD-E', { blockStart: '2026-07-06' })).toBeNull();
  });

  it('vacation is tier acgme', () => {
    const r1 = res({ id: 'r1', category: 'EM_HOME', pgy: 3, blockType: 'EM', vacationDates: ['2026-07-09'] });
    const reason = eligibilityBlockReasons(r1, '2026-07-09', 'POD-E', { blockStart: '2026-07-06' });
    expect(reason).toMatchObject({ rule: 'vacation', tier: 'acgme' });
  });

  it('approved day off is tier override', () => {
    const r1 = res({ id: 'r1', category: 'EM_HOME', pgy: 3, blockType: 'EM', approvedDatesOff: ['2026-07-09'] });
    const reason = eligibilityBlockReasons(r1, '2026-07-09', 'POD-E', { blockStart: '2026-07-06' });
    expect(reason).toMatchObject({ rule: 'approvedDayOff', tier: 'override' });
  });

  it('academic chief Tuesday evening/night is tier override', () => {
    const r1 = res({ id: 'r1', category: 'EM_HOME', pgy: 3, blockType: 'EM', chiefRole: 'academic' });
    // 2026-07-07 is a Tuesday inside the fixture block.
    const reason = eligibilityBlockReasons(r1, '2026-07-07', 'POD-N', { blockStart: '2026-07-06' });
    expect(reason).toMatchObject({ rule: 'academicChiefTueEveNight', tier: 'override' });
  });
});

// 2026-09-27 fix: validateAll/cellViolations used to pick the eligibility MESSAGE independently
// (checking WW before a work restriction) while grading SEVERITY off eligibilityBlockReasons
// (which checks the restriction first) — a cell with both could show an override-tier WW message
// while being graded as a hard-blocking restriction with no override path. Both surfaces now derive
// the message from eligibilityBlockReasons' own result, so message and severity always agree.
describe('eligibility message/severity consistency (2026-09-27 fix)', () => {
  const pgy3 = res({ id: 'p3', category: 'EM_HOME', pgy: 3, blockType: 'EM' });
  const POD_WW = '2026-07-22'; // POD's own (3rd) Wellness Wednesday inside `block`'s window (see
                               // seniorityTargets.test.js/emCompositionAndPgyGating.test.js).

  it('a custom restriction that actually bars the shift wins over WW: error, restriction message, no override path', () => {
    const restricted = { ...pgy3, workRestrictions: [{ label: 'No Days', blockedTypes: ['day'] }] };
    const b = { ...block, schedule: { p3: {} } };
    const vs = cellViolations(restricted, POD_WW, 'POD-D', b, {}, {}, {}, {});
    const v = vs.find(x => /Work restriction/.test(x.message));
    expect(v).toBeTruthy();
    expect(v.level).toBe('error');
    expect(v.message).toBe('Work restriction "No Days" blocks this shift on this date');
    expect(v.message).not.toMatch(/Wellness Wednesday/);
  });

  it('WW alone (no restriction) stays override-tier: warn with the WW message', () => {
    const b = { ...block, schedule: { p3: {} } };
    const vs = cellViolations(pgy3, POD_WW, 'POD-D', b, {}, {}, {}, {});
    const v = vs.find(x => x.rule === 'wellnessWednesday');
    expect(v).toBeTruthy();
    expect(v.level).toBe('warn');
    expect(v.message).toMatch(/Wellness Wednesday/);
  });
});
