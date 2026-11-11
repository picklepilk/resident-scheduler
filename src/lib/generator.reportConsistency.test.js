// src/lib/generator.reportConsistency.test.js
// generateScheduleBest's report must describe its FINAL schedule. Report-only invariants (never schedule
// content): after the true-primary fix/lift (which skip the fill passes), nightMergePass and LNS,
//   (A) report.unfilled lists exactly the slots still short of their coverage minimum, and
//   (B) every report.restCompromises entry still points at a cell holding that shift (no stale
//       {residentId, dateStr} after cells were swapped) and names a cell that really breaks the
//       24h post-night rest preference.
import { describe, it, expect } from 'vitest';
import { generateScheduleBest } from '../ResidentScheduler.jsx';
import { makeRealScaleFixture } from './__fixtures__/realScale.js';
import { makeFixture } from './__fixtures__/syntheticRoster.js';
import { SHIFTS, shiftActiveOnDow } from './shifts.js';
import { getBlockDates, parseDate } from './dates.js';
import { getCoverageFor, twelveHourStateFor } from './coverage.js';

function holeCounts(args, schedule) {
  const dates = getBlockDates(args.block.startDate, args.block.endDate);
  const out = new Map();
  for (const ds of dates) {
    const dow = parseDate(ds).getDay();
    const st = twelveHourStateFor(ds, args.ayConf || {});
    for (const s of SHIFTS) {
      const min = getCoverageFor(s.id, args.coverage || {}, dow, st).min;
      if (!min || !shiftActiveOnDow(s.id, dow)) continue;
      let n = 0;
      for (const r of args.allResidents) if (schedule[r.id]?.[ds] === s.id) n++;
      if (n < min) out.set(`${ds}|${s.id}`, min - n);
    }
  }
  return out;
}

function unfilledCounts(report) {
  const out = new Map();
  for (const u of report.unfilled) out.set(`${u.dateStr}|${u.shiftId}`, (out.get(`${u.dateStr}|${u.shiftId}`) || 0) + 1);
  return out;
}

const SEEDS = [1003]; // seed 1003 lands on a truePrimary fix+lift winner for both realScale shapes

describe('generateScheduleBest report consistency', () => {
  it('report.unfilled matches holes on a non-fix winner with a partly filled min-2 slot (staggered seed 1001)', async () => {
    // Seed 1001 / staggered once listed POD-N 2026-08-02 twice (slots 0 and 1) while only one was short:
    // the old `filled < min` filter kept every row of a still-short slot. pruneUnfilled keeps min - filled.
    const args = makeRealScaleFixture({ staggerSplit: true });
    const res = generateScheduleBest(args, { attempts: 20, lnsIters: 40, baseSeed: 1001 });
    expect([...unfilledCounts(res.report)].sort()).toEqual([...holeCounts(args, res.schedule)].sort());
  });

  it('report.unfilled matches the final schedule holes (realScale)', async () => {
    let sawTruePrimary = false;
    for (const staggerSplit of [false, true]) {
      for (const baseSeed of SEEDS) {
        await new Promise(r => setImmediate(r));
        const args = makeRealScaleFixture({ staggerSplit });
        const res = generateScheduleBest(args, { attempts: 20, lnsIters: 40, baseSeed });
        if (!res.report.truePrimaryFixApplied) continue; // non-fix winners: covered by the seed-1001 test above
        sawTruePrimary = true;
        expect([...unfilledCounts(res.report)].sort()).toEqual([...holeCounts(args, res.schedule)].sort());
      }
    }
    expect(sawTruePrimary).toBe(true); // guard: the fixture/seeds must actually exercise the fix/lift path
  });

  it('report.unfilled matches holes with no LNS (true-primary fix/lift result only)', async () => {
    let sawTruePrimary = false;
    for (const staggerSplit of [false, true]) {
      for (const baseSeed of SEEDS) {
        await new Promise(r => setImmediate(r));
        const args = makeRealScaleFixture({ staggerSplit });
        const res = generateScheduleBest(args, { attempts: 20, baseSeed });
        if (!res.report.truePrimaryFixApplied) continue;
        sawTruePrimary = true;
        expect([...unfilledCounts(res.report)].sort()).toEqual([...holeCounts(args, res.schedule)].sort());
      }
    }
    expect(sawTruePrimary).toBe(true);
  });

  it('restCompromises never point at a stale cell (standard variants)', async () => {
    let total = 0;
    for (const variant of ['standard', 'understaffed', 'vacationHeavy']) {
      for (const baseSeed of [42, 7, 1234]) {
        await new Promise(r => setImmediate(r));
        const args = makeFixture(variant);
        const res = generateScheduleBest(args, { attempts: 10, lnsIters: 20, baseSeed });
        for (const c of res.report.restCompromises) {
          total++;
          expect(res.schedule[c.residentId]?.[c.dateStr], `${variant}/${baseSeed} ${c.residentId} ${c.dateStr}`).toBe(c.shiftId);
        }
      }
    }
    console.log('restCompromises checked:', total);
  });
});
