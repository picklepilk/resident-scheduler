/** @vitest-environment jsdom */
// src/lib/generator.harness.test.js
// Integration harness for the schedule generator's quality-measurement infrastructure (see
// docs/plans — "Schedule Generator: Quality Harness + Best-of-N + Repair Pass", Step 4).
//
// Imports the real ResidentScheduler.jsx under jsdom — verified import-safe (no top-level DOM
// access; window.__SUPABASE_URL__ reads are typeof-guarded). Do NOT extract generator code out
// of the monolith to work around import issues; if a future dependency breaks this, fix via
// vitest.config.js deps.inline/alias, not extraction (see plan's "Key decisions & tradeoffs").
import { describe, it, expect, beforeAll } from 'vitest';
import { generateSchedule, generateScheduleBest, validateAll, buildQualityInput, normalizeRulePriority } from '../ResidentScheduler.jsx';
import { getBlockDates, parseDate } from './dates.js';
import { getCoverageFor, twelveHourStateFor } from './coverage.js';
import { SHIFT_MAP, SHIFT_DOW } from './shifts.js';
import { computeQualityMetrics, computeQualityVector, compareVectors } from './scheduleQuality.js';
import { mulberry32 } from './rng.js';
import { makeFixture } from './__fixtures__/syntheticRoster.js';

const VARIANTS = ['standard', 'understaffed', 'vacationHeavy'];

// Phase 1C ("1.9 Under-target enforcement in validateAll") made under-target EM Home/BAMC a hard
// error — deliberately, so an in-progress/incomplete schedule screams at export time. These small
// synthetic fixtures are NOT guaranteed to have enough coverage headroom for every resident to
// reach their own target from a single non-optimal seed with no repair (e.g. Golf/Hotel's
// EM_TOX/EM_EMS weekday-window blockTypes structurally cap their eligible days well below 19) —
// confirmed by inspection: every error these fixtures now produce is exactly an "Under target: "
// message, nothing else. The tests below therefore assert zero STRUCTURAL errors (ineligible
// shifts, composition, rest/circadian, coverage, etc.) rather than zero errors outright, so a
// genuine regression in any other rule still fails loudly.
function structuralErrorCount(issues) {
  return issues.filter(i => i.level === 'error' && !i.message.startsWith('Under target')).length;
}

