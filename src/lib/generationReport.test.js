import { describe, it, expect } from 'vitest';
import { summarizeGenerationReport } from '../ResidentScheduler.jsx';

// Regression coverage for a confirmed report-attribution bug: summarizeGenerationReport used to
// group unfilled slots by shiftId ONLY, then union every distinct reason across ALL of that
// shift's dates into one recommendations array. GenerationReportCard rendered one shared date
// list followed by every recommendation sentence, so a reason that only applied to date A got
// rendered as if it also explained date B (real case: a chief-flagged false claim that a
// streak-block explanation applied to a date whose real reason was noEligible). Each
// recommendation must now carry only the dates whose slots actually have that reason.

function baseReport(unfilled) {
  return {
    generatedAt: new Date().toISOString(),
    mode: 'fill',
    totalSlots: unfilled.length,
    keptManual: 0,
    filled: 0,
    optionalFilled: 0,
    unfilled,
    underTarget: [],
    jeopardyPlacements: [],
    seniorGaps: [],
    restCompromises: [],
    repairs: [],
  };
}

describe('summarizeGenerationReport — per-reason date attribution', () => {
  it('does not union two different reasons for one shift onto a shared date list', () => {
    const report = baseReport([
      { dateStr: '2026-09-26', shiftId: 'POD-D', slotIndex: 0, reason: 'allAtTarget' },
      { dateStr: '2026-10-04', shiftId: 'POD-D', slotIndex: 0, reason: 'allWorking' },
    ]);

    const summary = summarizeGenerationReport(report);
    expect(summary).toHaveLength(1);
    const group = summary[0];
    expect(group.shiftId).toBe('POD-D');
    // Two distinct reasons -> two distinct recommendation entries, not one merged list.
    expect(group.recommendations).toHaveLength(2);

    const byReason = Object.fromEntries(group.recommendations.map(r => [r.reason, r]));

    // Each recommendation's own dates must be scoped to only the slots with that reason —
    // never the full, shift-wide date list (the union bug).
    expect(byReason.allAtTarget.slots.map(s => s.dateStr)).toEqual(['2026-09-26']);
    expect(byReason.allWorking.slots.map(s => s.dateStr)).toEqual(['2026-10-04']);

    // Sentences stay reason-specific and must not bleed across dates.
    expect(byReason.allAtTarget.text).toMatch(/shift target/i);
    expect(byReason.allWorking.text).toMatch(/already working/i);
  });

  it('keeps a single reason unaffected (no change in behavior for the common case)', () => {
    const report = baseReport([
      { dateStr: '2026-09-05', shiftId: 'MT-D', slotIndex: 0, reason: 'allWorking' },
      { dateStr: '2026-09-12', shiftId: 'MT-D', slotIndex: 0, reason: 'allWorking' },
    ]);

    const summary = summarizeGenerationReport(report);
    const group = summary[0];
    expect(group.recommendations).toHaveLength(1);
    expect(group.recommendations[0].slots.map(s => s.dateStr)).toEqual(['2026-09-05', '2026-09-12']);
  });

  it('rewords streakBlocked with the Peds-half boundary when a blocked Trauma date sits within the boundary window', () => {
    const blockStart = '2026-09-14'; // day 14 boundary -> 2026-09-28
    const report = baseReport([
      // Day index 10 (2026-09-24) is within [14-6, 13] of the boundary.
      { dateStr: '2026-09-24', shiftId: 'TRAUMA-D', slotIndex: 0, reason: 'streakBlocked' },
    ]);

    const summary = summarizeGenerationReport(report, {}, blockStart);
    const group = summary.find(g => g.shiftId === 'TRAUMA-D');
    expect(group.recommendations).toHaveLength(1);
    expect(group.recommendations[0].text).toMatch(/Peds-half shifts starting/);
    expect(group.recommendations[0].text).not.toMatch(/6 consecutive work days/);
  });

  it('keeps the generic streakBlocked wording when the blocked date is far from the half boundary', () => {
    const blockStart = '2026-09-14'; // boundary at 2026-09-28
    const report = baseReport([
      // Day index 2 (2026-09-16) is far from the boundary window.
      { dateStr: '2026-09-16', shiftId: 'TRAUMA-D', slotIndex: 0, reason: 'streakBlocked' },
    ]);

    const summary = summarizeGenerationReport(report, {}, blockStart);
    const group = summary.find(g => g.shiftId === 'TRAUMA-D');
    expect(group.recommendations[0].text).toMatch(/6 consecutive work days/);
    expect(group.recommendations[0].text).not.toMatch(/Peds-half/);
  });

  it('keeps the generic streakBlocked wording when blockStart is not provided', () => {
    const report = baseReport([
      { dateStr: '2026-09-24', shiftId: 'TRAUMA-D', slotIndex: 0, reason: 'streakBlocked' },
    ]);

    const summary = summarizeGenerationReport(report);
    const group = summary.find(g => g.shiftId === 'TRAUMA-D');
    expect(group.recommendations[0].text).toMatch(/6 consecutive work days/);
  });
});
