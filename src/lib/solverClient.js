// src/lib/solverClient.js
// Pure fetch client for the external CP-SAT solver service (solver-service/, owned separately —
// see solver-service/docs/PAYLOAD_SCHEMA.md for the request/response contract this app builds
// against via ResidentScheduler.jsx's buildSolverPayload/mapSolverResult). No React, no import
// from ResidentScheduler.jsx or any other app file — a src/lib/ module may never import that
// monolith (see CLAUDE.md "Layout & stack").
//
// Mirrors src/supabaseClient.js's isUnresolvedToken guard exactly: Vite's %VITE_...% HTML-token
// substitution leaves the literal unresolved token string in place (not an empty string) when the
// env var isn't defined for a given build — a fork/preview build with no VITE_SOLVER_URL set would
// otherwise make SOLVER_ENABLED falsely truthy, and every solve attempt would fetch
// "%VITE_SOLVER_URL%/solve" (a same-origin relative URL that resolves to something that isn't the
// solver) instead of cleanly falling back to the built-in JS generator.
export const isUnresolvedToken = v => typeof v === 'string' && v.startsWith('%') && v.endsWith('%');

const readGlobal = key => {
  const raw = (typeof globalThis !== 'undefined' && globalThis[key]) || '';
  return isUnresolvedToken(raw) ? '' : raw;
};

// Exported (rather than inlined into SOLVER_ENABLED) so callers/tests can read the resolved URL
// directly — e.g. to build the exact `${url}/solve` endpoint themselves, or to assert it's empty
// in the unconfigured case.
export function getSolverUrl() {
  return readGlobal('__SOLVER_URL__');
}

// Same fallback-to-clean-disabled-state philosophy as SUPABASE_ENABLED/AUTH_ENABLED elsewhere in
// this app: absent config, the app behaves exactly as if this feature didn't exist (runGenerate/
// runPartialRegenerate skip the solver entirely and go straight to the built-in generator).
export const SOLVER_ENABLED = Boolean(getSolverUrl());

