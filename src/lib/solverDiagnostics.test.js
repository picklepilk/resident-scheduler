/** @vitest-environment jsdom */
// attachSolverDiagnostics: a solver-winner result gets the same under-target / unfilled-slot
// diagnostics the local winner gets, as plain data only, without changing the solver schedule.
import { describe, it, expect, beforeAll } from 'vitest';
import { generateScheduleBest, generateSchedule, attachSolverDiagnostics } from '../ResidentScheduler.jsx';
import { makeFixture } from './__fixtures__/syntheticRoster.js';
import { getBlockDates } from './dates.js';

const args = makeFixture('standard');

describe('attachSolverDiagnostics', () => {
  let base;
  beforeAll(() => { base = generateScheduleBest(args, { attempts: 2, baseSeed: 7 }); });

  it('annotates solver unfilled/underTarget entries with plain-data diagnostics and leaves the schedule alone', () => {
    const schedule = JSON.parse(JSON.stringify(base.schedule));
    const dates = getBlockDates(args.block.startDate, args.block.endDate);
    // Empty one worked cell so a real unfilled slot + under-target resident exist.
    let hole = null;
    for (const rid of Object.keys(schedule)) {
      for (const ds of dates) {
        if (schedule[rid][ds]) { hole = { rid, ds, shiftId: schedule[rid][ds] }; schedule[rid][ds] = ''; break; }
      }
      if (hole) break;
    }
    expect(hole).not.toBeNull();
    const before = JSON.stringify(schedule);
    const solverRes = {
      schedule,
      report: {
        underTarget: [{ residentId: hole.rid }],
        unfilled: [{ dateStr: hole.ds, shiftId: hole.shiftId, slotIndex: 0, reason: 'coverageShort' }],
      },
    };
    const out = attachSolverDiagnostics(solverRes, args);
    expect(out).toBe(solverRes);
    expect(JSON.stringify(out.schedule)).toBe(before);
    expect(typeof out.report.computeUnderTargetDiagnostics).toBe('undefined');
    expect(typeof out.report.computeUnfilledDiagnostics).toBe('undefined');
    expect(JSON.parse(JSON.stringify(out.report))).toEqual(out.report); // plain data
    // The scratch pass may legitimately refill the hole (then no diagnostics), but when it does
    // report one, it must be the documented shape.
    // No fill pass runs, so the fillable hole STILL gets diagnostics (every resident is classified).
    const u = out.report.unfilled[0];
    expect(typeof u.blockers).toBe('object');
    expect(Array.isArray(u.nearMiss)).toBe(true);
    expect(Object.values(u.blockers).reduce((a, b) => a + b, 0)).toBe(args.allResidents.length);
    const ut = out.report.underTarget[0];
    expect(typeof ut.blockedBy).toBe('object');
    expect(typeof ut.openSlots).toBe('number');
  });

  it('diagnosticsOnly generateSchedule leaves every cell exactly as given (no fill, no top-up)', () => {
    const schedule = JSON.parse(JSON.stringify(base.schedule));
    const dates = getBlockDates(args.block.startDate, args.block.endDate);
    const rid = Object.keys(schedule)[0];
    for (const ds of dates.slice(0, 5)) schedule[rid][ds] = '';
    const before = JSON.stringify(schedule);
    const res = generateSchedule({
      ...args, block: { ...args.block, schedule }, clearFirst: false, repair: false,
      deferUnderTargetDiagnostics: true, diagnosticsOnly: true, seedUnfilled: [],
    });
    expect(JSON.stringify(res.schedule)).toBe(before);
    expect(res.report.filled).toBe(0);
  });

  it('is a no-op for a report with nothing to explain', () => {
    const res = { schedule: base.schedule, report: { underTarget: [], unfilled: [] } };
    expect(attachSolverDiagnostics(res, args)).toBe(res);
  });
});
