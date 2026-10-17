import { describe, it, expect } from 'vitest';
import { buildOffServiceAlignment } from './offServiceAlignment.js';

const AY = 'AY26/27';
const B = {
  b1: { id: 'b1', name: 'Block 1', start: '2026-07-01', end: '2026-07-28' },
  b2: { id: 'b2', name: 'Block 2', start: '2026-07-29', end: '2026-08-25' },
  b3: { id: 'b3', name: 'Block 3', start: '2026-08-26', end: '2026-09-22' },
};
const rec = (first, ranges, extra = {}) => ({
  id: `${first}-${Math.random()}`, firstName: first, lastName: 'Doe', category: 'IM', pgy: 1,
  availabilityMode: 'ranges', availableRanges: ranges, ...extra,
});
const snap = (b, recs, ay = AY) => ({
  id: b.id, name: b.name, academicYear: ay, startDate: b.start, endDate: b.end, published: false,
  data: { startDate: b.start, endDate: b.end, academicYear: ay, offServiceResidents: recs },
});
const run = (snapshots, liveBlock = null) => buildOffServiceAlignment({ snapshots, liveBlock, ay: AY });
const one = out => out.residents[0];

describe('buildOffServiceAlignment', () => {
  it('aligned single block', () => {
    const r = one(run([snap(B.b1, [rec('Ann', [{ start: B.b1.start, end: B.b1.end }])])]));
    expect(r.status).toBe('aligned');
    expect(r.segments).toEqual([{ blockId: 'b1', start: '2026-07-01', end: '2026-07-28', days: 28, daysBefore: 0, daysAfter: 0 }]);
  });

  it('aligned spanning B1+B2', () => {
    const w = [{ start: '2026-07-01', end: '2026-08-25' }];
    const out = run([snap(B.b1, [rec('Ann', w)]), snap(B.b2, [rec('Ann', w)])]);
    expect(out.residents).toHaveLength(1);
    expect(one(out).status).toBe('aligned');
    expect(one(out).blockIds).toEqual(['b1', 'b2']);
    expect(out.counts.aligned).toBe(1);
  });

  it('straddles with straddle-derived segments', () => {
    const w = [{ start: '2026-07-13', end: '2026-08-09' }];
    const out = run([snap(B.b1, [rec('Ann', w)]), snap(B.b2, [rec('Ann', w)])]);
    const r = one(out);
    expect(r.status).toBe('straddles');
    expect(r.segments).toEqual([
      { blockId: 'b1', start: '2026-07-13', end: '2026-07-28', days: 16, daysBefore: 0, daysAfter: 12 },
      { blockId: 'b2', start: '2026-07-29', end: '2026-08-09', days: 12, daysBefore: 16, daysAfter: 0 },
    ]);
    expect(r.notes.join(' ')).toMatch(/Jul 13.*starts mid-block in Block 1/);
    expect(r.notes.join(' ')).toMatch(/ends mid-block in Block 2/);
  });

  it('split: two windows in one record', () => {
    const out = run([snap(B.b1, [rec('Ann', [{ start: '2026-07-01', end: '2026-07-28' }, { start: '2026-08-26', end: '2026-09-22' }])]), snap(B.b2, []), snap(B.b3, [])]);
    expect(one(out).status).toBe('split');
    expect(one(out).windows).toHaveLength(2);
  });

  it('split: windows in B1 and B3 only, B2 between (not bound-exact, so not legacyClamped)', () => {
    const out = run([
      snap(B.b1, [rec('Ann', [{ start: '2026-07-10', end: '2026-07-28' }])]),
      snap(B.b2, []),
      snap(B.b3, [rec('Ann', [{ start: '2026-08-26', end: '2026-09-10' }])]),
    ]);
    expect(one(out).status).toBe('split');
    expect(one(out).blockIds).toEqual(['b1', 'b3']);
  });

  it('precedence: bound-exact B1+B3 records with differing ranges read as legacyClamped, not split', () => {
    const out = run([
      snap(B.b1, [rec('Ann', [{ start: B.b1.start, end: B.b1.end }])]),
      snap(B.b2, []),
      snap(B.b3, [rec('Ann', [{ start: B.b3.start, end: B.b3.end }])]),
    ]);
    expect(one(out).status).toBe('legacyClamped');
  });

  it('outside: days before the first block', () => {
    const out = run([snap(B.b1, [rec('Ann', [{ start: '2026-06-20', end: '2026-07-10' }])])]);
    const r = one(out);
    expect(r.status).toBe('outside');
    expect(r.notes[0]).toMatch(/Jun 20–Jun 30/);
  });

  it('noWindow for availabilityMode full', () => {
    const out = run([snap(B.b1, [rec('Ann', [], { availabilityMode: 'full' })])]);
    expect(one(out).status).toBe('noWindow');
    expect(one(out).windows).toEqual([]);
  });

  it('legacyClamped: ranges equal each block bounds and differ', () => {
    const out = run([
      snap(B.b1, [rec('Ann', [{ start: B.b1.start, end: B.b1.end }])]),
      snap(B.b2, [rec('Ann', [{ start: B.b2.start, end: B.b2.end }])]),
    ]);
    expect(one(out).status).toBe('legacyClamped');
    expect(one(out).notes[0]).toMatch(/re-import the Master Matrix/);
    expect(out.counts.legacyClamped).toBe(1);
    expect(out.counts.misaligned).toBe(1);
  });

  it('live block overrides same-id snapshot', () => {
    const live = { ...B.b1, startDate: B.b1.start, endDate: B.b1.end, academicYear: AY, offServiceResidents: [rec('Zed', [{ start: B.b1.start, end: B.b1.end }])] };
    const out = run([snap(B.b1, [rec('Ann', [{ start: B.b1.start, end: B.b1.end }])])], live);
    expect(out.blocks).toHaveLength(1);
    expect(out.blocks[0].isLive).toBe(true);
    expect(out.residents.map(r => r.name)).toEqual(['Zed Doe']);
  });

  it('excludes other-AY snapshots', () => {
    const out = run([snap(B.b1, [rec('Ann', [{ start: B.b1.start, end: B.b1.end }])], 'AY25/26')]);
    expect(out.blocks).toEqual([]);
    expect(out.residents).toEqual([]);
  });

  it('does not throw on malformed input', () => {
    expect(() => buildOffServiceAlignment({ snapshots: 'x', ay: AY })).not.toThrow();
    expect(() => buildOffServiceAlignment({ snapshots: [null, {}, { id: 'q', academicYear: AY }], ay: AY })).not.toThrow();
    const out = buildOffServiceAlignment({ snapshots: [snap(B.b1, [null, { availabilityMode: 'ranges' }, rec('Ann', [{ start: '2026-07-09', end: '2026-07-01' }, { start: 'bad', end: 'x' }])])], ay: AY });
    expect(out.residents).toHaveLength(1);
    expect(out.residents[0].status).toBe('noWindow');
    expect(() => buildOffServiceAlignment()).not.toThrow();
  });

  it('orders misaligned first, then aligned, then noWindow, by last name', () => {
    const mk = (first, last, ranges, extra) => ({ ...rec(first, ranges, extra), lastName: last });
    const full = [{ start: B.b1.start, end: B.b1.end }];
    const out = run([snap(B.b1, [
      mk('A', 'Zulu', [], { availabilityMode: 'full' }),
      mk('B', 'Yank', full),
      mk('C', 'Xray', [{ start: '2026-07-10', end: '2026-07-20' }]),
      mk('D', 'Wolf', [{ start: '2026-07-10', end: '2026-07-20' }]),
    ])]);
    expect(out.residents.map(r => r.name)).toEqual(['D Wolf', 'C Xray', 'B Yank', 'A Zulu']);
    expect(out.residents.map(r => r.status)).toEqual(['straddles', 'straddles', 'aligned', 'noWindow']);
    expect(out.counts).toMatchObject({ aligned: 1, straddles: 2, noWindow: 1, misaligned: 2 });
  });
});
