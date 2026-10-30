// src/lib/solverClient.test.js
// Unit tests for the pure fetch client against the external CP-SAT solver-service — mocks global
// fetch, never makes a real network call. solverClient.js reads its config off
// globalThis.__SOLVER_URL__ (see index.html's %VITE_SOLVER_URL% injection), same pattern as
// src/supabaseClient.js's __SUPABASE_URL__/__SUPABASE_ANON__ — so each test stubs that global
// directly rather than going through import.meta.env.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const ORIGINAL_URL = globalThis.__SOLVER_URL__;

async function freshModule() {
  vi.resetModules();
  return import('./solverClient.js');
}

describe('solverClient — configuration resolution', () => {
  afterEach(() => {
    globalThis.__SOLVER_URL__ = ORIGINAL_URL;
  });

  it('SOLVER_ENABLED is false and getSolverUrl() is empty when unset', async () => {
    delete globalThis.__SOLVER_URL__;
    const { SOLVER_ENABLED, getSolverUrl } = await freshModule();
    expect(SOLVER_ENABLED).toBe(false);
    expect(getSolverUrl()).toBe('');
  });

  it('SOLVER_ENABLED is false when Vite left the literal unresolved %VITE_SOLVER_URL% token', async () => {
    globalThis.__SOLVER_URL__ = '%VITE_SOLVER_URL%';
    const { SOLVER_ENABLED, getSolverUrl, isUnresolvedToken } = await freshModule();
    expect(isUnresolvedToken('%VITE_SOLVER_URL%')).toBe(true);
    expect(SOLVER_ENABLED).toBe(false);
    expect(getSolverUrl()).toBe('');
  });

  it('SOLVER_ENABLED is true and getSolverUrl() returns the configured URL', async () => {
    globalThis.__SOLVER_URL__ = 'https://solver.example.com';
    const { SOLVER_ENABLED, getSolverUrl } = await freshModule();
    expect(SOLVER_ENABLED).toBe(true);
    expect(getSolverUrl()).toBe('https://solver.example.com');
  });
});

describe('solverClient — solveRemote', () => {
  beforeEach(() => {
    globalThis.__SOLVER_URL__ = 'https://solver.example.com';
  });
  afterEach(() => {
    globalThis.__SOLVER_URL__ = ORIGINAL_URL;
    vi.unstubAllGlobals();
  });

  it('POSTs to {url}/solve and resolves with the parsed JSON body on 200', async () => {
    const responseBody = { version: 1, status: 'OPTIMAL', schedule: {}, report: {} };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => responseBody,
    });
    vi.stubGlobal('fetch', fetchMock);
    const { solveRemote } = await freshModule();

    const payload = { version: 1, block: { startDate: '2026-07-06', endDate: '2026-08-02' } };
    const result = await solveRemote(payload);

    expect(result).toEqual(responseBody);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe('https://solver.example.com/solve');
    expect(opts.method).toBe('POST');
    expect(opts.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(opts.body)).toEqual(payload);
    expect(opts.headers.Authorization).toBeUndefined();
  });

  it('sends the session token as a Bearer Authorization header when given one', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
    vi.stubGlobal('fetch', fetchMock);
    const { solveRemote } = await freshModule();

    await solveRemote({ version: 1 }, { accessToken: 'jwt-abc' });

    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer jwt-abc');
  });

  it('throws on a non-200 response', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 422,
      text: async () => 'locked shift unknown',
    });
    vi.stubGlobal('fetch', fetchMock);
    const { solveRemote } = await freshModule();
    await expect(solveRemote({})).rejects.toThrow(/422/);
  });

  it('throws on a network failure', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    vi.stubGlobal('fetch', fetchMock);
    const { solveRemote } = await freshModule();
    await expect(solveRemote({})).rejects.toThrow(/Solver request failed/);
  });

  it('throws on an abort/timeout', async () => {
    const fetchMock = vi.fn().mockImplementation((_url, opts) => new Promise((_resolve, reject) => {
      opts.signal.addEventListener('abort', () => {
        const err = new Error('Aborted');
        err.name = 'AbortError';
        reject(err);
      });
    }));
    vi.stubGlobal('fetch', fetchMock);
    const { solveRemote } = await freshModule();
    await expect(solveRemote({}, { timeoutMs: 10 })).rejects.toThrow(/timed out/);
  });

  it('throws immediately, without calling fetch, when the solver is not configured', async () => {
    delete globalThis.__SOLVER_URL__;
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { solveRemote } = await freshModule();
    await expect(solveRemote({})).rejects.toThrow(/not configured/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('an explicit `url` option overrides getSolverUrl() (the "run on this computer" target)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
    vi.stubGlobal('fetch', fetchMock);
    const { solveRemote, LOCAL_SOLVER_URL } = await freshModule();

    await solveRemote({ version: 1 }, { url: LOCAL_SOLVER_URL });

    expect(fetchMock.mock.calls[0][0]).toBe(`${LOCAL_SOLVER_URL}/solve`);
  });

  it('`url` override works even when VITE_SOLVER_URL (cloud) is unset', async () => {
    delete globalThis.__SOLVER_URL__;
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
    vi.stubGlobal('fetch', fetchMock);
    const { solveRemote, LOCAL_SOLVER_URL } = await freshModule();

    await solveRemote({ version: 1 }, { url: LOCAL_SOLVER_URL });

    expect(fetchMock.mock.calls[0][0]).toBe(`${LOCAL_SOLVER_URL}/solve`);
  });
});