function underTargetErrorCount(issues) {
  return issues.filter(i => i.level === 'error' && i.message.startsWith('Under target')).length;
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

describe('generator harness — zero hard STRUCTURAL errors on clean fixtures', () => {
  for (const variant of VARIANTS) {
    it(`validateAll reports 0 structural errors (${variant})`, () => {
      const fixture = makeFixture(variant);
      const { schedule } = generateSchedule({ ...fixture, rng: mulberry32(1) });
      const issues = validateAll(
        fixture.allResidents, schedule, fixture.block, fixture.eligOverrides,
        fixture.appSettings, fixture.dayRules, fixture.coverage, fixture.blocksHistory, fixture.ayConf
      );
      expect(structuralErrorCount(issues)).toBe(0);
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
        // 4th arg: resolve the same 12h-window state the generator saw for this date, or a 3-arg
        // call here would see e.g. POD-D12's phantom DEFAULT_COVERAGE minimum (min:2) even though
        // the generator (which does pass state) correctly resolved {0,0} for it — a spurious
        // "unfilled but not reported" failure across every 12h id x date once the generator's own
        // getCoverageFor calls carry ayConf/state (see coverage.js's state param contract).
        const twelveHourState = twelveHourStateFor(ds, fixture.ayConf);
        for (const shiftId of Object.keys(SHIFT_MAP)) {
          // A shift absent from SHIFT_DOW on this weekday doesn't exist at all today (e.g.
          // TRAUMA-D/TRAUMA-N's must-fill-only-on-these-days windows, PED-S's Mon/Tue/Thu/Fri) —
          // the generator's own fillDayPass skips it before ever considering it, so it never
          // produces a report.unfilled entry either. getCoverageFor itself is DOW-oblivious for
          // these ids (see coverage.test.js's own note on this), so this guard has to live here,
          // same as computeCoverageByDate/composeCoverage's own SHIFT_DOW check.
          if (SHIFT_DOW[shiftId] && !SHIFT_DOW[shiftId].includes(dow)) continue;
          const { min, max } = getCoverageFor(shiftId, fixture.coverage, dow, twelveHourState);
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
      const qInput = buildQualityInput({ schedule, report, allResidents: fixture.allResidents, block: fixture.block, appSettings: fixture.appSettings, eligOverrides: fixture.eligOverrides, ayConf: fixture.ayConf });
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
    expect(structuralErrorCount(issues)).toBe(0);

    const qInput = buildQualityInput({ schedule, report, allResidents: fixture.allResidents, block: fixture.block, appSettings: fixture.appSettings, eligOverrides: fixture.eligOverrides, ayConf: fixture.ayConf });
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
  // CATASTROPHE SMOKE TEST, NOT A BENCHMARK.
  //
  // Measures CPU TIME (process.cpuUsage delta, user+system), not wall clock. The quality baseline
  // is split into three per-variant files vitest runs in parallel workers (see baselineSuite.js),
  // and wall clock for this same call swings ~2.4s solo to ~6.3s under that load on a 16-core
  // machine. CPU time is contention-invariant (same work performed; the worker just waits longer
  // to be scheduled), so the bar can stay tight instead of the ~20s a wall-clock bar needs to
  // survive contention — which would let a 3x slowdown ship green. Do NOT switch back to
  // Date.now(). This does assume vitest's `pool: 'forks'`, now pinned in vitest.config.js —
  // process.cpuUsage is process-wide, so under `threads` it would sum the parallel baseline
  // workers too (measured: 12s, a hard failure that reads as a generator regression).
  //
  // 8000 is ~2.6x the measured single-threaded cost (~3.0s CPU) — headroom for a slower CPU while
  // still failing on an order-of-magnitude blowup (an accidental O(n^2), a runaway repair loop)
  // AND on a merely large one. The real number is printed below, so drift is visible in the log
  // even when it stays under the bar.
  const MAX_CPU_MS = 8000;

  // One shared generation for both tests below — this is the suite's single most expensive call,
  // and splitting the timing assertion from the shape assertions must not cost a second one.
  // No `attempts` override: this measures whatever default generateScheduleBest applies for
  // runGenerate/runPartialRegenerate, so a change to that default shows up here. (`baseSeed` IS
  // pinned, for reproducibility — production passes no options at all. baselineSuite.js pins
  // `attempts` too, deliberately; see the comment there.)
  let res;
  let cpuMs;
  beforeAll(() => {
    const fixture = makeFixture('standard');
    const startCpu = process.cpuUsage();
    res = generateScheduleBest({ ...fixture }, { baseSeed: 100 });
    const { user, system } = process.cpuUsage(startCpu);
    cpuMs = (user + system) / 1000;
    // eslint-disable-next-line no-console
    console.log(`[perf] generateScheduleBest(attempts=${res?.report?.attempts}) on 'standard': ${cpuMs.toFixed(0)}ms CPU (threshold ${MAX_CPU_MS}ms)`);
  });

  it(`one default-configuration generateScheduleBest call (+ repair) on the standard fixture stays under ${MAX_CPU_MS / 1000}s of CPU`, () => {
    expect(cpuMs).toBeLessThan(MAX_CPU_MS);
  });

  // Separate test, same call: otherwise the only thing seconds of CPU buys is a timing number, and
  // a generator that returned early with an unrepaired/undecorated result would read as green —
  // but a report-shape break must not be reported as a failure of the test named for the clock.
  it('returns a fully decorated result from that same call', () => {
    expect(res).not.toBeNull();
    expect(res.report.attempts).toBeGreaterThanOrEqual(1);
    expect(Number.isInteger(res.report.seed)).toBe(true);
    expect(Array.isArray(res.report.qualityVector)).toBe(true);
    expect(Object.keys(res.schedule).length).toBeGreaterThan(0);
  });
});

describe('generator harness — repair pass safety', () => {
  for (const variant of VARIANTS) {
    for (const seed of [1, 2, 42]) {
      it(`repair never introduces a validateAll error, never increases under-target errors, and never regresses the quality vector (${variant} seed=${seed})`, () => {
        const fixture = makeFixture(variant);
        const dates = getBlockDates(fixture.block.startDate, fixture.block.endDate);
        const scoreOf = (res) => {
          const issues = validateAll(
            fixture.allResidents, res.schedule, fixture.block, fixture.eligOverrides,
            fixture.appSettings, fixture.dayRules, fixture.coverage, fixture.blocksHistory, fixture.ayConf
          );
          const qInput = buildQualityInput({ schedule: res.schedule, report: res.report, allResidents: fixture.allResidents, block: fixture.block, appSettings: fixture.appSettings, eligOverrides: fixture.eligOverrides, ayConf: fixture.ayConf });
          const metrics = computeQualityMetrics({
            ...qInput, dates, coverage: fixture.coverage,
            seniorGapCount: res.report.seniorGaps.length, restCompromiseCount: res.report.restCompromises.length,
          });
          return {
            errors: structuralErrorCount(issues),
            underTargetErrors: underTargetErrorCount(issues),
            vector: computeQualityVector(metrics, normalizeRulePriority(fixture.appSettings?.rulePriority)),
          };
        };
        const before = scoreOf(generateSchedule({ ...fixture, rng: mulberry32(seed), repair: false }));
        const after = scoreOf(generateSchedule({ ...fixture, rng: mulberry32(seed), repair: true }));
        expect(after.errors).toBe(0);
        // Under-target ("Under target: n/target", EM Home/BAMC hard export-blocking floor, Phase
        // 1C) is intentionally NOT folded into `errors`/asserted at 0 above: these small synthetic
        // fixtures are not guaranteed enough coverage headroom for every resident to reach their
        // own target from a single non-optimal seed (module header comment, confirmed by
        // inspection), and repair's own moves are coverage/seniority-min-driven (Phase
        // 1: fill unfilled min-slots via reassignment/swap; Phase 2: rest-violator swap; Phase 3:
        // senior-gap swap) — none of them targets under-target counts directly, so a baseline
        // under-target count on these fixtures is a structural fixture property, not something
        // repair can be expected to zero out. What repair MUST NOT do is make it worse: a same-day
        // reassignment or cross-day swap that frees a "surplus" cell could, in principle, move a
        // shift off a resident who was already at/under their own target — this assertion is the
        // safety net for exactly that, on the same hard-export-blocking feature the exclusion above
        // would otherwise leave uncovered.
        expect(after.underTargetErrors).toBeLessThanOrEqual(before.underTargetErrors);
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
      ayConf: fixture.ayConf,
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

describe('generator harness — holiday wiring', () => {
  // The holiday model's headline safety property, end to end through the REAL generator rather
  // than through the scorer in isolation: with no holidays configured (the state of every block
  // that exists today, and of every committed baseline fixture), generation must be BIT-FOR-BIT
  // unchanged. If this ever fails, the committed quality baselines are silently invalid.
  for (const variant of VARIANTS) {
    it(`no holiday config produces a bit-for-bit identical schedule (${variant})`, () => {
      const fixture = makeFixture(variant);
      const plain = generateSchedule({ ...fixture, rng: mulberry32(7) });
      // Every "no holidays" spelling a persisted ayConf can actually take, including junk shapes a
      // hand-edited localStorage or an old JSON backup could produce.
      for (const holidays of [undefined, null, [], { notAnArray: true }, [null, { name: 'x' }]]) {
        const ayConf = { ...(fixture.ayConf || {}), holidays };
        const withEmpty = generateSchedule({ ...fixture, ayConf, rng: mulberry32(7) });
        expect(withEmpty.schedule).toEqual(plain.schedule);
        expect(stripVolatile(withEmpty.report)).toEqual(stripVolatile(plain.report));
      }
    });
  }

  it('holidayDates reach computeQualityMetrics through buildQualityInput', () => {
    // buildQualityInput is the only path production takes to the scorer, so the plumbing has to be
    // asserted there rather than by calling computeQualityMetrics with a hand-built holidayDates
    // array (which would pass even if nothing were wired).
    const fixture = makeFixture('standard');
    const dates = getBlockDates(fixture.block.startDate, fixture.block.endDate);
    const inBlock = [dates[3], dates[4]];
    const ayConf = {
      ...(fixture.ayConf || {}),
      holidays: [{ id: 'h1', name: 'Test Holiday', start: inBlock[0], end: inBlock[1] }],
    };
    const { schedule, report } = generateSchedule({ ...fixture, ayConf, rng: mulberry32(5) });

    const qInput = buildQualityInput({
      schedule, report, allResidents: fixture.allResidents, block: fixture.block,
      appSettings: fixture.appSettings, eligOverrides: fixture.eligOverrides,
      blocksHistory: [], ayConf,
    });
    expect(qInput.holidayDates).toEqual(inBlock);

    const withHolidays = computeQualityMetrics({
      ...qInput, dates, coverage: fixture.coverage,
      seniorGapCount: report.seniorGaps.length, restCompromiseCount: report.restCompromises.length,
    });
    // The fixture blocks are capacity-saturated, so these two dates are staffed by whoever is
    // available — the point here is only that the metric is LIVE (a real number derived from real
    // assignments), not that it happens to be nonzero.
    expect(Number.isFinite(withHolidays.holidaySpread)).toBe(true);
    expect(withHolidays.blockHolidaySpread).toBe(withHolidays.holidaySpread); // no history -> no blend

    // ...and with the same seed and no holiday config, the metric is exactly 0.
    const noneInput = buildQualityInput({
      schedule, report, allResidents: fixture.allResidents, block: fixture.block,
      appSettings: fixture.appSettings, eligOverrides: fixture.eligOverrides,
      blocksHistory: [], ayConf: {},
    });
    expect(noneInput.holidayDates).toEqual([]);
    expect(computeQualityMetrics({
      ...noneInput, dates, coverage: fixture.coverage,
      seniorGapCount: report.seniorGaps.length, restCompromiseCount: report.restCompromises.length,
    }).holidaySpread).toBe(0);
  });

  it('a PUBLISHED prior block\'s holiday work feeds the AY carryover totals', () => {
    // The sparse-data case holidays exist for: nothing in THIS block says who worked Thanksgiving,
    // so the only way the scorer can know is the published snapshot.
    const fixture = makeFixture('standard');
    const ay = fixture.block.academicYear;
    const [rA] = fixture.allResidents;
    const priorStart = '2026-06-01', priorEnd = '2026-06-28';
    const priorHoliday = '2026-06-05';
    const ayConf = {
      ...(fixture.ayConf || {}),
      holidays: [{ id: 'prior', name: 'Prior Holiday', start: priorHoliday, end: priorHoliday }],
    };
    const snap = {
      id: 'p1', published: true, academicYear: ay, startDate: priorStart, endDate: priorEnd,
      savedAt: `${priorStart}T00:00:00.000Z`,
      data: {
        schedule: { [rA.id]: { [priorHoliday]: 'POD-D' } },
        startDate: priorStart, endDate: priorEnd, academicYear: ay,
      },
    };
    const { schedule, report } = generateSchedule({ ...fixture, ayConf, rng: mulberry32(5) });
    const qInput = buildQualityInput({
      schedule, report, allResidents: fixture.allResidents, block: fixture.block,
      appSettings: fixture.appSettings, eligOverrides: fixture.eligOverrides,
      blocksHistory: [snap], ayConf,
    });

    expect(qInput.ayPriorTotals[rA.id].holidays).toBe(1);
    // The prior holiday falls outside this block, so it contributes to the AY ledger only.
    expect(qInput.holidayDates).toEqual([]);
  });

  it('an UNPUBLISHED prior block\'s holiday work contributes nothing (published-only)', () => {
    const fixture = makeFixture('standard');
    const ay = fixture.block.academicYear;
    const [rA] = fixture.allResidents;
    const priorHoliday = '2026-06-05';
    const ayConf = {
      ...(fixture.ayConf || {}),
      holidays: [{ id: 'prior', name: 'Prior Holiday', start: priorHoliday, end: priorHoliday }],
    };
    const draft = {
      id: 'p1', published: false, academicYear: ay, startDate: '2026-06-01', endDate: '2026-06-28',
      savedAt: '2026-06-01T00:00:00.000Z',
      data: {
        schedule: { [rA.id]: { [priorHoliday]: 'POD-D' } },
        startDate: '2026-06-01', endDate: '2026-06-28', academicYear: ay,
      },
    };
    const { schedule, report } = generateSchedule({ ...fixture, ayConf, rng: mulberry32(5) });
    const qInput = buildQualityInput({
      schedule, report, allResidents: fixture.allResidents, block: fixture.block,
      appSettings: fixture.appSettings, eligOverrides: fixture.eligOverrides,
      blocksHistory: [draft], ayConf,
    });
    expect(qInput.ayPriorTotals[rA.id]).toBeUndefined();
  });

  it('score()\'s holiday nudge never runs BACKWARDS on the resident carrying the AY holiday load', () => {
    // score() is a closure over generator state and can't be called from a test, so this observes
    // the term through generator OUTPUT. The two arms are identical in every input except the one
    // that drives holidayYearly:
    //   arm A — the in-block date is the AY's only holiday, so nobody has prior holiday history;
    //   arm B — three dates inside the SAME published prior snapshot are ALSO declared holidays,
    //           giving that snapshot's resident a holidayYearly of 3 (== HOLIDAY_EQUITY_CLAMP).
    // Crucially `blocksHistory` is byte-identical across both arms, so every other history-derived
    // input the generator has (prevBlockTailSchedules, traumaNightYearly, priorPedsTrauma,
    // countPublishedJC, next-block rotation) is unchanged. Declaring a date a holiday feeds exactly
    // one thing and nothing else: holidayYearly. That is what makes this a clean isolation.
    //
    // ACCEPTED LIMITATION, measured rather than assumed: the synthetic fixtures are
    // capacity-saturated (see the repair-pass notes in CLAUDE.md — every resident sits at target,
    // there is essentially no slack), and holidayEquity is a deliberately small preference weight
    // (2, clamped at 3 = a 6-point band) that must never outrank `deficit` (100). Probed across
    // four in-block dates x 8 seeds, the loaded resident's holiday count moved 8->8, 8->8, 8->8,
    // 8->7: the term is live and directionally correct, but on a block with no slack it rarely has
    // a tie left to break. Asserting a specific drop would therefore be asserting fixture trivia.
    // What IS well-defined, and what actually matters, is MONOTONICITY: knowing a resident already
    // worked holidays must never make the generator MORE likely to hand them another. A sign error
    // at the use site (`+ W.holidayEquity` instead of `-`) fails this immediately.
    const fixture = makeFixture('standard');
    const ay = fixture.block.academicYear;
    const dates = getBlockDates(fixture.block.startDate, fixture.block.endDate);
    const holiday = dates[20];
    const priorStart = '2026-06-01', priorEnd = '2026-06-28';
    const priorDates = ['2026-06-02', '2026-06-03', '2026-06-04'];
    const seeds = [1, 2, 3, 5, 8, 13, 21, 42];

    const holidayOnly = { id: 'h', name: 'Holiday', start: holiday, end: holiday };
    const armA = { ...(fixture.ayConf || {}), holidays: [holidayOnly] };

    // Identify the resident this fixture actually puts on that date, rather than assuming any two
    // roster entries compete for it — an earlier draft of this test picked two same-PGY residents
    // and failed because only one of them was ever eligible there at all.
    const counts = {};
    for (const seed of seeds) {
      const { schedule } = generateSchedule({ ...fixture, ayConf: armA, rng: mulberry32(seed) });
      for (const r of fixture.allResidents) if (schedule[r.id]?.[holiday]) counts[r.id] = (counts[r.id] || 0) + 1;
    }
    const [loadedId, baselineCount] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    expect(baselineCount).toBeGreaterThan(0); // fixture sanity: someone works this date

    const history = [{
      id: 'p1', published: true, academicYear: ay, startDate: priorStart, endDate: priorEnd,
      savedAt: `${priorStart}T00:00:00.000Z`,
      data: {
        schedule: { [loadedId]: Object.fromEntries(priorDates.map(d => [d, 'POD-D'])) },
        startDate: priorStart, endDate: priorEnd, academicYear: ay,
      },
    }];
    const armB = {
      ...armA,
      holidays: [holidayOnly, ...priorDates.map((d, i) => ({ id: `pr${i}`, name: `Prior ${i}`, start: d, end: d }))],
    };

    let withoutPriorHolidays = 0, withPriorHolidays = 0;
    for (const seed of seeds) {
      const a = generateSchedule({ ...fixture, ayConf: armA, blocksHistory: history, rng: mulberry32(seed) }).schedule;
      const b = generateSchedule({ ...fixture, ayConf: armB, blocksHistory: history, rng: mulberry32(seed) }).schedule;
      if (a[loadedId]?.[holiday]) withoutPriorHolidays++;
      if (b[loadedId]?.[holiday]) withPriorHolidays++;
    }
    expect(withPriorHolidays).toBeLessThanOrEqual(withoutPriorHolidays);
  });
});
