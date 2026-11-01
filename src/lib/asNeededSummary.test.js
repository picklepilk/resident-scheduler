import { describe, it, expect } from 'vitest';
import { summarizeAsNeeded } from './asNeededSummary.js';

describe('summarizeAsNeeded', () => {
  it('groups by label and resident, units-aware, names from map only', () => {
    const s = summarizeAsNeeded([
      { residentId: 'a', name: 'LEAK', label: 'X', dateStr: 'd' },
      { residentId: 'a', label: 'Night above 6 this block', units: 3 },
      { residentId: 'b', label: 'X' },
    ], { a: 'Doe, A', b: 'Roe, B' });
    expect(s.total).toBe(5);
    expect(s.byLabel[0]).toEqual({ label: 'Night above 6 this block', count: 3 });
    expect(s.byResident[0]).toMatchObject({ residentId: 'a', name: 'Doe, A', count: 4 });
    expect(JSON.stringify(s)).not.toContain('LEAK');
  });
  it('guards untrusted input', () => {
    for (const bad of [null, undefined, 'x', 5, {}, [null, 3, 'a', [], { units: -2 }]]) {
      expect(() => summarizeAsNeeded(bad, null)).not.toThrow();
    }
    expect(summarizeAsNeeded(null).total).toBe(0);
    const s = summarizeAsNeeded([{ residentId: 'z', units: 'bad' }], {});
    expect(s.total).toBe(1);
    expect(s.byResident[0].name).toBe('z');
  });
});
