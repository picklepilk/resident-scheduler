import { describe, it, expect } from 'vitest';
import { issueIdentity, netNewIssues, capRows } from './moveImpact.js';

const iss = (o) => ({ level: 'error', rule: 'r', residentId: 'a', dateStr: '2026-07-01', shiftId: 'POD-D', message: 'm', ...o });

describe('moveImpact', () => {
  it('identity ignores whitespace/case in message', () => {
    expect(issueIdentity(iss({ message: ' Foo  Bar ' }))).toBe(issueIdentity(iss({ message: 'foo bar' })));
  });
  it('returns only issues absent before', () => {
    const a = iss({}), b = iss({ dateStr: '2026-07-02' });
    expect(netNewIssues([a], [a, b])).toEqual([b]);
    expect(netNewIssues([a, b], [a])).toEqual([]);
  });
  it('filters non-blocking and honors custom predicate', () => {
    const w = iss({ level: 'warn', rule: 'x' });
    expect(netNewIssues([], [w])).toEqual([]);
    expect(netNewIssues([], [w], i => i.rule === 'x')).toEqual([w]);
  });
  it('multiset: duplicate beyond the baseline count is new', () => {
    const a = iss({});
    expect(netNewIssues([a], [a, { ...a }]).length).toBe(1);
  });
  it('handles junk input', () => {
    expect(netNewIssues(null, undefined)).toEqual([]);
  });
  it('capRows', () => {
    const r = capRows(Array.from({ length: 25 }, (_, i) => i), 20);
    expect(r.rows.length).toBe(20); expect(r.more).toBe(5); expect(r.total).toBe(25);
  });
});
