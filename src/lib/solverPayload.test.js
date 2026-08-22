/** @vitest-environment jsdom */
// src/lib/solverPayload.test.js
// Unit tests for buildSolverPayload/mapSolverResult (ResidentScheduler.jsx) — the JS-side
// request/response mapping against the external CP-SAT solver-service (see
// solver-service/docs/PAYLOAD_SCHEMA.md). Imports the real ResidentScheduler.jsx under jsdom,
// same verified-import-safe convention generator.harness.test.js already relies on (no top-level
// DOM access; window.__SUPABASE_URL__/__SOLVER_URL__ reads are typeof-guarded) — do NOT extract
// these functions out of the monolith to work around import issues.
import { describe, it, expect } from 'vitest';
import { buildSolverPayload, mapSolverResult, summarizeGenerationReport, getEligibleShifts, getShiftTarget } from '../ResidentScheduler.jsx';
import { getCoverageFor, twelveHourStateFor } from './coverage.js';
import { makeFixture } from './__fixtures__/syntheticRoster.js';

describe('buildSolverPayload', () => {
  it('never puts a resident name anywhere in the payload (public repo — ids only)', () => {
    const fixture = makeFixture('standard');
    const payload = buildSolverPayload(fixture);
    const json = JSON.stringify(payload);
    for (const r of fixture.allResidents) {
      expect(json).not.toContain(r.firstName);
      expect(json).not.toContain(r.lastName);
    }
    // Belt and suspenders: no "name"/"firstName"/"lastName" KEY anywhere either.
    expect(json).not.toMatch(/"(name|firstName|lastName)":/);
  });

  it('eligible[r][d] matches a direct getEligibleShifts spot-check', () => {
    const fixture = makeFixture('standard');
    const payload = buildSolverPayload(fixture);
    const spotChecks = [
      { id: 'syn_alpha', ds: '2026-07-06' },   // TRAUMA_PEDS PGY-1, block's first day
      { id: 'syn_mike', ds: '2026-07-15' },    // chief PGY-3, a Wednesday (GR)
      { id: 'syn_uniform', ds: '2026-07-07' }, // FM-3 night-only, Tuesday (in FM-3's Mon/Tue/Wed window)
    ];
    for (const { id, ds } of spotChecks) {
      const resident = fixture.allResidents.find(r => r.id === id);
      const direct = getEligibleShifts(
        resident, ds, fixture.block.specialDays || {}, fixture.eligOverrides, fixture.appSettings, fixture.dayRules,
        { blockStart: fixture.block.startDate, forGenerator: true, ayConf: fixture.ayConf }
      );
      const fromPayload = payload.eligible[id]?.[ds] || [];
      expect([...fromPayload].sort()).toEqual([...direct].sort());
    }
  });

  it('eligible sets are non-empty overall for a standard roster', () => {
    const fixture = makeFixture('standard');
    const payload = buildSolverPayload(fixture);
    const totalEligibleEntries = Object.values(payload.eligible)
      .reduce((n, byDate) => n + Object.values(byDate).reduce((m, list) => m + list.length, 0), 0);
    expect(totalEligibleEntries).toBeGreaterThan(0);
  });

  it('coverage[s][d] matches getCoverageFor spot-checks', () => {
    const fixture = makeFixture('standard');
    const payload = buildSolverPayload(fixture);
    const dow = ds => new Date(ds + 'T00:00:00').getDay();
    const spotChecks = ['POD-D', 'FLEX-E', 'MT-N'];
    const ds = '2026-07-08'; // an ordinary Wednesday-adjacent weekday inside the block
    for (const shiftId of spotChecks) {
      const state = twelveHourStateFor(ds, fixture.ayConf);
      const expected = getCoverageFor(shiftId, fixture.coverage, dow(ds), state);
      const fromPayload = payload.coverage[shiftId]?.[ds];
      if (expected.min === 0 && expected.max === 0) {
        expect(fromPayload).toBeUndefined(); // {0,0} is omitted, not zeroed — see buildSolverPayload
      } else {
        expect(fromPayload).toEqual(expected);
      }
    }
  });

  it('coverage omits a shift/date that does not run at all that weekday (SHIFT_DOW)', () => {
    const fixture = makeFixture('standard');
    const payload = buildSolverPayload(fixture);
    // TRAUMA-D only exists Sun/Tue/Thu/Sat (SHIFT_DOW) — 2026-07-08 is a Wednesday. (PED-S used
    // to be the SHIFT_DOW example here too, but it now exists all 7 days — chief-confirmed
    // against live QGenda, dropped from SHIFT_DOW entirely — so it no longer demonstrates this.)
    expect(payload.coverage['TRAUMA-D']?.['2026-07-08']).toBeUndefined();
  });

  it('locked[] reflects every pre-seeded schedule cell, none invented', () => {
    const fixture = makeFixture('standard');
    const seededBlock = {
      ...fixture.block,
      schedule: { syn_alpha: { '2026-07-06': 'TRAUMA-D' }, syn_mike: { '2026-07-06': 'POD-D' } },
    };
    const payload = buildSolverPayload({ ...fixture, block: seededBlock });
    expect(payload.locked).toEqual(expect.arrayContaining([
      { residentId: 'syn_alpha', date: '2026-07-06', shiftId: 'TRAUMA-D' },
      { residentId: 'syn_mike', date: '2026-07-06', shiftId: 'POD-D' },
    ]));
    expect(payload.locked.length).toBe(2);
  });

  it('locked[] is empty for a fresh (unseeded) block', () => {
    const fixture = makeFixture('standard');
    const payload = buildSolverPayload(fixture);
    expect(payload.locked).toEqual([]);
  });

  it('resident targets match getShiftTarget', () => {
    const fixture = makeFixture('standard');
    const payload = buildSolverPayload(fixture);
    for (const r of fixture.allResidents) {
      const expected = getShiftTarget(r, fixture.appSettings);
      const entry = payload.residents.find(p => p.id === r.id);
      expect(entry).toBeTruthy();
      expect(entry.target).toBe(expected);
    }
  });

  it('caps are null for residents the cap does not apply to, and set for ones it does', () => {
    const fixture = makeFixture('standard');
    const payload = buildSolverPayload(fixture);
    const byId = Object.fromEntries(payload.residents.map(r => [r.id, r]));
    // syn_alpha: EM_HOME PGY-1, TRAUMA_PEDS split — not trauma-cap-subject (that's PGY-2/3 only),
    // but IS traumaPedsSplit-subject.
    expect(byId.syn_alpha.caps.trauma).toBeNull();
    expect(byId.syn_alpha.traumaPedsSplit).toBeTruthy();
    expect(byId.syn_alpha.traumaPedsSplit.traumaCap).toBe(8);
    expect(byId.syn_alpha.traumaPedsSplit.pedsCap).toBe(11);
    // syn_mike: EM_HOME PGY-3 (isTraumaCapSubject) with chiefRole set.
    expect(byId.syn_mike.caps.trauma).toEqual(expect.any(Number));
    expect(byId.syn_mike.caps.jcRemaining).toBe(3); // JC_MAX_PER_AY, no published history in this fixture
    // syn_uniform: FM PGY-3, never EM_HOME/EM_BAMC/PEDS_EM/FM_1 — every specialty cap is null.
    expect(byId.syn_uniform.caps.trauma).toBeNull();
    expect(byId.syn_uniform.caps.jcRemaining).toBeNull();
    expect(byId.syn_uniform.caps.bamcWedNights).toBeNull();
    expect(byId.syn_uniform.caps.pedsMixMax).toBeNull();
    expect(byId.syn_uniform.caps.fm1PedsMax).toBeNull();
    // nights cap is always the flat NIGHT_RULES.maxPerBlock, regardless of nightExempt.
    expect(byId.syn_uniform.nightExempt).toBe(true);
    expect(byId.syn_uniform.caps.nights).toBe(6);
  });

  it('priorTail/priorTailHours/ayPrior default to empty/zero with no blocksHistory', () => {
    const fixture = makeFixture('standard');
    const payload = buildSolverPayload(fixture);
    for (const r of payload.residents) {
      expect(r.priorTail).toEqual({});
      expect(r.priorTailObligations).toEqual([]);
      expect(r.priorTailHours).toBe(0);
      expect(r.ayPrior).toEqual({ nights: 0, weekends: 0, holidays: 0 });
    }
  });

  it('accepts config overrides and fills in sane defaults for the rest', () => {
    const fixture = makeFixture('standard');
    const payload = buildSolverPayload({ ...fixture, config: { maxTimeSeconds: 5 } });
    expect(payload.config.maxTimeSeconds).toBe(5);
    expect(payload.config.numWorkers).toBe(8);
    expect(payload.config.randomSeed).toBe(42);
    expect(payload.config.coverageMinMode).toBe('elastic_always');
  });

  it('shifts catalog carries startH/durationH/type/area for every SHIFT_MAP id', () => {
    const fixture = makeFixture('standard');
    const payload = buildSolverPayload(fixture);
    expect(payload.shifts['POD-D']).toEqual({ startH: 7, durationH: 9, type: 'day', area: 'POD' });
    expect(payload.shifts['TRAUMA-N']).toEqual({ startH: 18, durationH: 12, type: 'night', area: 'TRAUMA' });
  });

  it('holidays is {} and jcDates derives first Tuesdays when the AY has no config (no-op guarantee)', () => {
    const fixture = makeFixture('standard');
    const payload = buildSolverPayload(fixture);
    expect(payload.holidays).toEqual({});
    expect(payload.jcDates).toContain('2026-07-07'); // first Tuesday of the block
  });

  it('rulePriority is always a normalized, complete ordering', () => {
    const fixture = makeFixture('standard');
    const payload = buildSolverPayload(fixture);
    expect(payload.rulePriority.sort()).toEqual(['coverageMin', 'postNightRest', 'seniorComposition'].sort());
  });

  // ── Batch 2 / Round 2b optional fields (see PAYLOAD_SCHEMA.md's "Batch 2"/"Round 2b" headers) ──
  it('traumaNightShiftIds/pedsNightShiftIds are the fixed single-id lists', () => {
    const fixture = makeFixture('standard');
    const payload = buildSolverPayload(fixture);
    expect(payload.traumaNightShiftIds).toEqual(['TRAUMA-N']);
    expect(payload.pedsNightShiftIds).toEqual(['PED-N']);
  });

  it('pedsSplitInternIds contains exactly the TRAUMA_PEDS/PEDS_TRAUMA split residents, and pedsInternNightTarget is 5', () => {
    const fixture = makeFixture('standard');
    const payload = buildSolverPayload(fixture);
    expect(payload.pedsSplitInternIds).toContain('syn_alpha'); // EM_HOME PGY-1, blockType TRAUMA_PEDS
    expect(payload.pedsSplitInternIds).not.toContain('syn_mike'); // plain EM_HOME PGY-3, not split
    expect(payload.pedsInternNightTarget).toBe(5);
  });

  it('emResidentIds is exactly EM_HOME/EM_BAMC schedulable residents, any PGY', () => {
    const fixture = makeFixture('standard');
    const payload = buildSolverPayload(fixture);
    expect(payload.emResidentIds).toEqual(expect.arrayContaining(['syn_alpha', 'syn_mike', 'syn_golf', 'syn_sierra', 'syn_tango']));
    expect(payload.emResidentIds).not.toContain('syn_uniform'); // FM
    expect(payload.emResidentIds).not.toContain('syn_whiskey'); // PEDS
  });

  it('emPgy2ResidentIds/emPgy3ResidentIds are EM_HOME-only, matching pgy — mirrors narrowForPgyGate (EM_BAMC never gates)', () => {
    const fixture = makeFixture('standard');
    const payload = buildSolverPayload(fixture);
    expect(payload.emPgy2ResidentIds).toContain('syn_golf'); // EM_HOME PGY-2
    expect(payload.emPgy2ResidentIds).not.toContain('syn_mike'); // PGY-3
    expect(payload.emPgy3ResidentIds).toContain('syn_mike'); // EM_HOME PGY-3
    expect(payload.emPgy3ResidentIds).not.toContain('syn_golf'); // PGY-2
    // EM_BAMC is never in either list, regardless of pgy — SENIOR_COMPOSITION/isSeniorFor/
    // narrowForPgyGate only ever gate EM_HOME.
    expect(payload.emPgy2ResidentIds).not.toContain('syn_sierra');
    expect(payload.emPgy3ResidentIds).not.toContain('syn_sierra');
  });

  it('alternationExemptDates is empty with no 12h windows configured (no-op guarantee)', () => {
    const fixture = makeFixture('standard');
    const payload = buildSolverPayload(fixture);
    expect(payload.alternationExemptDates).toEqual([]);
  });

  it('alternationExemptDates fires exactly on the boundary dates of a configured 12h window', () => {
    const fixture = makeFixture('standard');
    const ayConf = {
      twelveHourWindows: [
        { id: 'w1', label: 'Conf', start: '2026-07-13', end: '2026-07-15', areas: ['POD'], mode: 'replace' },
      ],
    };
    const payload = buildSolverPayload({ ...fixture, ayConf });
    // The window starts 07-13 (differs from 07-12) and ends 07-15 (07-16 differs from 07-15) —
    // both boundary dates land in the exempt set; an ordinary mid-window or mid-non-window date does not.
    expect(payload.alternationExemptDates).toContain('2026-07-13');
    expect(payload.alternationExemptDates).toContain('2026-07-16');
    expect(payload.alternationExemptDates).not.toContain('2026-07-14');
    expect(payload.alternationExemptDates).not.toContain('2026-07-20');
  });
});

