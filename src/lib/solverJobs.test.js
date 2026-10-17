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
