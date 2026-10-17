// src/lib/solverJobs.test.js
// Unit tests for the pure fetch client against solver-service's background-jobs API (api/jobs.py).
// Mocks global fetch, never makes a real network call — same pattern as solverClient.test.js.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const ORIGINAL_URL = globalThis.__SOLVER_URL__;

async function freshModule() {
  vi.resetModules();
  return import('./solverJobs.js');
}

describe('solverJobs — submitSolveJob', () => {
  beforeEach(() => {
    globalThis.__SOLVER_URL__ = 'https://solver.example.com';
  });
  afterEach(() => {
    globalThis.__SOLVER_URL__ = ORIGINAL_URL;
    vi.unstubAllGlobals();
  });

  it('POSTs to {url}/jobs and resolves with { jobId } on 200', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ jobId: 'abc-123' }) });
    vi.stubGlobal('fetch', fetchMock);
    const { submitSolveJob } = await freshModule();

    const payload = { version: 1, block: { startDate: '2026-07-06', endDate: '2026-08-02' } };
    const result = await submitSolveJob(payload);

    expect(result).toEqual({ jobId: 'abc-123' });
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe('https://solver.example.com/jobs');
    expect(opts.method).toBe('POST');
    expect(JSON.parse(opts.body)).toEqual(payload);
    expect(opts.headers.Authorization).toBeUndefined();
  });

  it('sends the session token as a Bearer Authorization header when given one', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ jobId: 'x' }) });
    vi.stubGlobal('fetch', fetchMock);
    const { submitSolveJob } = await freshModule();

    await submitSolveJob({ version: 1 }, { accessToken: 'jwt-abc' });

    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer jwt-abc');
  });

  it('an explicit `url` override targets that server instead of the configured cloud URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ jobId: 'x' }) });
    vi.stubGlobal('fetch', fetchMock);
    const { submitSolveJob } = await freshModule();

    await submitSolveJob({ version: 1 }, { url: 'http://127.0.0.1:8765' });

    expect(fetchMock.mock.calls[0][0]).toBe('http://127.0.0.1:8765/jobs');
  });

  it('throws a specific, user-facing message on 409 (a job is already running on that server)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 409, text: async () => 'busy' });
    vi.stubGlobal('fetch', fetchMock);
    const { submitSolveJob } = await freshModule();
    await expect(submitSolveJob({})).rejects.toThrow(/already running/);
  });

  it('throws on a non-200/409 response', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 400, text: async () => 'bad payload' });
    vi.stubGlobal('fetch', fetchMock);
    const { submitSolveJob } = await freshModule();
    await expect(submitSolveJob({})).rejects.toThrow(/400/);
  });

  it('throws immediately, without calling fetch, when the solver is not configured and no url override is given', async () => {
    delete globalThis.__SOLVER_URL__;
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { submitSolveJob } = await freshModule();
    await expect(submitSolveJob({})).rejects.toThrow(/not configured/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('solverJobs — pollSolveJob', () => {
  beforeEach(() => {
    globalThis.__SOLVER_URL__ = 'https://solver.example.com';
  });
  afterEach(() => {
    globalThis.__SOLVER_URL__ = ORIGINAL_URL;
    vi.unstubAllGlobals();
  });

  it('GETs {url}/jobs/{jobId} and resolves with the job view on 200', async () => {
    const view = { status: 'running', startedAt: 1000, budgetSeconds: 900, elapsedSeconds: 12.3, result: null, error: null };
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => view });
    vi.stubGlobal('fetch', fetchMock);
    const { pollSolveJob } = await freshModule();

    const result = await pollSolveJob('job-1');

    expect(result).toEqual(view);
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe('https://solver.example.com/jobs/job-1');
    expect(opts.method).toBe('GET');
  });

  it('resolves { lost: true } on a 404 — never throws for "job not found"', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 404 });
    vi.stubGlobal('fetch', fetchMock);
    const { pollSolveJob } = await freshModule();
    await expect(pollSolveJob('job-1')).resolves.toEqual({ lost: true });
  });

  it('URI-encodes the job id', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
    vi.stubGlobal('fetch', fetchMock);
    const { pollSolveJob } = await freshModule();
    await pollSolveJob('job with space');
    expect(fetchMock.mock.calls[0][0]).toBe('https://solver.example.com/jobs/job%20with%20space');
  });

  it('throws on a non-200/404 response', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 500, text: async () => 'oops' });
    vi.stubGlobal('fetch', fetchMock);
    const { pollSolveJob } = await freshModule();
    await expect(pollSolveJob('job-1')).rejects.toThrow(/500/);
  });

  it('an explicit `url` override polls that server (a job submitted to "this computer" must be polled there, not the cloud)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ status: 'running' }) });
    vi.stubGlobal('fetch', fetchMock);
    const { pollSolveJob } = await freshModule();
    await pollSolveJob('job-1', { url: 'http://127.0.0.1:8765' });
    expect(fetchMock.mock.calls[0][0]).toBe('http://127.0.0.1:8765/jobs/job-1');
  });
});

