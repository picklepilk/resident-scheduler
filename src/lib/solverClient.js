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
export async function solveRemote(payload, { timeoutMs = 120000 } = {}) {
  const url = getSolverUrl();
  if (!url) throw new Error('Solver is not configured (VITE_SOLVER_URL unset)');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res;
  try {
    res = await fetch(`${url}/solve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
