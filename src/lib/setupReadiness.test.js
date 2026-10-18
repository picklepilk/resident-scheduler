import { describe, it, expect } from 'vitest';
import { blockingGapCount, computeSetupGaps, pressureLevel, buildGapStamp, openStampedGaps } from './setupReadiness.js';

const okBlock = { startDate: '2026-07-01', endDate: '2026-07-28' };

describe('computeSetupGaps', () => {
  it('returns no gaps for a clean setup', () => {
    expect(computeSetupGaps({ block: okBlock }).gaps).toEqual([]);
  });
  it('flags invalid block dates as blocking', () => {
    const { gaps } = computeSetupGaps({ block: { startDate: '2026-07-10', endDate: '2026-07-01' } });
    expect(gaps[0]).toMatchObject({ id: 'blockDates', severity: 'blocking' });
  });
  it('emits structured gaps with fixTarget and suppresses', () => {
    const { gaps } = computeSetupGaps({
      block: okBlock, missingSpecialDayLists: [{ key: 'procDays', label: 'Procedure days' }],
      holidaysConfigured: false, conferenceDatesAbsent: true, pendingResidentCount: 2,
      offServiceNoRanges: [{ id: 'o1', name: 'Doe' }], residentIssues: [{ id: 'r1', name: 'Roe', missing: ['PGY'] }],
    });
    const ids = gaps.map(g => g.id);
    expect(ids).toEqual(expect.arrayContaining(['specialDays:procDays', 'holidaysMissing', 'conferencesMissing', 'pendingRequests', 'offServiceRanges:o1', 'resident:r1']));
    for (const g of gaps) { expect(g.fixTarget.tab).toBeTruthy(); expect(Array.isArray(g.suppresses)).toBe(true); }
    const sev = Object.fromEntries(gaps.map(g => [g.id, g.severity]));
    expect(sev['specialDays:procDays']).toBe('blocking');
    expect(sev['resident:r1']).toBe('blocking');
    expect(sev['offServiceRanges:o1']).toBe('blocking');
    expect(sev.holidaysMissing).toBe('advisory');
    expect(sev.conferencesMissing).toBe('advisory');
    expect(sev.pendingRequests).toBe('advisory');
  });
  it('pressure thresholds', () => {
    expect(pressureLevel(0.59)).toBe('light');
    expect(pressureLevel(0.6)).toBe('moderate');
    expect(pressureLevel(0.84)).toBe('moderate');
    expect(pressureLevel(0.85)).toBe('tight');
  });
  it('pressure is advisory at every level', () => {
    for (const [d, lvl] of [[50, 'light'], [70, 'moderate'], [90, 'tight']]) {
      const r = computeSetupGaps({ block: okBlock, supplyDemand: { demand: d, supply: 100 } });
      expect(r.gaps.map(g => g.id)).toEqual(['pressure']);
      expect(r.gaps[0].severity).toBe('advisory');
      expect(r.pressure.level).toBe(lvl);
    }
  });
  it('advisory-only gaps do not count as blocking; one blocking does', () => {
    const adv = computeSetupGaps({ block: okBlock, holidaysConfigured: false, pendingResidentCount: 1 }).gaps;
    expect(adv.length).toBe(2);
    expect(blockingGapCount(adv)).toBe(0);
    const mixed = computeSetupGaps({ block: okBlock, holidaysConfigured: false, jcGaps: [{ dateStr: '2026-07-07', pgy: 1 }] }).gaps;
    expect(blockingGapCount(mixed)).toBe(1);
  });
  it('rejects impossible calendar dates', () => {
    expect(computeSetupGaps({ block: { startDate: '2026-02-30', endDate: '2026-03-10' } }).gaps[0].id).toBe('blockDates');
    expect(computeSetupGaps({ block: { startDate: '2026-02-28', endDate: '2026-03-10' } }).gaps).toEqual([]);
  });
});

describe('stamp helpers', () => {
  it('buildGapStamp returns null without gaps', () => {
    expect(buildGapStamp([])).toBeNull();
    expect(buildGapStamp([{ id: 'a', label: 'A', detail: 'x' }], 'T')).toEqual({ at: 'T', gaps: [{ id: 'a', label: 'A' }] });
  });
  it('openStampedGaps resolves automatically', () => {
    const stamp = { at: 'T', gaps: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }] };
    expect(openStampedGaps(stamp, [{ id: 'b', label: 'B' }]).map(g => g.id)).toEqual(['b']);
    expect(openStampedGaps(stamp, [])).toEqual([]);
    expect(openStampedGaps(null, [{ id: 'b' }])).toEqual([]);
    expect(openStampedGaps({ gaps: 'junk' }, [{ id: 'b' }])).toEqual([]);
  });
});
