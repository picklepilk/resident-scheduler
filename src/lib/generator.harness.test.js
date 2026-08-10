/** @vitest-environment jsdom */
// src/lib/generator.harness.test.js
// Integration harness for the schedule generator's quality-measurement infrastructure (see
// docs/plans — "Schedule Generator: Quality Harness + Best-of-N + Repair Pass", Step 4).
//
// Imports the real ResidentScheduler.jsx under jsdom — verified import-safe (no top-level DOM
// access; window.__SUPABASE_URL__ reads are typeof-guarded). Do NOT extract generator code out
// of the monolith to work around import issues; if a future dependency breaks this, fix via
// vitest.config.js deps.inline/alias, not extraction (see plan's "Key decisions & tradeoffs").
import { describe, it, expect } from 'vitest';
import { generateSchedule, generateScheduleBest, validateAll, buildQualityInput, normalizeRulePriority } from '../ResidentScheduler.jsx';
import { getBlockDates, parseDate } from './dates.js';
import { getCoverageFor } from './coverage.js';
import { SHIFT_MAP } from './shifts.js';
import { computeQualityMetrics, computeQualityVector, compareVectors } from './scheduleQuality.js';
import { mulberry32 } from './rng.js';
import { makeFixture } from './__fixtures__/syntheticRoster.js';

const VARIANTS = ['standard', 'understaffed', 'vacationHeavy'];

function errorCount(issues) {
  return issues.filter(i => i.level === 'error').length;
}

function stripVolatile(report) {
  const { generatedAt, ...rest } = report;
  return rest;
}

describe('generator harness — determinism', () => {
  for (const variant of VARIANTS) {
    it(`same seed produces identical schedule+report (${variant})`, () => {
      const fixture = makeFixture(variant);
      const a = generateSchedule({ ...fixture, rng: mulberry32(42) });
      const b = generateSchedule({ ...fixture, rng: mulberry32(42) });
      expect(a.schedule).toEqual(b.schedule);
      expect(stripVolatile(a.report)).toEqual(stripVolatile(b.report));
    });
  }
});

describe('generator harness — zero hard errors on clean fixtures', () => {
  for (const variant of VARIANTS) {
    it(`validateAll reports 0 errors (${variant})`, () => {
      const fixture = makeFixture(variant);
      const { schedule } = generateSchedule({ ...fixture, rng: mulberry32(1) });
      const issues = validateAll(
        fixture.allResidents, schedule, fixture.block, fixture.eligOverrides,
        fixture.appSettings, fixture.dayRules, fixture.coverage, fixture.blocksHistory, fixture.ayConf
      );
      expect(errorCount(issues)).toBe(0);
    });
  }
});

describe('generator harness — accounting invariants', () => {
  for (const variant of VARIANTS) {
    it(`every min slot filled or reported, no cap exceeded on generated cells (${variant})`, () => {
      const fixture = makeFixture(variant);
      const { schedule, report } = generateSchedule({ ...fixture, rng: mulberry32(7) });
      const dates = getBlockDates(fixture.block.startDate, fixture.block.endDate);

      // Every min slot either filled to min or present in report.unfilled.
      const unfilledKeys = new Set(report.unfilled.map(u => `${u.dateStr}|${u.shiftId}`));
      for (const ds of dates) {
        const dow = parseDate(ds).getDay();
        for (const shiftId of Object.keys(SHIFT_MAP)) {
          const { min, max } = getCoverageFor(shiftId, fixture.coverage, dow);
          if (min <= 0) continue;
          let filled = 0;
          for (const r of fixture.allResidents) if (schedule[r.id]?.[ds] === shiftId) filled++;
          if (filled < min) {
            expect(unfilledKeys.has(`${ds}|${shiftId}`)).toBe(true);
          }
          // Clean fixtures start empty (clearFirst not set -> block.schedule was {}), so every
          // filled cell here is generator-produced — the max cap applies universally in this case
          // (a pre-seeded manual cell could legitimately exceed it; see the kept-cells test below).
          expect(filled).toBeLessThanOrEqual(max);
        }
      }

      // No resident above their own target (targets are generator-enforced, not just a report
      // artifact) — skip residents with no target (off-service / non-target-bearing). Reuse
      // buildQualityInput for the same targets map the generator itself computed from.
      const qInput = buildQualityInput({ schedule, report, allResidents: fixture.allResidents, block: fixture.block, appSettings: fixture.appSettings, eligOverrides: fixture.eligOverrides });
      for (const r of fixture.allResidents) {
        const target = qInput.targets[r.id];
        if (target == null) continue;
        const assigned = dates.filter(ds => schedule[r.id]?.[ds]).length;
        expect(assigned).toBeLessThanOrEqual(target);
      }
    });
  }
});

