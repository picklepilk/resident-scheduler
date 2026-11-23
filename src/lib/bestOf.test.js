import { describe, it, expect } from 'vitest';
import { pickBestOfMachines, bestOfLine, bestOfSeed, BEST_OF_TARGET, aggregateBestOfJobs } from './optimizeFlow.js';
import { selectBestOfMachines, bestOfCandidates } from './solverPool.js';
import { normalizeSolverTarget } from './solverClient.js';

const S = (e, w, lo, hi, q = []) => ({ errors: e, blockingWarnings: w, belowMin: lo, aboveMax: hi, quality: q });
const R = (machine, summary, ok = true) => ({ machine, ok, summary });

describe('pickBestOfMachines', () => {
  it('lower lexicographic vector wins; gap is relative on first differing slot', () => {
    const p = pickBestOfMachines([R('Mac', S(0, 0, 0, 0, [10, 5])), R('PicklePower', S(0, 0, 0, 0, [8, 9]))]);
    expect(p.winner.machine).toBe('PicklePower');
    expect(p.ranked.map(r => r.machine)).toEqual(['PicklePower', 'Mac']);
    expect(p.ranked[0].gapPct).toBe(0);
    expect(p.ranked[1].gapPct).toBe(25);
    expect(bestOfLine(p)).toBe('Best of 2: PicklePower won (Mac 25% behind)');
  });
  it('a hard-tier difference beats any quality difference', () => {
    const p = pickBestOfMachines([R('Mac', S(0, 1, 0, 0, [0])), R('PicklePower', S(0, 0, 0, 0, [99]))]);
    expect(p.winner.machine).toBe('PicklePower');
  });
  it('exact tie goes to the earlier machine; gap 0 reads as tied', () => {
    const p = pickBestOfMachines([R('Mac', S(0, 0, 0, 0, [3])), R('PicklePower', S(0, 0, 0, 0, [3]))]);
    expect(p.winner.machine).toBe('Mac');
    expect(p.ranked[1].gapPct).toBe(0);
    expect(bestOfLine(p)).toBe('Best of 2: Mac won (PicklePower tied)');
  });
  it('ignores failed machines; single success wins', () => {
    const p = pickBestOfMachines([R('Mac', null, false), R('PicklePower', S(1, 0, 0, 0))]);
    expect(p.winner.machine).toBe('PicklePower');
    expect(p.failed).toEqual(['Mac']);
    expect(bestOfLine(p)).toBe('Ran on PicklePower only (Mac did not finish)');
  });
  it('a result flagged ok but without a summary counts as failed', () => {
    const p = pickBestOfMachines([R('Mac', undefined, true), R('PicklePower', S(0, 0, 0, 0))]);
    expect(p.winner.machine).toBe('PicklePower');
    expect(p.failed).toEqual(['Mac']);
  });
  it('none succeed -> no winner and an error', () => {
    const p = pickBestOfMachines([R('Mac', null, false), R('PicklePower', null, false)]);
    expect(p.winner).toBeNull();
    expect(p.error).toMatch(/No machine/);
    expect(pickBestOfMachines([]).winner).toBeNull();
    expect(pickBestOfMachines(null).winner).toBeNull();
  });
  it('three machines rank in order', () => {
    const p = pickBestOfMachines([R('Mac', S(0, 0, 0, 0, [5])), R('PicklePower', S(0, 0, 0, 0, [4])), R('PickleBook', S(0, 0, 0, 0, [6]))]);
    expect(p.ranked.map(r => r.machine)).toEqual(['PicklePower', 'Mac', 'PickleBook']);
    expect(p.ranked[1].gapPct).toBe(25);
    expect(p.ranked[2].gapPct).toBe(50);
  });
});

describe('aggregateBestOfJobs', () => {
  const v = (status, extra = {}) => ({ status, ...extra });
  it('running while any machine is unfinished; failed poll counts as running', () => {
    expect(aggregateBestOfJobs([{ machine: 'A', view: v('done', { result: { x: 1 } }) }, { machine: 'B', view: null }]).status).toBe('running');
    expect(aggregateBestOfJobs([{ machine: 'A', view: v('queued') }]).status).toBe('running');
  });
  it('done when all terminal and at least one done', () => {
    const a = aggregateBestOfJobs([{ machine: 'A', view: v('failed', { error: 'boom' }) }, { machine: 'B', view: v('done', { result: { y: 2 } }) }]);
    expect(a.status).toBe('done');
    expect(a.perMachine.map(p => p.status)).toEqual(['failed', 'done']);
  });
  it('all lost -> lost; all cancelled -> cancelled; else failed with errors', () => {
    expect(aggregateBestOfJobs([{ machine: 'A', view: { lost: true } }, { machine: 'B', view: { lost: true } }])).toBe('lost');
    expect(aggregateBestOfJobs([{ machine: 'A', view: v('cancelled') }]).status).toBe('cancelled');
    const f = aggregateBestOfJobs([{ machine: 'A', view: v('failed', { error: 'boom' }) }, { machine: 'B', view: { lost: true } }]);
    expect(f.status).toBe('failed');
    expect(f.error).toBe('A: boom');
  });
  it('empty -> lost', () => { expect(aggregateBestOfJobs([])).toBe('lost'); });
});

describe('seeds and target', () => {
  it('seeds step by 1000 from the base', () => {
    expect([0, 1, 2].map(i => bestOfSeed(i))).toEqual([42, 1042, 2042]);
  });
  it('pool:best survives normalizeSolverTarget', () => {
    expect(normalizeSolverTarget(BEST_OF_TARGET, { pool: [] })).toBe('pool:best');
  });
});

describe('selectBestOfMachines', () => {
  const up = (name, extra = {}) => ({ name, url: `https://${name.toLowerCase()}.test`, online: true, busy: false, ...extra });
  const pool = [up('Mac'), up('PicklePower'), up('PickleBook')];
  it('defaults to Mac + PicklePower; PickleBook only when ticked', () => {
    expect(selectBestOfMachines(pool).machines.map(m => m.name)).toEqual(['Mac', 'PicklePower']);
    expect(selectBestOfMachines(pool, { includeExtra: true }).machines.map(m => m.name)).toEqual(['Mac', 'PicklePower', 'PickleBook']);
    expect(selectBestOfMachines(pool).extraName).toBe('PickleBook');
  });
  it('skips offline and busy machines with a reason', () => {
    const r = selectBestOfMachines([up('Mac', { online: false }), up('PicklePower', { busy: true }), up('PickleBook')], { includeExtra: true });
    expect(r.machines.map(m => m.name)).toEqual(['PickleBook']);
    expect(r.skipped).toEqual([{ name: 'Mac', reason: 'offline' }, { name: 'PicklePower', reason: 'busy' }]);
  });
  it('unknown names fall back to the first two pool entries', () => {
    expect(bestOfCandidates([up('Alpha'), up('Beta'), up('Gamma')]).pair.map(m => m.name)).toEqual(['Alpha', 'Beta']);
  });
  it('no PickleBook entry -> extraName null', () => {
    expect(selectBestOfMachines([up('Mac'), up('PicklePower')]).extraName).toBeNull();
  });
});