describe('solverClient — checkLocalSolverHealth', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('resolves {ortools, cpus} on a 200 JSON response', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'ok', ortools: '9.15.6755', cpus: 16 }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const { checkLocalSolverHealth, LOCAL_SOLVER_URL } = await freshModule();

    const result = await checkLocalSolverHealth();

    expect(result).toEqual({ ortools: '9.15.6755', cpus: 16, runner: null });
    expect(fetchMock.mock.calls[0][0]).toBe(`${LOCAL_SOLVER_URL}/health`);
  });

  it('resolves null (never throws) on a non-200 response', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false });
    vi.stubGlobal('fetch', fetchMock);
    const { checkLocalSolverHealth } = await freshModule();
    await expect(checkLocalSolverHealth()).resolves.toBeNull();
  });

  it('resolves null (never throws) when fetch rejects (e.g. connection refused — not running)', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    vi.stubGlobal('fetch', fetchMock);
    const { checkLocalSolverHealth } = await freshModule();
    await expect(checkLocalSolverHealth()).resolves.toBeNull();
  });

  it('resolves null on timeout rather than hanging', async () => {
    const fetchMock = vi.fn().mockImplementation((_url, opts) => new Promise((_resolve, reject) => {
      opts.signal.addEventListener('abort', () => {
        const err = new Error('Aborted');
        err.name = 'AbortError';
        reject(err);
      });
    }));
    vi.stubGlobal('fetch', fetchMock);
    const { checkLocalSolverHealth } = await freshModule();
    await expect(checkLocalSolverHealth({ timeoutMs: 10 })).resolves.toBeNull();
  });
});

describe('solverClient — resolveSolverTarget (pure fallback decision)', () => {
  afterEach(() => {
    globalThis.__SOLVER_URL__ = ORIGINAL_URL;
  });

  it('preference "builtin": targets nothing, even with a cloud URL configured and local healthy', async () => {
    globalThis.__SOLVER_URL__ = 'https://solver.example.com';
    const { resolveSolverTarget } = await freshModule();
    expect(resolveSolverTarget({ preference: 'builtin', localHealthy: true })).toEqual({ url: null, usingLocal: false });
    expect(resolveSolverTarget({ preference: 'builtin', localHealthy: false })).toEqual({ url: null, usingLocal: false });
  });

  it('normalizeSolverTarget: keeps the three valid values, anything else reads as cloud', async () => {
    const { normalizeSolverTarget } = await freshModule();
    expect(normalizeSolverTarget('builtin')).toBe('builtin');
    expect(normalizeSolverTarget('cloud')).toBe('cloud');
    expect(normalizeSolverTarget('local')).toBe('local');
    expect(normalizeSolverTarget('pool:PicklePower')).toBe('pool:PicklePower');
    expect(normalizeSolverTarget('pool:')).toBe('cloud');
    expect(normalizeSolverTarget('pool:  ')).toBe('cloud');
    for (const bad of [undefined, null, '', 'LOCAL', 'true', 7, {}, []]) expect(normalizeSolverTarget(bad)).toBe('cloud');
  });

  it('preference "local" + healthy local solver: targets the local URL', async () => {
    globalThis.__SOLVER_URL__ = 'https://solver.example.com';
    const { resolveSolverTarget, LOCAL_SOLVER_URL } = await freshModule();
    expect(resolveSolverTarget({ preference: 'local', localHealthy: true }))
      .toEqual({ url: LOCAL_SOLVER_URL, usingLocal: true });
  });

  it('preference "local" + unreachable local solver: falls back to the configured cloud URL', async () => {
    globalThis.__SOLVER_URL__ = 'https://solver.example.com';
    const { resolveSolverTarget } = await freshModule();
    expect(resolveSolverTarget({ preference: 'local', localHealthy: false }))
      .toEqual({ url: 'https://solver.example.com', usingLocal: false });
  });

  it('preference "local" + unreachable local solver + no cloud configured: targets nothing (caller keeps the already-computed local JS result)', async () => {
    delete globalThis.__SOLVER_URL__;
    const { resolveSolverTarget } = await freshModule();
    expect(resolveSolverTarget({ preference: 'local', localHealthy: false }))
      .toEqual({ url: '', usingLocal: false });
  });

  it('preference "cloud" (or unset/default): always targets the configured cloud URL regardless of localHealthy', async () => {
    globalThis.__SOLVER_URL__ = 'https://solver.example.com';
    const { resolveSolverTarget } = await freshModule();
    expect(resolveSolverTarget({ preference: 'cloud', localHealthy: true }))
      .toEqual({ url: 'https://solver.example.com', usingLocal: false });
    expect(resolveSolverTarget({ preference: undefined, localHealthy: true }))
      .toEqual({ url: 'https://solver.example.com', usingLocal: false });
  });
});

