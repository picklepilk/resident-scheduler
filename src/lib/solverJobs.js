// src/lib/solverJobs.js
// Pure fetch client for the solver's background-job endpoints (POST /jobs, GET /jobs/{id},
// DELETE /jobs/{id} — solver-service/api/jobs.py), backing the "Long solve…" feature: a bigger
// time budget (5/15/30 min) than the synchronous /solve path's own ~2/5 min, submitted once and
// polled for instead of blocking a request for that long. No React, no import from
// ResidentScheduler.jsx — same src/lib/ rule as solverClient.js (see CLAUDE.md "Layout & stack").
// Builds on solverClient's own base-URL resolution (getSolverUrl/isUnresolvedToken) rather than
// duplicating it — a second concurrent change wires up a "run on this computer" URL override there,
// and this module must keep picking that up instead of hardcoding its own.
//
// Fly reality check (see solver-service/CLAUDE.md's "Background jobs" section and
// solver-service/fly.toml's auto_stop_machines=true/min_machines_running=0): jobs live in memory
// only on whichever machine ran them. If that machine stops (no traffic for a while — e.g. the
// laptop sleeps or the tab closes mid-job) the job is gone for good. Polling GET /jobs/{id} every
// ~10-20s while the tab is open is itself what keeps the machine alive via Fly's own traffic-based
// autostart/autostop; a poll after the machine has restarted gets a 404, which every function here
// surfaces as the single `{ lost: true }` shape (never a thrown error for that specific case) so the
// UI can show "The optimizer stopped before finishing — run it again" instead of hanging or
// treating a 404 as some other kind of failure.
import { getSolverUrl } from './solverClient.js';

function authHeaders(accessToken) {
  const headers = { 'Content-Type': 'application/json' };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  return headers;
}

// Every function below takes an optional `url` override, mirroring solverClient.solveRemote's own
// `url` param — the caller (ScheduleGrid's requestLongSolve) resolves "cloud vs. this computer" via
// solverClient.resolveSolverTarget exactly once, at submit time, and the SAME resolved url is what
// must be used for every later poll/cancel of that specific job: a job submitted to the local
// run-local solver only exists on that loopback process, never on the cloud deployment, and vice
// versa. Falls back to getSolverUrl() (the configured cloud VITE_SOLVER_URL) when no override is
// given, same default as solveRemote.

// POSTs `payload` (identical shape to solveRemote's /solve payload — see PAYLOAD_SCHEMA.md and
// buildSolverPayload) to `${url}/jobs`. Resolves with `{ jobId }`. Throws on: solver not configured,
// network failure, a 409 (a job is already running on this server — caller should tell the admin to
// wait or try again shortly), or any other non-200.
export async function submitSolveJob(payload, { accessToken = null, timeoutMs = 15000, url: urlOverride = null } = {}) {
  const url = urlOverride || getSolverUrl();
  if (!url) throw new Error('Solver is not configured (VITE_SOLVER_URL unset)');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res;
  try {
    res = await fetch(`${url}/jobs`, {
      method: 'POST',
      headers: authHeaders(accessToken),
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch (e) {
    if (e?.name === 'AbortError') throw new Error(`Job submission timed out after ${timeoutMs}ms`);
    throw new Error(`Job submission failed: ${e?.message || e}`);
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 409) throw new Error('A long solve is already running on this server — wait for it to finish, or try again shortly.');
  if (!res.ok) {
    let detail = '';
    try { detail = await res.text(); } catch { /* best-effort only */ }
    throw new Error(`Job submission returned ${res.status}${detail ? `: ${detail.slice(0, 300)}` : ''}`);
  }
  return res.json();
}

// GETs `${url}/jobs/{jobId}`. Resolves with either:
//   - `{ lost: true }` on a 404 — the job doesn't exist (never finished, or the server restarted and
//     lost it; see this module's own header) — the one case every caller must treat as "gone", not
//     as a transient network error.
//   - the job's status object otherwise: `{ status, startedAt, budgetSeconds, elapsedSeconds, result,
//     error }` (same shape solver-service/api/jobs.py's `_job_view` returns).
// Throws only on network failure / timeout / a non-200-non-404 response — same "fall back to a
// normal rejected promise" contract as solverClient.solveRemote.
export async function pollSolveJob(jobId, { accessToken = null, timeoutMs = 15000, url: urlOverride = null } = {}) {
  const url = urlOverride || getSolverUrl();
  if (!url) throw new Error('Solver is not configured (VITE_SOLVER_URL unset)');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res;
  try {
    res = await fetch(`${url}/jobs/${encodeURIComponent(jobId)}`, {
      method: 'GET',
      headers: authHeaders(accessToken),
      signal: controller.signal,
    });
  } catch (e) {
    if (e?.name === 'AbortError') throw new Error(`Job poll timed out after ${timeoutMs}ms`);
    throw new Error(`Job poll failed: ${e?.message || e}`);
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 404) return { lost: true };
  if (!res.ok) {
    let detail = '';
    try { detail = await res.text(); } catch { /* best-effort only */ }
    throw new Error(`Job poll returned ${res.status}${detail ? `: ${detail.slice(0, 300)}` : ''}`);
  }
  return res.json();
}

// DELETEs `${url}/jobs/{jobId}` (cancel). Best-effort: resolves with the final job view on success,
// `{ lost: true }` on a 404 (already gone — nothing to cancel), or swallows a network failure into
// `{ lost: true }` too — the caller's intent ("stop showing this as pending") is satisfied either
// way, and a stuck cancel button is worse than a cancel that silently no-ops against an already-dead
// job. Never throws.
export async function cancelSolveJob(jobId, { accessToken = null, timeoutMs = 10000, url: urlOverride = null } = {}) {
  const url = urlOverride || getSolverUrl();
  if (!url) return { lost: true };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${url}/jobs/${encodeURIComponent(jobId)}`, {
      method: 'DELETE',
      headers: authHeaders(accessToken),
      signal: controller.signal,
    });
    if (res.status === 404) return { lost: true };
    if (!res.ok) return { lost: true };
    return res.json();
  } catch {
    return { lost: true };
  } finally {
    clearTimeout(timer);
  }
}