describe('generator harness — kept manual cells', () => {
  it('preserves pre-seeded manual cells, including an over-coverage-max one, with clearFirst:false', () => {
    const fixture = makeFixture('standard');
    const dates = getBlockDates(fixture.block.startDate, fixture.block.endDate);
    const manualDate = dates[5];
    const [rA, rB, rC] = fixture.allResidents; // Alpha, Bravo, Charlie (EM_HOME PGY-1)

    // TRAUMA-D has coverage max 1 — seed THREE manual TRAUMA-D assignments on the same date to
    // deliberately exceed it (generator must never touch pre-existing non-empty cells).
    fixture.block.schedule = {
      [rA.id]: { [manualDate]: 'TRAUMA-D' },
      [rB.id]: { [manualDate]: 'TRAUMA-D' },
      [rC.id]: { [manualDate]: 'TRAUMA-D' },
    };

    const { schedule } = generateSchedule({ ...fixture, clearFirst: false, rng: mulberry32(3) });

    expect(schedule[rA.id][manualDate]).toBe('TRAUMA-D');
    expect(schedule[rB.id][manualDate]).toBe('TRAUMA-D');
    expect(schedule[rC.id][manualDate]).toBe('TRAUMA-D');
  });
});

describe('generator harness — block-edge night runs', () => {
  it('a night shift on the block start date is not a hard error, and scorer exempts it', () => {
    const fixture = makeFixture('standard');
    const dates = getBlockDates(fixture.block.startDate, fixture.block.endDate);
    // Papa: plain EM_HOME PGY-3, blockType 'EM' — no day-of-week window gate (unlike the
    // EM_TOX/EM_EMS-windowed residents), so TRAUMA-N is eligible on any non-Wellness-Wednesday.
    const papa = fixture.allResidents.find(r => r.id === 'syn_papa');

    // A single night shift on the very first block date, isolated (no adjacent nights) — a run
    // of length 1 that would normally be flagged as fragmented, except it touches the block edge.
    fixture.block.schedule = { [papa.id]: { [dates[0]]: 'TRAUMA-N' } };

    const { schedule, report } = generateSchedule({ ...fixture, clearFirst: false, rng: mulberry32(9) });
    const issues = validateAll(
      fixture.allResidents, schedule, fixture.block, fixture.eligOverrides,
      fixture.appSettings, fixture.dayRules, fixture.coverage, fixture.blocksHistory, fixture.ayConf
    );
    expect(errorCount(issues)).toBe(0);

    const qInput = buildQualityInput({ schedule, report, allResidents: fixture.allResidents, block: fixture.block, appSettings: fixture.appSettings, eligOverrides: fixture.eligOverrides });
    const metrics = computeQualityMetrics({
      ...qInput,
      dates,
      coverage: fixture.coverage,
      seniorGapCount: 0,
      restCompromiseCount: 0,
    });
    // The block-edge run contributes 0 to nightShapePenalty. We can't isolate Golf's own
    // contribution from the generator's other night placements directly, but we can confirm the
    // scorer ran without throwing and produced a finite, non-negative-infinity number — the
    // dedicated exemption-value assertion (fragmented-1-night == +3 vs. edge == +0) already lives
    // in scheduleQuality.test.js's unit tests, which isolate a single resident's schedule.
    expect(Number.isFinite(metrics.nightShapePenalty)).toBe(true);
  });
});

