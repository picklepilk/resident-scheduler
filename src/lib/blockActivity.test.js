import { describe, it, expect } from 'vitest';
import {
  ACTIVITY_KINDS, normalizeActivityLog, appendActivity, lastActivity,
  unseenByOthers, summarizeActivity, actorLabel, relativeTime,
} from './blockActivity.js';

const E = (over = {}) => ({ at: '2026-10-16T20:00:00.000Z', by: 'u1', email: 'a@x.org', kind: 'edit', cells: 1, count: 1, note: null, ...over });

describe('normalizeActivityLog', () => {
  it('returns [] for non-arrays', () => {
    expect(normalizeActivityLog(null)).toEqual([]);
    expect(normalizeActivityLog({})).toEqual([]);
    expect(normalizeActivityLog('x')).toEqual([]);
  });
  it('drops junk, coerces fields, sorts ascending', () => {
    const out = normalizeActivityLog([
      E({ at: '2026-10-16T22:00:00.000Z', cells: 2.7, count: -3, email: 5, note: 7 }),
      null, 'str', { kind: 'edit' },
      E({ at: 'not a date' }),
      E({ kind: 'bogus' }),
      E({ at: '2026-10-16T21:00:00.000Z', by: undefined }),
    ]);
    expect(out).toHaveLength(2);
    expect(out[0].at).toBe('2026-10-16T21:00:00.000Z');
    expect(out[0].by).toBeNull();
    expect(out[1]).toMatchObject({ cells: 2, count: 1, email: null, note: null });
  });
  it('exports frozen kinds', () => {
    expect(Object.isFrozen(ACTIVITY_KINDS)).toBe(true);
    expect(ACTIVITY_KINDS).toEqual(['generate', 'edit', 'lock', 'undo', 'clear', 'import']);
  });
});

describe('appendActivity', () => {
  it('merges same actor+kind within window', () => {
    const log = [E()];
    const out = appendActivity(log, E({ at: '2026-10-16T20:10:00.000Z', cells: 3, note: 'n' }));
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ at: '2026-10-16T20:10:00.000Z', cells: 4, count: 2, note: 'n' });
    expect(log).toHaveLength(1);
    expect(log[0].count).toBe(1);
  });
  it('keeps previous note when new note is null', () => {
    const out = appendActivity([E({ note: 'old' })], E({ at: '2026-10-16T20:01:00.000Z' }));
    expect(out[0].note).toBe('old');
  });
  it('does not merge across kinds, actors, emails, or after the window', () => {
    const log = [E()];
    expect(appendActivity(log, E({ at: '2026-10-16T20:01:00.000Z', kind: 'lock' }))).toHaveLength(2);
    expect(appendActivity(log, E({ at: '2026-10-16T20:01:00.000Z', by: 'u2' }))).toHaveLength(2);
    expect(appendActivity(log, E({ at: '2026-10-16T20:01:00.000Z', email: 'b@x.org' }))).toHaveLength(2);
    expect(appendActivity(log, E({ at: '2026-10-16T20:16:00.000Z' }))).toHaveLength(2);
  });
  it('never merges generate', () => {
    const log = [E({ kind: 'generate' })];
    expect(appendActivity(log, E({ kind: 'generate', at: '2026-10-16T20:01:00.000Z' }))).toHaveLength(2);
  });
  it('does not merge an out-of-order (earlier) entry', () => {
    expect(appendActivity([E()], E({ at: '2026-10-16T19:59:00.000Z' }))).toHaveLength(2);
  });
  it('caps to newest entries', () => {
    let log = [];
    for (let i = 0; i < 5; i++) log = appendActivity(log, E({ kind: 'generate', at: `2026-10-16T2${i}:00:00.000Z` }), { cap: 3 });
    expect(log).toHaveLength(3);
    expect(log[0].at).toBe('2026-10-16T22:00:00.000Z');
  });
  it('tolerates a junk log', () => {
    expect(appendActivity(undefined, E())).toHaveLength(1);
  });
});

describe('lastActivity / unseenByOthers', () => {
  const log = [
    E({ at: '2026-10-16T20:00:00.000Z', by: 'u2', email: 'g@x.org' }),
    E({ at: '2026-10-16T21:00:00.000Z', by: 'u1' }),
    E({ at: '2026-10-16T22:00:00.000Z', by: 'u2', email: 'g@x.org', kind: 'generate' }),
  ];
  it('lastActivity', () => {
    expect(lastActivity(log).kind).toBe('generate');
    expect(lastActivity([])).toBeNull();
  });
  it('null seen returns all others newest first', () => {
    const out = unseenByOthers(log, 'u1', null);
    expect(out.map(e => e.at)).toEqual(['2026-10-16T22:00:00.000Z', '2026-10-16T20:00:00.000Z']);
  });
  it('seen cutoff', () => {
    expect(unseenByOthers(log, 'u1', '2026-10-16T21:30:00.000Z')).toHaveLength(1);
  });
  it('null viewer treats null-actor entries as own', () => {
    const l = [E({ by: null, email: null }), E({ by: 'u2', at: '2026-10-16T21:00:00.000Z' })];
    expect(unseenByOthers(l, null, null)).toHaveLength(1);
    expect(unseenByOthers(l, undefined, null)).toHaveLength(1);
  });
});

describe('summarizeActivity', () => {
  it('sums', () => {
    const s = summarizeActivity([
      E({ cells: 5 }), E({ kind: 'lock', cells: 2 }), E({ kind: 'undo', cells: 1 }), E({ kind: 'clear', cells: 10 }),
      E({ kind: 'generate', cells: 99, count: 1, email: 'b@x.org' }), E({ kind: 'import', count: 2, email: null }),
    ]);
    expect(s.edits).toBe(18);
    expect(s.generates).toBe(1);
    expect(s.imports).toBe(2);
    expect(s.actors).toEqual(['a@x.org', 'b@x.org', null]);
  });
});

describe('actorLabel', () => {
  it('You', () => expect(actorLabel(E(), { userId: 'u1' })).toBe('You'));
  it('email local-part capitalized', () => {
    expect(actorLabel(E({ email: 'graham.smith@x.org' }), { userId: 'u9' })).toBe('Graham.smith');
    expect(actorLabel(E({ email: 'graham@x.org' }), undefined)).toBe('Graham');
  });
  it('This device', () => expect(actorLabel(E({ by: null, email: null }), null)).toBe('This device'));
});

describe('relativeTime', () => {
  const now = Date.parse('2026-10-17T12:00:00.000Z');
  const ago = ms => new Date(now - ms).toISOString();
  it('buckets', () => {
    expect(relativeTime(ago(30 * 1000), now)).toBe('just now');
    expect(relativeTime(ago(5 * 60 * 1000), now)).toBe('5m ago');
    expect(relativeTime(ago(3 * 3600 * 1000), now)).toBe('3h ago');
    expect(relativeTime(ago(2 * 86400 * 1000), now)).toBe('2d ago');
    expect(relativeTime('2026-10-01T12:00:00.000Z', now)).toMatch(/^Oct [12]$/);
  });
  it('future clamps to just now; bad input is empty', () => {
    expect(relativeTime(ago(-5000), now)).toBe('just now');
    expect(relativeTime('junk', now)).toBe('');
  });
});
