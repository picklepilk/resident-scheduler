import { describe, it, expect } from 'vitest';
import { coverageCellStatus, buildHeatmapRows, heatmapCell } from './coverageBoard.js';

describe('coverageCellStatus', () => {
  it('reads empty when nothing required and nothing filled', () => {
    expect(coverageCellStatus({ count: 0, min: 0, max: 1 })).toBe('empty');
  });
  it('reads below when under min', () => {
    expect(coverageCellStatus({ count: 1, min: 2, max: 3 })).toBe('below');
  });
  it('reads atMin when exactly at the floor', () => {
    expect(coverageCellStatus({ count: 2, min: 2, max: 3 })).toBe('atMin');
  });
  it('reads between when above min but at/under max', () => {
    expect(coverageCellStatus({ count: 3, min: 2, max: 3 })).toBe('between');
  });
  it('reads over when above max', () => {
    expect(coverageCellStatus({ count: 4, min: 2, max: 3 })).toBe('over');
  });
  it('treats count>0 with min:0 as over (not empty) once it exceeds max:0', () => {
    expect(coverageCellStatus({ count: 1, min: 0, max: 0 })).toBe('over');
  });
});

describe('buildHeatmapRows', () => {
  const shifts = [
    { id: 'POD-N', area: 'POD', type: 'night' },
    { id: 'POD-D', area: 'POD', type: 'day' },
    { id: 'PED-S', area: 'PED', type: 'swing' },
    { id: 'PED-D', area: 'PED', type: 'day' },
    { id: 'POD-E', area: 'POD', type: 'eve' },
  ];
  it('groups by area in SHIFT_AREAS order and sorts shifts day->swing->eve->night within an area', () => {
    const rows = buildHeatmapRows(shifts);
    expect(rows.map(r => r.area)).toEqual(['POD', 'PED']); // SHIFT_AREAS order, TRAUMA/FLEX/MT omitted (no active shift)
    expect(rows[0].shifts.map(s => s.id)).toEqual(['POD-D', 'POD-E', 'POD-N']);
    expect(rows[1].shifts.map(s => s.id)).toEqual(['PED-D', 'PED-S']);
  });
  it('omits an area with no active shifts entirely', () => {
    const rows = buildHeatmapRows([{ id: 'MT-D', area: 'MT', type: 'day' }]);
    expect(rows).toEqual([{ area: 'MT', shifts: [{ id: 'MT-D', area: 'MT', type: 'day' }] }]);
  });
  it('handles an empty input', () => {
    expect(buildHeatmapRows([])).toEqual([]);
  });
});

describe('heatmapCell', () => {
  // Shaped exactly like computeCoverageByDate's own return value (ResidentScheduler.jsx) so this
  // documents/tests the equality contract: the heatmap reads the SAME numbers, never re-derives them.
  const coverageByDate = {
    '2026-11-02': { perShift: { 'POD-D': { count: 1, min: 2, max: 2 }, 'POD-E': { count: 2, min: 2, max: 2 } } },
  };
  it('passes count/min/max through unchanged and attaches a status', () => {
    expect(heatmapCell(coverageByDate, '2026-11-02', 'POD-D')).toEqual({ count: 1, min: 2, max: 2, status: 'below' });
    expect(heatmapCell(coverageByDate, '2026-11-02', 'POD-E')).toEqual({ count: 2, min: 2, max: 2, status: 'atMin' });
  });
  it('returns null for a shift absent on that date (structurally not running, e.g. TRAUMA-D/N off-window)', () => {
    expect(heatmapCell(coverageByDate, '2026-11-02', 'TRAUMA-D')).toBeNull();
  });
  it('returns null for a date absent from coverageByDate entirely', () => {
    expect(heatmapCell(coverageByDate, '2099-01-01', 'POD-D')).toBeNull();
  });
});