describe('mapSolverResult', () => {
  const block = { startDate: '2026-07-06', endDate: '2026-08-02', schedule: {} };

  it('maps a canned OPTIMAL response into the app report shape', () => {
    const json = {
      version: 1, engine: 'cpsat', status: 'OPTIMAL', mode: 'strict',
      schedule: { syn_alpha: { '2026-07-06': 'TRAUMA-D' } },
      objective: 100, solveTimeMs: 1200, seed: 42,
      report: {
        unfilled: [{ dateStr: '2026-07-07', shiftId: 'POD-N', shortBy: 2, reason: 'coverageShort' }],
        restCompromises: [{ residentId: 'syn_mike', dateStr: '2026-07-10', shiftId: 'POD-D', gapH: 18 }],
        underTarget: [{ residentId: 'syn_alpha', assigned: 17, target: 19 }],
        seniorGaps: [],
      },
      feasibility: null,
    };
    const { schedule, report } = mapSolverResult(json, { block });
    expect(schedule.syn_alpha['2026-07-06']).toBe('TRAUMA-D');
    expect(report.engine).toBe('cpsat');
    expect(report.mode).toBe('strict');
    expect(report.seed).toBe(42);
    // shortBy:2 expands into two slotIndex-ed entries.
    expect(report.unfilled).toEqual([
      { dateStr: '2026-07-07', shiftId: 'POD-N', slotIndex: 0, reason: 'coverageShort' },
      { dateStr: '2026-07-07', shiftId: 'POD-N', slotIndex: 1, reason: 'coverageShort' },
    ]);
    expect(report.restCompromises).toHaveLength(1);
    expect(report.seniorGaps).toEqual([]);
    expect(report.filled).toBe(1); // one assigned cell, no pre-existing kept cells
    expect(report.keptManual).toBe(0);
    expect(report.totalSlots).toBe(report.keptManual + report.filled + report.unfilled.length);
    expect(report.feasibility).toBeNull();
    expect(report.qualityVector).toBeNull();
  });

  it('counts locked/kept cells already in block.schedule as keptManual, not filled', () => {
    const seededBlock = { ...block, schedule: { syn_alpha: { '2026-07-06': 'TRAUMA-D' } } };
    const json = {
      status: 'FEASIBLE', mode: 'relaxed', seed: 7,
      schedule: { syn_alpha: { '2026-07-06': 'TRAUMA-D' }, syn_mike: { '2026-07-06': 'POD-D' } },
      report: { unfilled: [], restCompromises: [], underTarget: [], seniorGaps: [] },
      feasibility: { mode: 'relaxed', violations: [], conflicts: [], recommendations: [] },
    };
    const { report, schedule } = mapSolverResult(json, { block: seededBlock });
    expect(report.keptManual).toBe(1);
    expect(report.filled).toBe(1); // syn_mike's new cell only
    expect(schedule.syn_mike['2026-07-06']).toBe('POD-D');
    expect(report.mode).toBe('relaxed');
    expect(report.feasibility.mode).toBe('relaxed');
  });

  it('preserves an empty row for a resident id known to block.schedule but absent from the response', () => {
    const seededBlock = { ...block, schedule: { syn_alpha: {} } };
    const json = { status: 'OPTIMAL', mode: 'strict', seed: 1, schedule: {}, report: { unfilled: [], restCompromises: [], underTarget: [], seniorGaps: [] } };
    const { schedule } = mapSolverResult(json, { block: seededBlock });
    expect(schedule.syn_alpha).toEqual({});
  });

  it('an unrecognized unfilled reason does not make summarizeGenerationReport throw, and still gets a recommendation', () => {
    const json = {
      status: 'OPTIMAL', mode: 'strict', seed: 1, schedule: {},
      report: { unfilled: [{ dateStr: '2026-07-07', shiftId: 'POD-N', shortBy: 1, reason: 'coverageShort' }], restCompromises: [], underTarget: [], seniorGaps: [] },
    };
    const { report } = mapSolverResult(json, { block });
    expect(() => summarizeGenerationReport(report, {}, block.startDate)).not.toThrow();
    const summary = summarizeGenerationReport(report, {}, block.startDate);
    const podNSummary = summary.find(s => s.shiftId === 'POD-N');
    expect(podNSummary.recommendations.length).toBeGreaterThan(0);
    expect(podNSummary.recommendations[0].text).toContain('coverageShort');
  });

  it('defaults gracefully on a minimal/malformed-ish response (no throw)', () => {
    expect(() => mapSolverResult({}, { block })).not.toThrow();
    const { schedule, report } = mapSolverResult({}, { block });
    expect(schedule).toEqual({});
    expect(report.unfilled).toEqual([]);
    expect(report.seniorGaps).toEqual([]);
    expect(report.mode).toBe('strict');
  });
});