// POSTs `payload` (see PAYLOAD_SCHEMA.md's Request shape) to `${url}/solve` and resolves with the
// parsed JSON response. Bounded by an AbortController timeout — a much longer default than this
// app's own sbFetch (15s) since a real CP-SAT solve can legitimately run tens of seconds
// (config.maxTimeSeconds in the payload), but still bounded so a hung/unreachable solver surfaces
// as a normal rejected promise instead of hanging the caller forever.
//
// Throws (never resolves with an error shape) on: solver not configured, network failure, timeout/
// abort, or a non-200 HTTP response — the single contract PAYLOAD_SCHEMA.md specifies for the
// client: "any non-200 or timeout" means "fall back to the JS engine". Callers should wrap this in
// try/catch and fall back on any rejection; this function never decides that policy itself.
//
// `accessToken` (optional): the caller's Supabase session JWT, sent as `Authorization: Bearer` —
// required once the service runs with SOLVER_AUTH_MODE=supabase (solver-service/CLAUDE.md). Passed
// in rather than fetched here because a src/lib/ module stays free of the auth client; a missing
// token just means the service may 401, which callers already treat as "fall back to local".
// `url` (optional): overrides getSolverUrl() — used for the "run on this computer" target
// (LOCAL_SOLVER_URL below), which is never read from VITE_SOLVER_URL/build config since it's the
// same fixed loopback address on every machine that runs solver-service/run-local.ps1|sh.
export async function solveRemote(payload, { timeoutMs = 120000, accessToken = null, url = null } = {}) {
  const target = url || getSolverUrl();
  if (!target) throw new Error('Solver is not configured (VITE_SOLVER_URL unset)');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const headers = { 'Content-Type': 'application/json' };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  let res;
  try {
    res = await fetch(`${target}/solve`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch (e) {
    if (e?.name === 'AbortError') throw new Error(`Solver request timed out after ${timeoutMs}ms`);
    throw new Error(`Solver request failed: ${e?.message || e}`);
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    let detail = '';
    try { detail = await res.text(); } catch { /* best-effort only — a body-read failure shouldn't mask the real status error */ }
    throw new Error(`Solver returned ${res.status}${detail ? `: ${detail.slice(0, 300)}` : ''}`);
  }
  return res.json();
}

// ─── "Run the optimizer on this computer" ──────────────────────────────────────────────────────
// Fixed loopback port solver-service/run-local.ps1 and run-local.sh both bind uvicorn to. Not
// configurable from the app side — these scripts own the port choice, this is just the matching
// client-side constant. 127.0.0.1 only (never 0.0.0.0): the local server is reachable from this
// machine's own browser only, never another device on the network.
export const LOCAL_SOLVER_URL = 'http://127.0.0.1:8765';

// Pings the local run-local solver's /health. Resolves `null` on ANY failure (not running, wrong
// port, connection refused, timeout, non-200 JSON) rather than throwing or rejecting — this is a
// liveness probe for a Settings-tab status line and for generateViaSolverOrLocal's own pre-flight
// check, never something a caller should have to try/catch. Short default timeout: a real local
// process answers in milliseconds, so a slow non-answer should read as "not running" quickly
// rather than hang the Settings status indicator or delay Generate.
export async function checkLocalSolverHealth({ timeoutMs = 1500 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${LOCAL_SOLVER_URL}/health`, { signal: controller.signal });
    if (!res.ok) return null;
    const json = await res.json();
    return { ortools: json?.ortools ?? null, cpus: json?.cpus ?? null };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// Pure decision: given the device-local "where to run" preference (res_solver_target: 'cloud' |
// 'local') and whether a just-run health check found the local solver alive, which URL should
// THIS generate call target? Exported and kept side-effect-free (no fetch here) so the actual
// fallback policy — "local" falls back to the cloud URL when the local solver isn't reachable
// right now, "cloud" (the default, and any other/unset value) always targets the configured
// VITE_SOLVER_URL — is unit-testable without mocking fetch or React. `url: ''` means neither
// target is available; callers already treat that the same as the pre-existing
// !SOLVER_ENABLED case (skip the solver, keep the already-computed local JS result).
export function resolveSolverTarget({ preference, localHealthy, extraTargets }) {
  // 'builtin' = never touch a solver: no URL, no probe. Callers skip the whole solver path.
  if (preference === 'builtin') return { url: null, usingLocal: false };
  if (preference === 'local' && localHealthy) return { url: LOCAL_SOLVER_URL, usingLocal: true };
  // Named remote PC (VITE_EXTRA_SOLVER_TARGETS): its own URL, session JWT like the cloud target,
  // NO fallback to the cloud URL (a selected-but-unreachable PC keeps the local built-in result).
  const remote = findExtraSolverTarget(preference, extraTargets);
  if (remote) return { url: remote.url, usingLocal: false, remote };
  return { url: getSolverUrl(), usingLocal: false };
}

// Untrusted-shape guard for the device-local res_solver_target value: 'builtin' | 'cloud' | 'local'
// | a configured remote id ('pc:<slug>', only while `allowRemote`); anything else (missing, legacy,
// hand-edited, remote id no longer configured, non-admin viewer) reads as 'cloud', the default.
export function normalizeSolverTarget(v, { allowRemote = false, extraTargets } = {}) {
  if (v === 'builtin' || v === 'local') return v;
  if (allowRemote && findExtraSolverTarget(v, extraTargets)) return v;
  return 'cloud';
}

// ─── Named remote solver PCs (owner's tailnet) ─────────────────────────────────────────────────
// Build env VITE_EXTRA_SOLVER_TARGETS (index.html -> window.__EXTRA_SOLVER_TARGETS__): either a JSON
// array [{"name":"PicklePower","url":"https://host.tailnet.ts.net:8765"}] or "name=url,name=url".
// Absent / unresolved token / garbage = no targets = feature invisible. No email addresses live
// here or anywhere in the bundle; the server-side allowlist is the real boundary.
export const REMOTE_TARGET_PREFIX = 'pc:';

const slugify = n => String(n).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

export function parseExtraSolverTargets(raw) {
  if (typeof raw !== 'string' || !raw.trim() || isUnresolvedToken(raw.trim())) return [];
  let entries = [];
  const text = raw.trim();
  if (text.startsWith('[')) {
    try {
      const arr = JSON.parse(text);
      if (Array.isArray(arr)) entries = arr.map(e => [e?.name, e?.url]);
    } catch { return []; }
  } else {
    entries = text.split(',').map(part => {
      const i = part.indexOf('=');
      return i < 0 ? [null, null] : [part.slice(0, i), part.slice(i + 1)];
    });
  }
  const out = [];
  const seen = new Set();
  for (const [n, u] of entries) {
    const name = typeof n === 'string' ? n.trim() : '';
    const url = typeof u === 'string' ? u.trim().replace(/\/+$/, '') : '';
    const slug = slugify(name);
    // https only: the page is https, and these are tailnet `serve` endpoints with real certs.
    if (!name || !slug || !/^https:\/\/[^\s/?#]+$/i.test(url)) continue;
    const id = REMOTE_TARGET_PREFIX + slug;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ id, name, url });
  }
  return out;
}

export function getExtraSolverTargets() {
  return parseExtraSolverTargets(readGlobal('__EXTRA_SOLVER_TARGETS__'));
}

export function findExtraSolverTarget(id, extraTargets = getExtraSolverTargets()) {
  if (typeof id !== 'string' || !id.startsWith(REMOTE_TARGET_PREFIX)) return null;
  return extraTargets.find(t => t.id === id) || null;
}

export const isRemoteSolverTarget = (id, extraTargets) => Boolean(findExtraSolverTarget(id, extraTargets));

// Picker visibility: admin viewer AND (its /health answered OR it is the currently selected target,
// so a chosen-but-down PC stays visible with a red dot instead of silently vanishing).
export function remoteTargetVisible({ isAdmin, healthy, selected = false }) {
  return Boolean(isAdmin) && (Boolean(healthy) || Boolean(selected));
}

// Which job backend the cloud solver runs: 'durable' (Modal — POST /solve disabled, every solve is a
// submit-then-poll job) or 'memory' (legacy Fly — synchronous /solve). Fetched once per URL per
// session (module scope); ANY failure reads as 'memory' so behavior stays exactly the legacy
// solveRemote path. Failures are not cached, so a transient blip retries next Generate.
const healthCache = new Map(); // url -> { mode, host, preferJobs, defaultBudgetSeconds }
// Full /health read: { mode: 'durable'|'memory', host: string|null, preferJobs: bool,
// defaultBudgetSeconds: number|null } or null when unreachable. `host`/`preferJobs`/
// `defaultBudgetSeconds` are optional server hints (the Pi sets SOLVER_HOST_KIND=pi); absent = Fly/Modal.
// `fresh: true` skips the cache read (reachability checks must ask "reachable right now").
export async function probeSolverHealth(url, { timeoutMs = 20000, fresh = false } = {}) {
  if (!url) return null;
  if (!fresh && healthCache.has(url)) return healthCache.get(url);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${url}/health`, { signal: controller.signal });
    if (!res.ok) return null;
    const json = await res.json();
    const budget = Number(json?.defaultBudgetSeconds);
    const info = {
      mode: json?.jobs === 'durable' ? 'durable' : 'memory',
      host: typeof json?.host === 'string' && json.host ? json.host : null,
      preferJobs: json?.preferJobs === true,
      defaultBudgetSeconds: Number.isFinite(budget) && budget > 0 ? budget : null,
    };
    healthCache.set(url, info);
    return info;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
// Like getSolverJobsMode but a failed/unknown probe resolves null instead of 'memory', so UI can
// label the backend plain "Cloud" rather than claiming Fly.
export async function probeSolverJobsMode(url, opts) {
  return (await probeSolverHealth(url, opts))?.mode ?? null;
}
export async function getSolverJobsMode(url, opts) {
  return (await probeSolverJobsMode(url, opts)) ?? 'memory';
}

// Called when a synchronous /solve answers 400 use_jobs: the backend is durable even though the
// health probe missed it (e.g. cold container timeout). Future Generates go straight to jobs.
export function markSolverJobsDurable(url) {
  if (!url) return;
  healthCache.set(url, { host: null, preferJobs: false, defaultBudgetSeconds: null, ...healthCache.get(url), mode: 'durable' });
}

// Which local-engine budget a Generate call should use. The short "polished" (warm-start) run only
// pays off when a solver will actually take over: configured (`solverPossible`), no hand overrides
// the optimizer can't honour, AND reachable right now. Otherwise the local result is the final
// answer and deserves the full built-in budget.
export function shouldPolishLocal({ solverPossible, overrideSkipCount = 0, solverReachable }) {
  return Boolean(solverPossible) && !overrideSkipCount && Boolean(solverReachable);
}
