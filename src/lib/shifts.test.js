import { describe, it, expect } from 'vitest';
import {
  SHIFTS, SHIFT_MAP, SHIFT_TIMING, SHIFT_DOW, SHIFT_AREAS, SHIFT_TYPES,
  shiftStartMs, shiftEndMs, isNightShiftId, shiftOverlapsJC, overlappingAssignments,
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

describe('PED-N / PED-N-FM split', () => {
  it('PED-N is retimed to 19:00-04:00 (9h)', () => {
    expect(SHIFT_TIMING['PED-N']).toEqual({ startH: 19, durationH: 9 });
  });

  it('PED-N-FM keeps the original 23:00-08:00 (9h) timing', () => {
    expect(SHIFT_TIMING['PED-N-FM']).toEqual({ startH: 23, durationH: 9 });
  });
});

describe('SHIFT_DOW', () => {
  it('PED-S has no day-of-week restriction — it now exists all 7 days (chief-confirmed against live QGenda)', () => {
    expect(SHIFT_DOW['PED-S']).toBeUndefined();
  });

  it('a shift absent from SHIFT_DOW has no day-of-week restriction', () => {
    expect(SHIFT_DOW['POD-D']).toBeUndefined();
  });

  it('TRAUMA-D only exists Sun/Tue/Thu/Sat (chief-directed must-fill-only-on-these-days)', () => {
    expect(SHIFT_DOW['TRAUMA-D']).toEqual([0, 2, 4, 6]);
  });

  it('TRAUMA-N only exists Sun/Mon/Fri/Sat', () => {
    expect(SHIFT_DOW['TRAUMA-N']).toEqual([0, 1, 5, 6]);
  });

  it('TRAUMA-D and TRAUMA-N windows overlap on Sun/Sat (both shifts exist those days)', () => {
    const overlap = SHIFT_DOW['TRAUMA-D'].filter(d => SHIFT_DOW['TRAUMA-N'].includes(d));
    expect(overlap.sort()).toEqual([0, 6]);
  });

  it('Wednesday (GR day) has neither TRAUMA-D nor TRAUMA-N', () => {
    expect(SHIFT_DOW['TRAUMA-D']).not.toContain(3);
    expect(SHIFT_DOW['TRAUMA-N']).not.toContain(3);
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

  it('retimed PED-N (19:00-04:00) now overlaps JC; PED-N-FM (23:00-08:00) still does not', () => {
    expect(shiftOverlapsJC('PED-N')).toBe(true);
    expect(shiftOverlapsJC('PED-N-FM')).toBe(false);
  });
});

describe('overlappingAssignments', () => {
  const D = '2026-08-05'; // Wednesday — arbitrary, function is date-arithmetic agnostic
  const prevD = '2026-08-04';
  const nextD = '2026-08-06';
  const res = (id, firstName = 'First', lastName = id) => ({ id, firstName, lastName, category: 'EM_HOME' });

  it('lists other residents on the exact same shift that date, excluding the hovered resident', () => {
    const a = res('a'), b = res('b'), c = res('c');
    const schedule = { a: { [D]: 'POD-D' }, b: { [D]: 'POD-D' }, c: { [D]: 'POD-D' } };
    const out = overlappingAssignments(schedule, [a, b, c], D, 'POD-D', { residentId: 'a' });
    expect(out.same.map(r => r.id).sort()).toEqual(['b', 'c']);
    expect(out.same.some(r => r.id === 'a')).toBe(false);
  });

  it('reports "alone" (empty same[]) when nobody else is on the shift', () => {
    const a = res('a');
    const schedule = { a: { [D]: 'POD-D' } };
    const out = overlappingAssignments(schedule, [a], D, 'POD-D', { residentId: 'a' });
    expect(out.same).toEqual([]);
  });

  it('catches a previous-day night shift spilling past midnight into the hovered shift (MT-N 23:00+9h -> 08:00, overlapping POD-D 07:00-16:00)', () => {
    // MT-N spillover on D is 00:00-08:00; POD-D is 07:00-16:00 -> overlap 07:00-08:00.
    const a = res('a', 'Hovered'), b = res('b', 'Night', 'Owl');
    const schedule = { a: { [D]: 'POD-D' }, b: { [prevD]: 'MT-N' } };
    const out = overlappingAssignments(schedule, [a, b], D, 'POD-D', { residentId: 'a' });
    expect(out.overlapping).toEqual([{ shiftId: 'MT-N', residents: [{ id: 'b', name: 'Night Owl' }] }]);
  });

  it('catches a next-day shift that starts before the hovered midnight-crossing shift ends (hovering POD-N 23:00(D)+9h -> 08:00(nextD); FLEX-D starts 06:00 on nextD)', () => {
    const a = res('a', 'Hovered'), b = res('b', 'Early', 'Bird');
    const schedule = { a: { [D]: 'POD-N' }, b: { [nextD]: 'FLEX-D' } };
    const out = overlappingAssignments(schedule, [a, b], D, 'POD-N', { residentId: 'a' });
    expect(out.overlapping).toEqual([{ shiftId: 'FLEX-D', residents: [{ id: 'b', name: 'Early Bird' }] }]);
  });

  it('a next-day shift starting exactly when the hovered shift ends is a handoff, not an overlap (half-open interval)', () => {
    // TRAUMA-N on D runs 18:00(D)-06:00(nextD); FLEX-D starts exactly 06:00 on nextD.
    const a = res('a'), b = res('b');
    const schedule = { a: { [D]: 'TRAUMA-N' }, b: { [nextD]: 'FLEX-D' } };
    const out = overlappingAssignments(schedule, [a, b], D, 'TRAUMA-N', { residentId: 'a' });
    expect(out.overlapping).toEqual([]);
  });

  it('excludes a same-date shift whose hours do not actually overlap (TRAUMA-D 06:00-18:00 vs POD-N 23:00-08:00)', () => {
    const a = res('a'), b = res('b');
    const schedule = { a: { [D]: 'TRAUMA-D' }, b: { [D]: 'POD-N' } };
    const out = overlappingAssignments(schedule, [a, b], D, 'TRAUMA-D', { residentId: 'a' });
    expect(out.overlapping).toEqual([]);
  });

  it('groups overlapping residents by shift id and orders groups by the SHIFTS catalog order', () => {
    // POD-D (07:00-16:00) overlaps both FLEX-D (06:00-15:00) and MT-D (07:00-16:00) same date.
    // SHIFTS catalog order puts FLEX-D before MT-D.
    const a = res('a'), flex = res('flex'), mt = res('mt');
    const schedule = { a: { [D]: 'POD-D' }, flex: { [D]: 'FLEX-D' }, mt: { [D]: 'MT-D' } };
    const out = overlappingAssignments(schedule, [a, flex, mt], D, 'POD-D', { residentId: 'a' });
    expect(out.overlapping.map(g => g.shiftId)).toEqual(['FLEX-D', 'MT-D']);
  });

  it('includes off-service residents (any allResidents entry, regardless of category)', () => {
    const a = res('a'), offSvc = { id: 'off1', firstName: 'Off', lastName: 'Service', category: 'IM' };
    const schedule = { a: { [D]: 'POD-D' }, off1: { [D]: 'POD-D' } };
    const out = overlappingAssignments(schedule, [a, offSvc], D, 'POD-D', { residentId: 'a' });
    expect(out.same).toEqual([{ id: 'off1', name: 'Off Service' }]);
  });

  it('returns empty result for an unknown shift id rather than throwing', () => {
    const out = overlappingAssignments({}, [], D, 'NOT-A-SHIFT');
    expect(out).toEqual({ same: [], overlapping: [] });
  });

  it('a resident with no schedule entries at all is silently skipped', () => {
    const a = res('a'), b = res('b'); // b has no schedule row
    const schedule = { a: { [D]: 'POD-D' } };
    expect(() => overlappingAssignments(schedule, [a, b], D, 'POD-D', { residentId: 'a' })).not.toThrow();
  });
});
