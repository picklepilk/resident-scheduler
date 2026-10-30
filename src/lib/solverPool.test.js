import { describe, it, expect, vi, afterEach } from 'vitest';
import { parseSolverPool, canPickSolverMachine, pickSolverTarget, isRemoteTarget, poolTargetName, probeSolverHealth } from './solverPool.js';
import { LOCAL_SOLVER_URL } from './solverClient.js';

const pool = [
  { name: 'PicklePower', url: 'https://pp.example:10000', online: true, busy: false },
  { name: 'PickleBook', url: 'https://pb.example:10000', online: true, busy: false },
  { name: 'Pi', url: 'https://pi.example:10000', online: true, busy: false },
];
const with_ = (i, patch) => pool.map((m, j) => (j === i ? { ...m, ...patch } : m));

describe('parseSolverPool', () => {
  it('parses ordered entries, trims slash, drops junk/http/dupes', () => {
    expect(parseSolverPool('A=https://a.x:10000/, B=http://b.x ,=https://c, C=nope, a=https://dup, D=https://d.x'))
      .toEqual([{ name: 'A', url: 'https://a.x:10000' }, { name: 'D', url: 'https://d.x' }]);
    expect(parseSolverPool(undefined)).toEqual([]);
  });
});

describe('canPickSolverMachine', () => {
  it('case-insensitive list match, false on empties', () => {
    expect(canPickSolverMachine('Admin@Example.edu', 'x@y.z, admin@example.edu')).toBe(true);
    expect(canPickSolverMachine('other@example.edu', 'admin@example.edu')).toBe(false);
    expect(canPickSolverMachine('', 'a@b.c')).toBe(false);
    expect(canPickSolverMachine('a@b.c', '')).toBe(false);
  });
});

describe('target value helpers', () => {
  it('pool:<name> and cloud are remote', () => {
    expect(poolTargetName('pool:Pi')).toBe('Pi');
    expect(isRemoteTarget('cloud')).toBe(true);
    expect(isRemoteTarget('pool:Pi')).toBe(true);
    expect(isRemoteTarget('local')).toBe(false);
  });
});

describe('pickSolverTarget', () => {
  it('builtin -> nothing', () => {
    expect(pickSolverTarget({ preference: 'builtin', poolStatus: pool }).url).toBeNull();
  });
  it('Auto prefers this computer (chief PC) when running and idle', () => {
    expect(pickSolverTarget({ preference: 'cloud', localStatus: { online: true, busy: false }, poolStatus: pool }))
      .toMatchObject({ url: LOCAL_SOLVER_URL, usingLocal: true });
  });
  it('Auto skips busy/offline in order', () => {
    const st = with_(0, { busy: true }).map((m, j) => (j === 1 ? { ...m, online: false } : m));
    expect(pickSolverTarget({ preference: 'cloud', poolStatus: st })).toMatchObject({ name: 'Pi', reason: null });
  });
  it('Auto with nothing usable explains why', () => {
    const st = pool.map(m => ({ ...m, online: false }));
    expect(pickSolverTarget({ preference: 'cloud', poolStatus: st })).toMatchObject({ url: null, reason: 'every optimizer machine is offline' });
  });
  it('pool:<name> picks that machine even if earlier ones are idle', () => {
    expect(pickSolverTarget({ preference: 'pool:PickleBook', poolStatus: pool })).toMatchObject({ name: 'PickleBook', reason: null });
  });
  it('pool:<name> busy -> falls back to Auto with reason', () => {
    expect(pickSolverTarget({ preference: 'pool:PicklePower', poolStatus: with_(0, { busy: true }) }))
      .toMatchObject({ name: 'PickleBook', reason: 'PicklePower is busy' });
  });
  it('local not running -> Auto over pool', () => {
    expect(pickSolverTarget({ preference: 'local', localStatus: null, poolStatus: pool }))
      .toMatchObject({ name: 'PicklePower', usingLocal: false });
  });
});

describe('probeSolverHealth host hints', () => {
  afterEach(() => vi.unstubAllGlobals());
  const stub = json => vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => json })));
  it('carries host/preferJobs/defaultBudgetSeconds from /health', async () => {
    stub({ jobs: 'memory', host: 'pc', preferJobs: true, defaultBudgetSeconds: 300, busy: true, runner: { cpus: 8 } });
    expect(await probeSolverHealth('https://x.test')).toEqual({ online: true, busy: true, runner: { cpus: 8 }, jobsMode: 'memory', host: 'pc', preferJobs: true, defaultBudgetSeconds: 300 });
  });
  it('absent hints read as null/false; offline row has the same shape', async () => {
    stub({ jobs: 'durable' });
    expect(await probeSolverHealth('https://x.test')).toMatchObject({ online: true, jobsMode: 'durable', host: null, preferJobs: false, defaultBudgetSeconds: null });
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('down'); }));
    expect(await probeSolverHealth('https://x.test')).toEqual({ online: false, busy: false, runner: null, jobsMode: null, host: null, preferJobs: false, defaultBudgetSeconds: null });
  });
});