describe('solverJobs — cancelSolveJob (never throws)', () => {
  beforeEach(() => {
    globalThis.__SOLVER_URL__ = 'https://solver.example.com';
  });
  afterEach(() => {
    globalThis.__SOLVER_URL__ = ORIGINAL_URL;
    vi.unstubAllGlobals();
  });

  it('DELETEs {url}/jobs/{jobId} and resolves with the final job view on 200', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ status: 'cancelled' }) });
    vi.stubGlobal('fetch', fetchMock);
    const { cancelSolveJob } = await freshModule();

    const result = await cancelSolveJob('job-1');

    expect(result).toEqual({ status: 'cancelled' });
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe('https://solver.example.com/jobs/job-1');
    expect(opts.method).toBe('DELETE');
  });

  it('resolves { lost: true } on a 404', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 404 });
    vi.stubGlobal('fetch', fetchMock);
    const { cancelSolveJob } = await freshModule();
    await expect(cancelSolveJob('job-1')).resolves.toEqual({ lost: true });
  });

  it('resolves { lost: true } (never rejects) on a network failure', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    vi.stubGlobal('fetch', fetchMock);
    const { cancelSolveJob } = await freshModule();
    await expect(cancelSolveJob('job-1')).resolves.toEqual({ lost: true });
  });

  it('resolves { lost: true } without calling fetch when the solver is not configured', async () => {
    delete globalThis.__SOLVER_URL__;
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { cancelSolveJob } = await freshModule();
    await expect(cancelSolveJob('job-1')).resolves.toEqual({ lost: true });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('solverJobs — solveViaJob', () => {
  const view = (o) => ({ ok: true, status: 200, json: async () => o });
  const run = (o) => ({ status: 'running', progress: null, ...o });
  // Scripts fetch by method: POST /jobs, GET /jobs/j1 (queued responses, last repeats), DELETE.
  function script(polls) {
    const queue = [...polls];
    const calls = [];
    const fn = vi.fn(async (u, init) => {
      calls.push(`${init.method} ${u}`);
      if (init.method === 'POST') return view({ jobId: 'j1' });
      if (init.method === 'DELETE') return view({ status: 'cancelled' });
      const next = queue.length > 1 ? queue.shift() : queue[0];
      if (next instanceof Error) throw next;
      return next;
    });
    fn.calls = calls;
    return fn;
  }
  beforeEach(() => { globalThis.__SOLVER_URL__ = 'https://solver.example.com'; });
  afterEach(() => { globalThis.__SOLVER_URL__ = ORIGINAL_URL; vi.unstubAllGlobals(); });

  it('submits, reports progress while running, resolves with result on done', async () => {
    const f = script([view(run({ progress: { stage: 1, stages: 3, elapsed: 5, budget: 100 } })), view({ status: 'done', result: { status: 'OPTIMAL' } })]);
    vi.stubGlobal('fetch', f);
    const { solveViaJob } = await freshModule();
    const onProgress = vi.fn();
    const out = await solveViaJob({ a: 1 }, { pollMs: 1, onProgress });
    expect(out).toEqual({ status: 'OPTIMAL' });
    expect(onProgress).toHaveBeenCalledWith({ stage: 1, stages: 3, elapsed: 5, budget: 100 });
    expect(f.calls[0]).toBe('POST https://solver.example.com/jobs');
  });

  it('keeps polling through transientError', async () => {
    const f = script([view(run({ transientError: 'blip' })), view(run({ transientError: 'blip' })), view({ status: 'done', result: { ok: 1 } })]);
    vi.stubGlobal('fetch', f);
    const { solveViaJob } = await freshModule();
    expect(await solveViaJob({}, { pollMs: 1 })).toEqual({ ok: 1 });
  });

  it('rejects on failed', async () => {
    vi.stubGlobal('fetch', script([view({ status: 'failed', error: 'boom' })]));
    const { solveViaJob } = await freshModule();
    await expect(solveViaJob({}, { pollMs: 1 })).rejects.toThrow(/failed.*boom/);
  });

  it('rejects on lost (HTTP 200 status lost, and 404)', async () => {
    vi.stubGlobal('fetch', script([view({ status: 'lost' })]));
    let { solveViaJob } = await freshModule();
    await expect(solveViaJob({}, { pollMs: 1 })).rejects.toThrow(/lost/);
    vi.stubGlobal('fetch', script([{ ok: false, status: 404, text: async () => '' }]));
    ({ solveViaJob } = await freshModule());
    await expect(solveViaJob({}, { pollMs: 1 })).rejects.toThrow(/lost/);
  });

  it('abort sends DELETE and rejects', async () => {
    const f = script([view(run({}))]);
    vi.stubGlobal('fetch', f);
    const { solveViaJob } = await freshModule();
    const ac = new AbortController();
    const p = solveViaJob({}, { pollMs: 5, signal: ac.signal });
    setTimeout(() => ac.abort(), 20);
    await expect(p).rejects.toThrow(/cancelled/);
    expect(f.calls.some(c => c.startsWith('DELETE') && c.endsWith('/jobs/j1'))).toBe(true);
  });

  it('timeout rejects and sends DELETE', async () => {
    const f = script([view(run({}))]);
    vi.stubGlobal('fetch', f);
    const { solveViaJob } = await freshModule();
    await expect(solveViaJob({}, { pollMs: 5, timeoutMs: 30 })).rejects.toThrow(/timed out/);
    expect(f.calls.some(c => c.startsWith('DELETE'))).toBe(true);
  });

  it('tolerates one poll network error, rejects after repeated ones', async () => {
    vi.stubGlobal('fetch', script([new Error('net'), view({ status: 'done', result: { ok: 2 } })]));
    let { solveViaJob } = await freshModule();
    expect(await solveViaJob({}, { pollMs: 1 })).toEqual({ ok: 2 });
    vi.stubGlobal('fetch', script([new Error('net')]));
    ({ solveViaJob } = await freshModule());
    await expect(solveViaJob({}, { pollMs: 1 })).rejects.toThrow(/net/);
  });
});

describe('solveViaJob — abort during in-flight poll', () => {
  afterEach(() => { vi.unstubAllGlobals(); });
  it('aborting while a poll fetch hangs sends DELETE promptly', async () => {
    globalThis.__SOLVER_URL__ = 'https://solver.example.com';
    const calls = [];
    vi.stubGlobal('fetch', vi.fn((u, init) => {
      calls.push(init.method);
      if (init.method === 'POST') return Promise.resolve({ ok: true, status: 200, json: async () => ({ jobId: 'j1' }) });
      if (init.method === 'DELETE') return Promise.resolve({ ok: true, status: 200, json: async () => ({}) });
      return new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(Object.assign(new Error('a'), { name: 'AbortError' }))));
    }));
    const { solveViaJob } = await freshModule();
    const ac = new AbortController();
    const p = solveViaJob({}, { pollMs: 5, signal: ac.signal });
    setTimeout(() => ac.abort(), 20);
    await expect(p).rejects.toThrow(/cancelled/);
    expect(calls).toContain('DELETE');
  });
});