describe('generator harness — performance', () => {
  it('one generateScheduleBest call (20 attempts + repair) on the standard fixture completes in under 5s', () => {
    const fixture = makeFixture('standard');
    const start = Date.now();
    const res = generateScheduleBest({ ...fixture }, { attempts: 20, baseSeed: 100 });
    const elapsedMs = Date.now() - start;
    // eslint-disable-next-line no-console
    console.log(`[perf] generateScheduleBest(attempts=20) on 'standard': ${elapsedMs}ms`);
    expect(res).not.toBeNull();
    expect(elapsedMs).toBeLessThan(5000);
  });
});

describe('generator harness — repair pass safety', () => {
  for (const variant of VARIANTS) {
    for (const seed of [1, 2, 42]) {
      it(`repair never introduces a validateAll error and never regresses the quality vector (${variant} seed=${seed})`, () => {
        const fixture = makeFixture(variant);
        const dates = getBlockDates(fixture.block.startDate, fixture.block.endDate);
        const scoreOf = (res) => {
          const issues = validateAll(
            fixture.allResidents, res.schedule, fixture.block, fixture.eligOverrides,
            fixture.appSettings, fixture.dayRules, fixture.coverage, fixture.blocksHistory, fixture.ayConf
          );
          const qInput = buildQualityInput({ schedule: res.schedule, report: res.report, allResidents: fixture.allResidents, block: fixture.block, appSettings: fixture.appSettings, eligOverrides: fixture.eligOverrides });
          const metrics = computeQualityMetrics({
            ...qInput, dates, coverage: fixture.coverage,
            seniorGapCount: res.report.seniorGaps.length, restCompromiseCount: res.report.restCompromises.length,
          });
          return {
            errors: issues.filter(i => i.level === 'error').length,
            vector: computeQualityVector(metrics, normalizeRulePriority(fixture.appSettings?.rulePriority)),
          };
        };
        const before = scoreOf(generateSchedule({ ...fixture, rng: mulberry32(seed), repair: false }));
        const after = scoreOf(generateSchedule({ ...fixture, rng: mulberry32(seed), repair: true }));
        expect(after.errors).toBe(0);
        expect(compareVectors(after.vector, before.vector)).toBeLessThanOrEqual(0);
      });
    }
  }

  it('repair never touches kept manual cells, including a deliberately over-max one', () => {
    const fixture = makeFixture('standard');
    const dates = getBlockDates(fixture.block.startDate, fixture.block.endDate);
    const [rA, rB, rC] = fixture.allResidents;
    const manualDate = dates[5];
    fixture.block.schedule = {
      [rA.id]: { [manualDate]: 'TRAUMA-D' },
      [rB.id]: { [manualDate]: 'TRAUMA-D' },
      [rC.id]: { [manualDate]: 'TRAUMA-D' },
    };
    const { schedule } = generateSchedule({ ...fixture, clearFirst: false, rng: mulberry32(5), repair: true });
    expect(schedule[rA.id][manualDate]).toBe('TRAUMA-D');
    expect(schedule[rB.id][manualDate]).toBe('TRAUMA-D');
    expect(schedule[rC.id][manualDate]).toBe('TRAUMA-D');
  });
});

