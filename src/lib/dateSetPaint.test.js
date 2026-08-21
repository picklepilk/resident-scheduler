// Unit tests for the pure click/drag commit math behind TimeOffModal (ResidentScheduler.jsx).
import { describe, it, expect } from 'vitest';
import { toggleDateInList, paintActionFor, applyDateRangePaint } from './dateSetPaint.js';
import { getBlockDates } from './dates.js';

describe('toggleDateInList', () => {
  it('adds an absent date, sorted', () => {
    expect(toggleDateInList(['2026-08-01', '2026-08-05'], '2026-08-03'))
      .toEqual(['2026-08-01', '2026-08-03', '2026-08-05']);
  });
  it('removes a present date', () => {
    expect(toggleDateInList(['2026-08-01', '2026-08-03'], '2026-08-03')).toEqual(['2026-08-01']);
  });
  it('treats a missing/undefined list as empty', () => {
    expect(toggleDateInList(undefined, '2026-08-03')).toEqual(['2026-08-03']);
  });
});

describe('paintActionFor', () => {
  it('is "remove" when the anchor date is already in the list', () => {
    expect(paintActionFor(['2026-08-03'], '2026-08-03')).toBe('remove');
  });
  it('is "add" when the anchor date is absent', () => {
    expect(paintActionFor(['2026-08-03'], '2026-08-04')).toBe('add');
  });
  it('is "add" for an empty/missing list', () => {
    expect(paintActionFor(undefined, '2026-08-04')).toBe('add');
  });
});

describe('applyDateRangePaint', () => {
  it('adds every date in an inclusive range, deduped and sorted, in one call', () => {
    const result = applyDateRangePaint(['2026-08-01'], '2026-08-03', '2026-08-05', 'add', getBlockDates);
    expect(result).toEqual(['2026-08-01', '2026-08-03', '2026-08-04', '2026-08-05']);
  });
  it('removes every date in the range', () => {
    const start = ['2026-08-01', '2026-08-02', '2026-08-03', '2026-08-04', '2026-08-05'];
    const result = applyDateRangePaint(start, '2026-08-03', '2026-08-04', 'remove', getBlockDates);
    expect(result).toEqual(['2026-08-01', '2026-08-02', '2026-08-05']);
  });
  it('is order-independent — a drag ending BEFORE its anchor still expands correctly', () => {
    const result = applyDateRangePaint([], '2026-08-05', '2026-08-03', 'add', getBlockDates);
    expect(result).toEqual(['2026-08-03', '2026-08-04', '2026-08-05']);
  });
  it('collapses to a single-date toggle when the range start equals its end', () => {
    const added = applyDateRangePaint([], '2026-08-03', '2026-08-03', 'add', getBlockDates);
    expect(added).toEqual(['2026-08-03']);
    const removed = applyDateRangePaint(['2026-08-03'], '2026-08-03', '2026-08-03', 'remove', getBlockDates);
    expect(removed).toEqual([]);
  });
  it('never duplicates a date already present when adding an overlapping range', () => {
    const result = applyDateRangePaint(['2026-08-04'], '2026-08-03', '2026-08-05', 'add', getBlockDates);
    expect(result).toEqual(['2026-08-03', '2026-08-04', '2026-08-05']);
  });
});
