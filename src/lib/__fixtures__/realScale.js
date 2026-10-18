// src/lib/__fixtures__/realScale.js
// Synthetic REAL-SCALE fixture (~58 residents, 28-day block) for the `realScale` baseline variant
// and scripts/bench-engines.mjs --fixture realScale.
//
// WHY: standard/understaffed/vacationHeavy/conferenceBlock are capacity-saturated (coverage miss
// 110-206) and `feasible` is nearly fully attainable (miss ~4), so none shows the gap seen on a real
// 58-resident block (local coverageMiss 23 vs CP-SAT proven bound 1). This fixture sits between:
// enough bodies that most minimums are attainable, enough partial-availability off-service
// rotators and vacations that the local greedy generator leaves headroom a better engine can close.
//
// PUBLIC REPO: all ids/names are synthetic (`R01`..`R58`, lastName 'Synthetic'). Deterministic:
// a fixed-seed PRNG drives every "random" choice, so the fixture is identical on every call.
//
// Chosen composition (tuned: a first draft with 28 EM_HOME + 22 off-service had local miss 2 =
// saturated the other way; thinning EM staff and leaning on partial-window rotators opened the gap):
//   EM_HOME  PGY1 x7 (3 on TRAUMA_PEDS), PGY2 x6 (1 EM_TOX, 1 EM_EMS), PGY3 x6 (2 chiefs)   = 19
//   EM_BAMC  PGY1 x3                                                                          =  3
//   FM       PGY1 x2 (day/eve/night PRN), PGY3 x2 (night-only)                                =  4
//   Off-service (partial windows: 50% one 5-10 day 'ranges' window, 40% 2-weekday 'days'
//   subset, 10% 'full'): PEDS-2 x4, PEDS-3 x2, IM-2 x8, NEURO-1 x6, ANES-1 x4, PSYCH-1 x4,
//   POD-1 x4                                                                                  = 32
//   Total 58. Vacations: 10 EM residents, 7-day windows spread over the block. One ACEP
//   conference window (2026-07-20..07-23) via ayConf. TRAUMA-D minimum waived (rotation-only,
//   as in the `feasible` variant) so it does not dominate the miss count.
// MEASURED HEADROOM (seed 42): local best-of-20 unfilled 37 (20 vs 100 attempts: 37 vs 37, so more
// restarts do not help); CP-SAT --bound-probe (30s) found coverageMiss 15, proven bound 0 (not
// closed in 30s). Local is >= 22 above what the solver demonstrably achieves.
import { parseDate, addDays, toDateStr } from '../dates.js';

const BLOCK_START = '2026-07-06';
const BLOCK_END = '2026-08-02';

function dateRange(startStr, endStr) {
  const out = [];
  let d = parseDate(startStr);
  const last = parseDate(endStr);
  while (d <= last) { out.push(toDateStr(d)); d = addDays(d, 1); }
  return out;
}

// mulberry32 (local copy: lib fixtures must stay import-light and deterministic)
function prng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const BLOCK_DATES = dateRange(BLOCK_START, BLOCK_END);

export function makeRealScaleFixture({ seed = 20260706 } = {}) {
  const rnd = prng(seed);
  const pick = n => Math.floor(rnd() * n);
  let counter = 0;
  const mk = o => {
    counter += 1;
    const tag = `R${String(counter).padStart(2, '0')}`;
    return {
      id: `syn_rs_${tag.toLowerCase()}`,
      firstName: tag,
      lastName: 'Synthetic',
      category: o.category,
      pgy: o.pgy,
      blockType: o.blockType ?? 'EM',
      isCCUNights: false,
      chiefRole: o.chiefRole ?? null,
      approvedDatesOff: [],
      vacationDates: o.vacationDates ?? [],
      jeopardyDates: [],
      jcPresentDates: o.jcPresentDates ?? [],
      grLectureDates: o.grLectureDates ?? [],
      availabilityMode: o.availabilityMode ?? 'full',
      availableRanges: o.availableRanges ?? [],
      canWorkDates: o.canWorkDates ?? [],
    };
  };

  const residents = [];
  const add = (n, o) => { for (let i = 0; i < n; i++) residents.push(mk(typeof o === 'function' ? o(i) : o)); };

  add(7, i => ({ category: 'EM_HOME', pgy: 1, blockType: i < 3 ? 'TRAUMA_PEDS' : 'EM' }));
  add(6, i => ({ category: 'EM_HOME', pgy: 2, blockType: i === 0 ? 'EM_TOX' : i === 1 ? 'EM_EMS' : 'EM' }));
  add(6, i => ({ category: 'EM_HOME', pgy: 3, chiefRole: i < 2 ? 'scheduling' : null }));
  add(3, { category: 'EM_BAMC', pgy: 1 });
  add(2, { category: 'FM', pgy: 1 });
  add(2, { category: 'FM', pgy: 3 });

  // Off-service: partial availability windows (the shape that creates real-block headroom).
  const offService = (cat, pgy, n) => add(n, () => {
    const kind = rnd();
    if (kind < 0.5) { // one contiguous range, 7-14 days
      const len = 5 + pick(6);
      const s = pick(BLOCK_DATES.length - len + 1);
      return { category: cat, pgy, availabilityMode: 'ranges', availableRanges: [{ start: BLOCK_DATES[s], end: BLOCK_DATES[s + len - 1] }] };
    }
    if (kind < 0.9) { // fixed weekday subset (3 weekdays)
      const dows = [[1, 3], [2, 5], [4, 6], [0, 3]][pick(4)];
      return { category: cat, pgy, availabilityMode: 'days', canWorkDates: BLOCK_DATES.filter(ds => dows.includes(parseDate(ds).getDay())) };
    }
    return { category: cat, pgy, availabilityMode: 'full' };
  });
  offService('PEDS', 2, 4);
  offService('PEDS', 3, 2);
  offService('IM', 2, 8);
  offService('NEURO', 1, 6);
  offService('ANES', 1, 4);
  offService('PSYCH', 1, 4);
  offService('POD', 1, 4);

  // Vacations: 7 EM residents (distinct), 7-day windows.
  const emIdx = residents.map((r, i) => (r.category === 'EM_HOME' || r.category === 'EM_BAMC') ? i : -1).filter(i => i >= 0);
  const vacIdx = new Set();
  while (vacIdx.size < 10) vacIdx.add(emIdx[pick(emIdx.length)]);
  for (const i of vacIdx) {
    const s = pick(BLOCK_DATES.length - 7 + 1);
    residents[i].vacationDates = BLOCK_DATES.slice(s, s + 7);
  }

  return {
    allResidents: residents,
    block: {
      id: 'blk_fixture_realScale',
      name: 'Synthetic Fixture - realScale',
      academicYear: 'AY26/27',
      startDate: BLOCK_START,
      endDate: BLOCK_END,
      emBlockAssignments: {},
      offServiceResidents: [],
      schedule: {},
      specialDays: { codeBlueDays: [], procDays: [], anesDays: [] },
      conferences: { acepStart: '', acepEnd: '', iteDate: '', aaemStart: '', aaemEnd: '', saemStart: '', saemEnd: '' },
    },
    coverage: { 'TRAUMA-D': { min: 0, max: 1 } },
    eligOverrides: {},
    appSettings: {},
    dayRules: {},
    blocksHistory: [],
    ayConf: { acepStart: '2026-07-20', acepEnd: '2026-07-23' },
  };
}