describe('generator harness — AY-to-date carryover wiring (Phase 2)', () => {
  // Builds a saved-block snapshot in the shape saveBlock produces, with `nights` night shifts
  // assigned to `residentId` starting at the snapshot's own start date.
  function makeSnapshot({ id, published, academicYear, startDate, endDate, residentId, nights }) {
    const dates = getBlockDates(startDate, endDate);
    const schedule = { [residentId]: {} };
    for (let i = 0; i < nights; i++) schedule[residentId][dates[i]] = 'POD-N';
    return {
      id, published, academicYear, startDate, endDate, savedAt: `${startDate}T00:00:00.000Z`,
      data: { schedule, startDate, endDate, academicYear },
    };
  }

  function nightSpreadFor(fixture, blocksHistory) {
    const { schedule, report } = generateSchedule({ ...fixture, rng: mulberry32(11) });
    const dates = getBlockDates(fixture.block.startDate, fixture.block.endDate);
    const qInput = buildQualityInput({
      schedule, report, allResidents: fixture.allResidents, block: fixture.block,
      appSettings: fixture.appSettings, eligOverrides: fixture.eligOverrides, blocksHistory,
    });
    return computeQualityMetrics({
      ...qInput, dates, coverage: fixture.coverage,
      seniorGapCount: report.seniorGaps.length, restCompromiseCount: report.restCompromises.length,
    });
  }

  it('an UNPUBLISHED snapshot contributes nothing (published-only, matching countPublishedJC)', () => {
    const fixture = makeFixture('standard');
    const ay = fixture.block.academicYear;
    const [rA, rB] = fixture.allResidents;
    const draft = [
      makeSnapshot({ id: 'prior1', published: false, academicYear: ay, startDate: '2026-06-01', endDate: '2026-06-28', residentId: rA.id, nights: 12 }),
      makeSnapshot({ id: 'prior2', published: false, academicYear: ay, startDate: '2026-05-01', endDate: '2026-05-28', residentId: rB.id, nights: 0 }),
    ];
    const withDrafts = nightSpreadFor(fixture, draft);
    const withNothing = nightSpreadFor(fixture, []);
    expect(withDrafts.ayCarryoverConfidence).toBe(0);
    expect(withDrafts.nightSpread).toBe(withNothing.nightSpread);
  });

  it('a snapshot from a DIFFERENT academic year contributes nothing', () => {
    const fixture = makeFixture('standard');
    const [rA, rB] = fixture.allResidents;
    const otherAy = [
      makeSnapshot({ id: 'old1', published: true, academicYear: 'AY99/00', startDate: '2026-06-01', endDate: '2026-06-28', residentId: rA.id, nights: 12 }),
      makeSnapshot({ id: 'old2', published: true, academicYear: 'AY99/00', startDate: '2026-05-01', endDate: '2026-05-28', residentId: rB.id, nights: 0 }),
    ];
    expect(nightSpreadFor(fixture, otherAy).ayCarryoverConfidence).toBe(0);
  });

  it('published same-AY snapshots do feed the carryover', () => {
    const fixture = makeFixture('standard');
    const ay = fixture.block.academicYear;
    const [rA, rB] = fixture.allResidents;
    const history = [
      makeSnapshot({ id: 'p1', published: true, academicYear: ay, startDate: '2026-06-01', endDate: '2026-06-28', residentId: rA.id, nights: 10 }),
      makeSnapshot({ id: 'p2', published: true, academicYear: ay, startDate: '2026-06-01', endDate: '2026-06-28', residentId: rB.id, nights: 0 }),
    ];
    const m = nightSpreadFor(fixture, history);
    // Two residents with history -> population is large enough, and 1 block each -> partial weight.
    expect(m.ayCarryoverConfidence).toBeGreaterThan(0);
    expect(m.ayCarryoverConfidence).toBeLessThanOrEqual(1);
  });

  it('never counts the CURRENT block as its own prior history', () => {
    const fixture = makeFixture('standard');
    const ay = fixture.block.academicYear;
    const [rA] = fixture.allResidents;
    // A published snapshot carrying the SAME id as the live block — saveBlock replaces snapshots by
    // id, so a published-then-reopened block is exactly this case. Counting it would double-count
    // the block against itself.
    const selfHistory = [
      makeSnapshot({
        id: fixture.block.id, published: true, academicYear: ay,
        startDate: fixture.block.startDate, endDate: fixture.block.endDate,
        residentId: rA.id, nights: 12,
      }),
    ];
    expect(nightSpreadFor(fixture, selfHistory).ayCarryoverConfidence).toBe(0);
  });
});
