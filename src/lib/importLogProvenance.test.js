import { describe, it, expect } from 'vitest';
import { stampNewEntries, sourcesFor } from './importLog.js';

describe('stampNewEntries', () => {
  it('stamps only new entries that lack by', () => {
    const prev = [{ id: 'a' }];
    const next = [{ id: 'a' }, { id: 'b' }, { id: 'c', by: 'x@y' }];
    expect(stampNewEntries(next, prev, 'me@x')).toEqual([{ id: 'a' }, { id: 'b', by: 'me@x' }, { id: 'c', by: 'x@y' }]);
  });
  it('no-ops without an actor or with a non-array', () => {
    const next = [{ id: 'b' }];
    expect(stampNewEntries(next, [], null)).toBe(next);
    expect(stampNewEntries('junk', [], 'me')).toBe('junk');
  });
});

describe('sourcesFor', () => {
  const log = [
    { id: '1', kind: 'matrix', blockStarts: ['2026-07-01'], ays: ['AY26/27'] },
    { id: '2', kind: 'academic', ays: ['AY26/27'] },
    { id: '3', kind: 'vacation' },
    { id: '4', kind: 'qgenda', blockStarts: ['2026-08-01'], ays: ['AY26/27'] },
    { id: '5', kind: 'academic', ays: ['AY25/26'] },
  ];
  it('scopes by block start first, then AY; unscoped go to global; newest first', () => {
    const r = sourcesFor(log, { blockStart: '2026-07-01', ay: 'AY26/27' });
    expect(r.scoped.map(e => [e.id, e.matchedBy])).toEqual([['2', 'ay'], ['1', 'block']]);
    expect(r.global.map(e => e.id)).toEqual(['3']);
  });
  it('AY-only view (no block) includes every block-scoped entry of that AY', () => {
    expect(sourcesFor(log, { blockStart: null, ay: 'AY26/27' }).scoped.map(e => e.id)).toEqual(['4', '2', '1']);
  });
  it('tolerates a corrupt log', () => {
    expect(sourcesFor(null, { blockStart: 'x', ay: 'y' })).toEqual({ scoped: [], global: [] });
  });
});