describe('probeSolverJobsMode', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('resolves null on failure/non-ok, real mode otherwise', async () => {
    vi.resetModules();
    const { probeSolverJobsMode } = await import('./solverClient.js');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('x')));
    expect(await probeSolverJobsMode('https://p.test')).toBeNull();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
    expect(await probeSolverJobsMode('https://p.test')).toBeNull();
    expect(await probeSolverJobsMode('')).toBeNull();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));
    expect(await probeSolverJobsMode('https://p.test')).toBe('memory');
  });
});

describe('probeSolverHealth', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('returns host hints (Pi), defaults them off for Fly, caches per url', async () => {
    vi.resetModules();
    const { probeSolverHealth, markSolverJobsDurable } = await import('./solverClient.js');
    const f = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ jobs: 'memory', host: 'pi', preferJobs: true, defaultBudgetSeconds: 300 }) });
    vi.stubGlobal('fetch', f);
    expect(await probeSolverHealth('https://pi.test')).toEqual({ mode: 'memory', host: 'pi', preferJobs: true, defaultBudgetSeconds: 300 });
    await probeSolverHealth('https://pi.test');
    expect(f).toHaveBeenCalledTimes(1);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ jobs: 'memory' }) }));
    expect(await probeSolverHealth('https://fly.test')).toEqual({ mode: 'memory', host: null, preferJobs: false, defaultBudgetSeconds: null });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ defaultBudgetSeconds: -5, host: 7 }) }));
    expect(await probeSolverHealth('https://bad.test')).toEqual({ mode: 'memory', host: null, preferJobs: false, defaultBudgetSeconds: null });
    markSolverJobsDurable('https://pi.test');
    expect((await probeSolverHealth('https://pi.test')).mode).toBe('durable');
    expect((await probeSolverHealth('https://pi.test')).host).toBe('pi');
  });
});

describe('getSolverJobsMode', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('reads /health jobs, caches per url, failure -> memory uncached', async () => {
    vi.resetModules();
    const { getSolverJobsMode } = await import('./solverClient.js');
    const f = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ jobs: 'durable' }) });
    vi.stubGlobal('fetch', f);
    expect(await getSolverJobsMode('https://a.test')).toBe('durable');
    expect(await getSolverJobsMode('https://a.test')).toBe('durable');
    expect(f).toHaveBeenCalledTimes(1);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('x')));
    expect(await getSolverJobsMode('https://b.test')).toBe('memory');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));
    expect(await getSolverJobsMode('https://b.test')).toBe('memory');
  });
});

describe('markSolverJobsDurable', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('overrides a memory read without another health fetch', async () => {
    vi.resetModules();
    const { getSolverJobsMode, markSolverJobsDurable } = await import('./solverClient.js');
    markSolverJobsDurable('https://c.test');
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    expect(await getSolverJobsMode('https://c.test')).toBe('durable');
    expect(f).not.toHaveBeenCalled();
  });
});

describe('shouldPolishLocal', () => {
  it('polishes only when solver configured, no override skip, and reachable', async () => {
    const { shouldPolishLocal } = await freshModule();
    expect(shouldPolishLocal({ solverPossible: true, overrideSkipCount: 0, solverReachable: true })).toBe(true);
    expect(shouldPolishLocal({ solverPossible: true, overrideSkipCount: 0, solverReachable: false })).toBe(false);
    expect(shouldPolishLocal({ solverPossible: true, overrideSkipCount: 2, solverReachable: true })).toBe(false);
    expect(shouldPolishLocal({ solverPossible: false, solverReachable: true })).toBe(false);
  });
});

describe('normalizeSolverTarget — legacy remote ids', () => {
  const POOL = [{ name: 'PicklePower', url: 'https://picklepower.x.ts.net:10000' }, { name: 'Pickle Book', url: 'https://picklebook.x.ts.net:10000' }];
  it('maps remote:<slug> / pc:<slug> to pool:<Name> when a pool entry slugifies to it', async () => {
    const { normalizeSolverTarget } = await freshModule();
    expect(normalizeSolverTarget('remote:picklepower', { pool: POOL })).toBe('pool:PicklePower');
    expect(normalizeSolverTarget('pc:pickle-book', { pool: POOL })).toBe('pool:Pickle Book');
  });
  it('falls back to cloud when no pool entry matches or no pool is configured', async () => {
    const { normalizeSolverTarget } = await freshModule();
    expect(normalizeSolverTarget('remote:gone', { pool: POOL })).toBe('cloud');
    expect(normalizeSolverTarget('remote:picklepower')).toBe('cloud');
    expect(normalizeSolverTarget('remote:picklepower', { pool: 'junk' })).toBe('cloud');
  });
  it('leaves current values alone', async () => {
    const { normalizeSolverTarget } = await freshModule();
    expect(normalizeSolverTarget('pool:X', { pool: POOL })).toBe('pool:X');
    expect(normalizeSolverTarget('local', { pool: POOL })).toBe('local');
    expect(normalizeSolverTarget('builtin')).toBe('builtin');
    expect(normalizeSolverTarget(undefined)).toBe('cloud');
  });
});
