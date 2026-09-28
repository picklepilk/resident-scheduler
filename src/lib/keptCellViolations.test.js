// src/lib/keptCellViolations.test.js
import { describe, it, expect } from 'vitest';
import { violatingCells, keptCellsForMode } from './keptCellViolations.js';

const schedule = {
  a: { '2026-01-01': 'POD-D', '2026-01-02': 'POD-N' },
  b: { '2026-01-01': 'FLEX-D' },
  c: { '2026-01-05': 'MT-D' }, // no matching issue below — should never appear
};

const issues = [
  // Hard, cell-attributable — resident a, 1/1 (unlocked in the default lockedCells below)
  { residentId: 'a', name: 'A One', dateStr: '2026-01-01', shiftId: 'POD-D', message: 'Overlap with prior shift', level: 'error' },
  // Second hard issue on the SAME cell — should collapse into the same entry, not a duplicate
  { residentId: 'a', name: 'A One', dateStr: '2026-01-01', shiftId: 'POD-D', message: 'Jeopardy conflict', level: 'error' },
  // Hard, cell-attributable — resident b, 1/1 (locked)
  { residentId: 'b', name: 'B Two', dateStr: '2026-01-01', shiftId: 'FLEX-D', message: 'Rest violation', level: 'warn' },
  { residentId: 'b', name: 'B Two', dateStr: '2026-01-01', shiftId: 'FLEX-D', message: 'GR-adjacent night', level: 'error' },
  // Not cell-attributable (underTarget) — must be dropped regardless of level
  { residentId: 'a', name: 'A One', dateStr: null, shiftId: null, message: 'Under target: 15/18 shifts', level: 'error', rule: 'underTarget' },
  // Stale — resident a has no shift on 1/3 any more
  { residentId: 'a', name: 'A One', dateStr: '2026-01-03', shiftId: 'POD-D', message: 'Ghost issue', level: 'error' },
  // Soft warn on an otherwise-clean cell — never fixable/locked material
  { residentId: 'a', name: 'A One', dateStr: '2026-01-02', shiftId: 'POD-N', message: 'Isolated night stint', level: 'warn' },
];

const lockedCells = { b: { '2026-01-01': true } };

describe('violatingCells', () => {
  it('splits hard cell-attributable issues into fixable vs locked, collapsing duplicates per cell', () => {
    const { fixable, locked } = violatingCells(issues, schedule, lockedCells);
    expect(fixable).toEqual([
      { residentId: 'a', name: 'A One', dateStr: '2026-01-01', shiftId: 'POD-D', messages: ['Overlap with prior shift', 'Jeopardy conflict'] },
    ]);
    expect(locked).toEqual([
      { residentId: 'b', name: 'B Two', dateStr: '2026-01-01', shiftId: 'FLEX-D', messages: ['GR-adjacent night'] },
    ]);
  });

  it('returns nothing when there are no hard cell-attributable issues', () => {
    expect(violatingCells([], schedule, lockedCells)).toEqual({ fixable: [], locked: [] });
  });

  it('drops an issue whose cell is already empty (stale)', () => {
    const { fixable, locked } = violatingCells(
      [{ residentId: 'c', name: 'C Three', dateStr: '2026-01-09', shiftId: 'MT-D', message: 'x', level: 'error' }],
      schedule, lockedCells
    );
    expect(fixable).toEqual([]);
    expect(locked).toEqual([]);
  });
});

describe('keptCellsForMode', () => {
  const split = {
    fixable: [
      { residentId: 'a', dateStr: '2026-01-01', shiftId: 'POD-D', messages: ['x'] },
      { residentId: 'a', dateStr: '2026-01-10', shiftId: 'POD-D', messages: ['y'] },
    ],
    locked: [
      { residentId: 'b', dateStr: '2026-01-01', shiftId: 'FLEX-D', messages: ['z'] },
    ],
  };

  it('fill mode: everything survives (nothing is cleared)', () => {
    expect(keptCellsForMode(split, 'fill')).toEqual(split);
  });

  it('clear mode: nothing survives (whole schedule wiped)', () => {
    expect(keptCellsForMode(split, 'clear')).toEqual({ fixable: [], locked: [] });
  });

  it('unlocked mode: only locked survives (every unlocked cell gets cleared+refilled)', () => {
    expect(keptCellsForMode(split, 'unlocked')).toEqual({ fixable: [], locked: split.locked });
  });

  it('range mode: locked survives plus fixable cells OUTSIDE the range', () => {
    const result = keptCellsForMode(split, 'range', '2026-01-01', '2026-01-05');
    expect(result.locked).toEqual(split.locked);
    expect(result.fixable).toEqual([split.fixable[1]]); // only the 1/10 one is outside [1/1,1/5]
  });
});
