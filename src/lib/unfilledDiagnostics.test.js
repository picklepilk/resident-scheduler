/** @vitest-environment jsdom */
// src/lib/unfilledDiagnostics.test.js
// Completeness/shape check for computeUnfilledDiagnostics + the firstBlockingReason fix to
// computeUnderTargetDiagnostics (ResidentScheduler.jsx, next to candidatePool) — see
// CANDIDATE_POOL_STAGES' own header for the refactor this sits on top of.
import { describe, it, expect } from 'vitest';
import { generateScheduleBest } from '../ResidentScheduler.jsx';
import { makeFixture } from './__fixtures__/syntheticRoster.js';

describe('computeUnfilledDiagnostics (understaffed fixture)', () => {
  const fixture = makeFixture('understaffed');
  const { report } = generateScheduleBest({ ...fixture }, { attempts: 20, baseSeed: 42 });

  it('produced at least one unfilled slot to exercise (fixture sanity check)', () => {
    expect(report.unfilled.length).toBeGreaterThan(0);
  });

  it('every unfilled entry has a blockers histogram summing to allResidents.length', () => {
    for (const u of report.unfilled) {
      expect(u.blockers, `unfilled ${u.shiftId}@${u.dateStr} missing blockers`).toBeTruthy();
      const sum = Object.values(u.blockers).reduce((s, n) => s + n, 0);
      expect(sum, `unfilled ${u.shiftId}@${u.dateStr} blockers sum`).toBe(fixture.allResidents.length);
    }
  });

  it('every unfilled entry has a nearMiss array of at most 5 residents', () => {
    for (const u of report.unfilled) {
      expect(Array.isArray(u.nearMiss)).toBe(true);
      expect(u.nearMiss.length).toBeLessThanOrEqual(5);
      for (const nm of u.nearMiss) {
        expect(typeof nm.residentId).toBe('string');
        expect(typeof nm.reason).toBe('string');
      }
    }
  });

  it('no underTarget blockedBy key is the old catch-all "ruleBlocked" (firstBlockingReason is exact)', () => {
    for (const u of report.underTarget) {
      if (!u.blockedBy) continue;
      expect(Object.keys(u.blockedBy)).not.toContain('ruleBlocked');
    }
  });

  it('is plain JSON — no functions survive a JSON round-trip (the report is persisted)', () => {
    const roundTripped = JSON.parse(JSON.stringify(report));
    expect(roundTripped).toEqual(report);
    expect(report.computeUnderTargetDiagnostics).toBeUndefined();
    expect(report.computeUnfilledDiagnostics).toBeUndefined();
  });
});
