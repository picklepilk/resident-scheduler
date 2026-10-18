import { describe, it, expect } from 'vitest';
import { computeSetupGaps, pressureLevel, buildGapStamp, openStampedGaps } from './setupReadiness.js';

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
    expect(gaps.every(g => g.severity === 'advisory')).toBe(true);
  });
  it('pressure thresholds', () => {
    expect(pressureLevel(0.59)).toBe('light');
    expect(pressureLevel(0.6)).toBe('moderate');
    expect(pressureLevel(0.84)).toBe('moderate');
    expect(pressureLevel(0.85)).toBe('tight');
  });
  it('only a tight pressure becomes a gap', () => {
    expect(computeSetupGaps({ block: okBlock, supplyDemand: { demand: 50, supply: 100 } }).gaps).toEqual([]);
    const r = computeSetupGaps({ block: okBlock, supplyDemand: { demand: 90, supply: 100 } });
    expect(r.gaps.map(g => g.id)).toEqual(['pressureTight']);
    expect(r.pressure.level).toBe('tight');
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
