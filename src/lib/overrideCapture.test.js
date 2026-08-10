/** @vitest-environment jsdom */
// src/lib/overrideCapture.test.js
// Phase 3 (override capture). Covers the two guards that decide WHETHER an edit is recorded at all
// — the part most likely to be silently wrong, since a broken guard either logs nothing (feature
// quietly dead) or logs a whole generation as hundreds of "overrides" (feature quietly useless).
import { describe, it, expect } from 'vitest';
import { withOverrideEvents, summarizeOverrides } from '../ResidentScheduler.jsx';

const REPORT = { generatedAt: '2026-08-01T00:00:00.000Z' };

function blockWith(schedule, extra = {}) {
  return { schedule, generationReport: REPORT, overrideLog: [], ...extra };
}

describe('withOverrideEvents — what counts as an override', () => {
  it('records a hand-edit to a generated schedule', () => {
    const prev = blockWith({ r1: { '2026-08-03': 'POD-D' } });
    const next = { ...prev, schedule: { r1: { '2026-08-03': 'MT-D' } } };
    const out = withOverrideEvents(prev, next);

    expect(out.overrideLog).toHaveLength(1);
    expect(out.overrideLog[0]).toMatchObject({ residentId: 'r1', date: '2026-08-03', from: 'POD-D', to: 'MT-D' });
  });

  it('records an added and a cleared cell, with null on the empty side', () => {
    const prev = blockWith({ r1: { '2026-08-03': 'POD-D' } });
    const next = { ...prev, schedule: { r1: { '2026-08-04': 'MT-D' } } };
    const out = withOverrideEvents(prev, next);

    expect(out.overrideLog).toHaveLength(2);
    expect(out.overrideLog).toEqual(expect.arrayContaining([
      expect.objectContaining({ date: '2026-08-03', from: 'POD-D', to: null }),
      expect.objectContaining({ date: '2026-08-04', from: null, to: 'MT-D' }),
    ]));
  });

  it('does NOT record anything when the schedule was never generated', () => {
    // A hand-built schedule being edited is not the generator being overridden.
    const prev = { schedule: { r1: { '2026-08-03': 'POD-D' } }, generationReport: null, overrideLog: [] };
    const next = { ...prev, schedule: { r1: { '2026-08-03': 'MT-D' } } };
    expect(withOverrideEvents(prev, next).overrideLog).toEqual([]);
  });

  it('does NOT record a generation as an override of itself', () => {
    // runGenerate replaces the whole schedule AND the report through the same tracked updater.
    // Without the report-identity guard this single action would log an "override" per filled cell.
    const prev = blockWith({ r1: { '2026-08-03': 'POD-D' }, r2: { '2026-08-03': 'MT-D' } });
    const next = {
      ...prev,
      schedule: { r1: { '2026-08-03': 'FLEX-D' }, r2: { '2026-08-04': 'MT-N' } },
      generationReport: { generatedAt: '2026-08-05T00:00:00.000Z' },
    };
    const out = withOverrideEvents(prev, next);
    expect(out.overrideLog).toEqual([]);
  });

  it('leaves the block untouched when nothing about the schedule changed', () => {
    const prev = blockWith({ r1: { '2026-08-03': 'POD-D' } });
    const next = { ...prev, name: 'Renamed' };
    expect(withOverrideEvents(prev, next)).toBe(next);
  });

  it('accumulates across successive edits and caps the log', () => {
    let block = blockWith({ r1: {} });
    for (let i = 0; i < 60; i++) {
      const date = `2026-08-${String((i % 28) + 1).padStart(2, '0')}`;
      const next = { ...block, schedule: { r1: { ...block.schedule.r1, [date]: `S${i}` } } };
      block = withOverrideEvents(block, next);
    }
    expect(block.overrideLog.length).toBeGreaterThan(1);
    expect(block.overrideLog.length).toBeLessThanOrEqual(500);
  });
});

describe('summarizeOverrides — surfaces repetition, not individual edits', () => {
  const residents = { r1: { id: 'r1', firstName: 'Alpha', lastName: 'Test' } };

  it('groups by (resident, from, to) across different dates and ranks by count', () => {
    const log = [
      { residentId: 'r1', date: '2026-08-01', from: 'TRAUMA-N', to: 'POD-D', at: '2026-08-01T01:00:00Z' },
      { residentId: 'r1', date: '2026-08-08', from: 'TRAUMA-N', to: 'POD-D', at: '2026-08-02T01:00:00Z' },
      { residentId: 'r1', date: '2026-08-15', from: 'TRAUMA-N', to: 'POD-D', at: '2026-08-03T01:00:00Z' },
      { residentId: 'r1', date: '2026-08-20', from: 'MT-D', to: 'FLEX-D', at: '2026-08-04T01:00:00Z' },
    ];
    const rows = summarizeOverrides(log, residents);

    expect(rows).toHaveLength(2);
    // The repeated pattern ranks first — that's the entire point of the card.
    expect(rows[0]).toMatchObject({ from: 'TRAUMA-N', to: 'POD-D', count: 3, residentName: 'Alpha Test' });
    expect(rows[0].dates).toEqual(['2026-08-01', '2026-08-08', '2026-08-15']);
    expect(rows[1].count).toBe(1);
  });

  it('labels a resident who is no longer on the roster rather than throwing', () => {
    const log = [{ residentId: 'gone', date: '2026-08-01', from: 'POD-D', to: null, at: '2026-08-01T01:00:00Z' }];
    expect(summarizeOverrides(log, residents)[0].residentName).toBe('Unknown resident');
  });

  it('handles an empty log', () => {
    expect(summarizeOverrides([], residents)).toEqual([]);
    expect(summarizeOverrides(undefined, residents)).toEqual([]);
  });
});
