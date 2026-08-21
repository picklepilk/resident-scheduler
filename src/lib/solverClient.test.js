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
});
