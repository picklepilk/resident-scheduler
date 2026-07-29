import { describe, it, expect } from 'vitest';
import {
  SHIFTS, SHIFT_MAP, SHIFT_TIMING, SHIFT_DOW, SHIFT_AREAS, SHIFT_TYPES,
  shiftStartMs, shiftEndMs, isNightShiftId, shiftOverlapsJC,
} from './shifts.js';

describe('shift catalog integrity', () => {
  it('every SHIFTS entry has a matching SHIFT_TIMING entry', () => {
    for (const s of SHIFTS) {
      expect(SHIFT_TIMING[s.id], `missing SHIFT_TIMING for ${s.id}`).toBeDefined();
    }
  });

  it('every SHIFTS entry area/type is a recognized value', () => {
    for (const s of SHIFTS) {
      expect(SHIFT_AREAS).toContain(s.area);
      expect(SHIFT_TYPES).toContain(s.type);
    }
  });

  it('SHIFT_MAP looks up the same object as SHIFTS by id', () => {
    expect(SHIFT_MAP['POD-D']).toBe(SHIFTS.find(s => s.id === 'POD-D'));
  });
});

describe('SHIFT_DOW', () => {
  it('PED-S only exists Mon/Tue/Thu/Fri', () => {
    expect(SHIFT_DOW['PED-S']).toEqual([1, 2, 4, 5]);
  });

  it('a shift absent from SHIFT_DOW has no day-of-week restriction', () => {
    expect(SHIFT_DOW['POD-D']).toBeUndefined();
  });
});

describe('shiftStartMs / shiftEndMs', () => {
  it('computes start/end for a same-day shift', () => {
    const start = shiftStartMs('POD-D', '2026-07-01');
    const end = shiftEndMs('POD-D', '2026-07-01');
    expect(end - start).toBe(9 * 3600_000);
    expect(new Date(start).getHours()).toBe(7);
  });

  it('a midnight-rollover shift ends more than 24h into the next day\'s clock time', () => {
    // POD-N: 23:00 start, 9h duration -> ends 08:00 the next calendar day
    const start = shiftStartMs('POD-N', '2026-07-01');
    const end = shiftEndMs('POD-N', '2026-07-01');
    const endDate = new Date(end);
    expect(endDate.getHours()).toBe(8);
    expect(endDate.getDate()).toBe(2);
  });

  it('returns null for an unknown shift id', () => {
    expect(shiftStartMs('NOT-A-SHIFT', '2026-07-01')).toBeNull();
    expect(shiftEndMs('NOT-A-SHIFT', '2026-07-01')).toBeNull();
  });
});

describe('isNightShiftId', () => {
  it('is true for night-type shifts', () => {
    expect(isNightShiftId('POD-N')).toBe(true);
    expect(isNightShiftId('TRAUMA-N')).toBe(true);
    expect(isNightShiftId('POD-N12')).toBe(true);
  });

  it('is false for day/eve/swing shifts', () => {
    expect(isNightShiftId('POD-D')).toBe(false);
    expect(isNightShiftId('POD-E')).toBe(false);
    expect(isNightShiftId('PED-S')).toBe(false);
  });

  it('is false for an unknown shift id', () => {
    expect(isNightShiftId('NOT-A-SHIFT')).toBe(false);
  });
});

describe('shiftOverlapsJC (Journal Club is 18:00-21:00)', () => {
  it('covers PED-S (11:00-20:00)', () => {
    expect(shiftOverlapsJC('PED-S')).toBe(true);
  });

  it('covers TRAUMA-N (18:00-06:00, starts exactly at JC start)', () => {
    expect(shiftOverlapsJC('TRAUMA-N')).toBe(true);
  });

  it('covers a plain eve shift (15:00-00:00)', () => {
    expect(shiftOverlapsJC('POD-E')).toBe(true);
  });

  it('does not cover a day shift that ends before JC starts (07:00-16:00)', () => {
    expect(shiftOverlapsJC('POD-D')).toBe(false);
  });

  it('does not cover an unknown shift id', () => {
    expect(shiftOverlapsJC('NOT-A-SHIFT')).toBe(false);
  });
});
