import { describe, it, expect } from 'vitest';
import { ackKeyFor, isAckable, partitionAcked, addAcks, removeAcks, pruneAcks, normalizeAcks } from './issueAcks.js';

const w = (o = {}) => ({ level: 'warn', rule: 'x', residentId: 'r1', dateStr: '2026-07-01', shiftId: 'POD-D', message: 'Isolated night stint of 3 (Wed 1/5-Fri 1/7)', ...o });
const e = () => ({ level: 'error', rule: 'y', residentId: 'r1', message: 'bad' });

describe('issueAcks', () => {
  it('key distinguishes resident/date/shift/anchorDate and lapses when count or wording changes', () => {
    expect(ackKeyFor(w())).toBe(ackKeyFor(w({ message: '  Isolated night stint of 3 (Wed 1/5-Fri 1/7) ' })));
    expect(ackKeyFor(w())).not.toBe(ackKeyFor(w({ message: 'Isolated night stint of 2 (Wed 1/5-Fri 1/6)' })));
    expect(ackKeyFor(w())).not.toBe(ackKeyFor(w({ residentId: 'r2' })));
    expect(ackKeyFor(w())).not.toBe(ackKeyFor(w({ dateStr: '2026-07-02' })));
    expect(ackKeyFor(w())).not.toBe(ackKeyFor(w({ shiftId: 'POD-N' })));
    const stint = a => w({ dateStr: undefined, shiftId: undefined, anchorDate: a, message: 'Isolated night stint' });
    expect(ackKeyFor(stint('2026-07-03'))).not.toBe(ackKeyFor(stint('2026-07-20')));
  });
  it('worsened count no longer matches an existing ack', () => {
    const acks = addAcks({}, [w({ message: '2 separate night stints this block' })], { at: 't' });
    const { active, acked } = partitionAcked([w({ message: '3 separate night stints this block' })], acks);
    expect(acked).toHaveLength(0);
    expect(active).toHaveLength(1);
  });
  it('errors are not ackable and never partitioned as acked', () => {
    expect(isAckable(e())).toBe(false);
    const acks = addAcks({}, [e(), w()], { by: 'me' });
    expect(Object.keys(acks)).toHaveLength(1);
    const { active, acked } = partitionAcked([e(), w()], { [ackKeyFor(e())]: { at: 'x' }, ...acks });
    expect(acked).toHaveLength(1);
    expect(active).toEqual([e()]);
  });
  it('add keeps existing, trims note; remove un-acks; prune drops stale', () => {
    const a1 = addAcks({}, [w()], { at: 't1', by: 'a', note: '  ok ' });
    expect(a1[ackKeyFor(w())]).toEqual({ at: 't1', by: 'a', note: 'ok' });
    expect(addAcks(a1, [w()], { at: 't2' })[ackKeyFor(w())].at).toBe('t1');
    expect(removeAcks(a1, [w()])).toEqual({});
    expect(pruneAcks(a1, [])).toEqual({});
    expect(pruneAcks(a1, [w()])).toEqual(a1);
  });
  it('normalizeAcks guards untrusted shapes', () => {
    expect(normalizeAcks(null)).toEqual({});
    expect(normalizeAcks([1])).toEqual({});
    expect(normalizeAcks({ a: 5, b: { note: 3 } })).toEqual({ b: { at: '', by: '', note: '' } });
  });
});
