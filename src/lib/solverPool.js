// Solver machine pool: which optimizer server a Generate / Long solve should target.
// Pool = build-time `VITE_SOLVER_POOL` ("Name=https://host:port,Name2=https://..."), in Auto order.
// Absent/empty pool -> single entry { name: 'Cloud', url: VITE_SOLVER_URL } so behavior is unchanged
// when the env var is unset. "This computer" (loopback run-local solver, LOCAL_SOLVER_URL) is NOT a
// pool entry: it is only reachable from the browser on that same machine (e.g. the chief's PC).
// No React, no import from ResidentScheduler.jsx.
import { getSolverUrl, isUnresolvedToken, LOCAL_SOLVER_URL } from './solverClient.js';

const readGlobal = key => {
  const raw = (typeof globalThis !== 'undefined' && globalThis[key]) || '';
  return isUnresolvedToken(raw) ? '' : String(raw);
};

// "A=https://x,B=https://y" -> [{name, url}]. Drops malformed entries, non-https URLs, duplicate
// names; trims a trailing slash so `${url}/health` stays clean.
export function parseSolverPool(raw) {
  if (typeof raw !== 'string' || !raw.trim()) return [];
  const out = [];
  const seen = new Set();
  for (const part of raw.split(',')) {
    const eq = part.indexOf('=');
    if (eq <= 0) continue;
    const name = part.slice(0, eq).trim();
    const url = part.slice(eq + 1).trim().replace(/\/+$/, '');
    if (!name || seen.has(name.toLowerCase())) continue;
    let u;
    try { u = new URL(url); } catch { continue; }
    if (u.protocol !== 'https:') continue;
    seen.add(name.toLowerCase());
    out.push({ name, url });
  }
  return out;
}

export function getSolverPool() {
  const pool = parseSolverPool(readGlobal('__SOLVER_POOL__'));
  if (pool.length) return pool;
  const url = getSolverUrl();
  return url ? [{ name: 'Cloud', url }] : [];
}

export const SOLVER_POOL_ENABLED = getSolverPool().length > 0;

// UI-only gate for the manual machine picker (servers' SOLVER_ALLOWED_EMAILS stay the boundary).
// `rawList` defaults to build-time VITE_SOLVER_PICKER_EMAILS; never commit real emails.
export function canPickSolverMachine(email, rawList = readGlobal('__SOLVER_PICKER_EMAILS__')) {
  if (typeof email !== 'string' || !email.trim() || typeof rawList !== 'string') return false;
  const e = email.trim().toLowerCase();
  return rawList.split(',').map(s => s.trim().toLowerCase()).filter(Boolean).includes(e);
}

// Device-local res_solver_target values: 'builtin' | 'cloud' (= Auto) | 'local' | 'pool:<name>'.
export const poolTargetName = pref => (typeof pref === 'string' && pref.startsWith('pool:') ? pref.slice(5) : null);
export const isRemoteTarget = pref => pref === 'cloud' || poolTargetName(pref) !== null;

// One /health probe -> { online, busy, runner, jobsMode }. Never throws.
export async function probeSolverHealth(url, { timeoutMs = 2500 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${url}/health`, { signal: controller.signal });
    if (!res.ok) return { online: false, busy: false, runner: null, jobsMode: null };
    const json = await res.json();
    return { online: true, busy: json?.busy === true, runner: json?.runner ?? null, jobsMode: json?.jobs === 'durable' ? 'durable' : 'memory' };
  } catch {
    return { online: false, busy: false, runner: null, jobsMode: null };
  } finally {
    clearTimeout(timer);
  }
}

// Parallel probe of every pool entry -> [{ name, url, online, busy, runner, jobsMode }] (pool order).
export async function probePool(pool = getSolverPool(), opts) {
  return Promise.all(pool.map(async m => ({ ...m, ...(await probeSolverHealth(m.url, opts)) })));
}

const usable = s => s && s.online && !s.busy;

// Pure decision. `localStatus` = probe of LOCAL_SOLVER_URL ({online, busy} or null);
// `poolStatus` = probePool() output. Returns { url, usingLocal, name, reason } — url null = no
// optimizer available (caller keeps the built-in result). `reason` explains any fallback for a toast.
//   builtin      -> nothing
//   cloud (Auto) -> this computer if usable, else first usable pool machine
//   local        -> this computer, else Auto over the pool
//   pool:<name>  -> that machine if usable, else Auto (local first) with a reason
export function pickSolverTarget({ preference, localStatus = null, poolStatus = [] }) {
  if (preference === 'builtin') return { url: null, usingLocal: false, name: null, reason: null };
  const local = usable(localStatus) ? { url: LOCAL_SOLVER_URL, usingLocal: true, name: 'This computer' } : null;
  const firstPool = () => {
    const m = poolStatus.find(usable);
    return m ? { url: m.url, usingLocal: false, name: m.name } : null;
  };
  const why = () => (poolStatus.length && poolStatus.every(s => !s.online) ? 'every optimizer machine is offline'
    : poolStatus.length ? 'every optimizer machine is offline or busy' : 'no optimizer configured');

  const wanted = poolTargetName(preference);
  if (wanted !== null) {
    const m = poolStatus.find(s => s.name === wanted);
    if (usable(m)) return { url: m.url, usingLocal: false, name: m.name, reason: null };
    const fb = local || firstPool();
    const reason = `${wanted} is ${!m ? 'not configured' : m.online ? 'busy' : 'offline'}`;
    return fb ? { ...fb, reason } : { url: null, usingLocal: false, name: null, reason: `${reason}; ${why()}` };
  }
  if (preference === 'local' && !local) {
    const fb = firstPool();
    return fb ? { ...fb, reason: 'this computer is not running the optimizer' } : { url: null, usingLocal: false, name: null, reason: `this computer is not running the optimizer; ${why()}` };
  }
  const pick = local || firstPool();
  return pick ? { ...pick, reason: null } : { url: null, usingLocal: false, name: null, reason: why() };
}
