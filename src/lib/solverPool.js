// Solver machine pool: which optimizer server a Generate / Long solve should target.
// Pool = build-time `VITE_SOLVER_POOL` ("Name=https://host:port,Name2=https://..."), in Auto order.
// Absent/empty pool -> single entry { name: 'Cloud', url: VITE_SOLVER_URL } so behavior is unchanged
// when the env var is unset. "This computer" (loopback run-local solver, LOCAL_SOLVER_URL) is NOT a
// pool entry: it is only reachable from the browser on that same machine (e.g. the chief's PC).
// No React, no import from ResidentScheduler.jsx.
import { getSolverUrl, LOCAL_SOLVER_URL, parseHealthHints } from './solverClient.js';
import { readGlobal as readEnvGlobal } from './envGlobal.js';

const readGlobal = key => String(readEnvGlobal(key));

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

// One /health probe -> { online, busy, runner, jobsMode, host, preferJobs, defaultBudgetSeconds }.
// host/preferJobs/defaultBudgetSeconds are the server's SOLVER_HOST_KIND hints (pi|pc); absent
// = null/false/null (Fly/Modal/local). Never throws.
const OFFLINE = { online: false, busy: false, runner: null, jobsMode: null, host: null, preferJobs: false, defaultBudgetSeconds: null };
export async function probeSolverHealth(url, { timeoutMs = 2500 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${url}/health`, { signal: controller.signal });
    if (!res.ok) return OFFLINE;
    const json = await res.json();
    return {
      online: true, busy: json?.busy === true, runner: json?.runner ?? null, jobsMode: json?.jobs === 'durable' ? 'durable' : 'memory',
      ...parseHealthHints(json),
    };
  } catch {
    return OFFLINE;
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

// ─── BEST-OF MACHINE SELECTION ──────────────────────────────────────────────────────────────────
// Pure. Default pair = the Mac and PicklePower pool entries (matched by name), optional third =
// PickleBook (`includeExtra`). If names do not match, the first two pool entries are the pair.
// `poolStatus` = probePool() output; only online + idle machines run. Returns
// { machines: [{name,url,defaultBudgetSeconds}], skipped: [{name, reason}], extraName } in priority order.
const MAC_RE = /(^|[^a-z])mac([^a-z]|$)/i;
const PC_RE = /power/i;
const BOOK_RE = /book/i;

export function bestOfCandidates(poolStatus = []) {
  const pool = Array.isArray(poolStatus) ? poolStatus : [];
  const mac = pool.find(m => MAC_RE.test(m.name));
  const pc = pool.find(m => PC_RE.test(m.name));
  const extra = pool.find(m => BOOK_RE.test(m.name) && m !== mac && m !== pc) || null;
  let pair = [mac, pc].filter(Boolean);
  if (pair.length < 2) pair = pool.filter(m => m !== extra).slice(0, 2);
  return { pair, extra };
}

export function selectBestOfMachines(poolStatus = [], { includeExtra = false } = {}) {
  const { pair, extra } = bestOfCandidates(poolStatus);
  const wanted = includeExtra && extra ? [...pair, extra] : pair;
  const machines = [], skipped = [];
  for (const m of wanted) {
    if (usable(m)) machines.push({ name: m.name, url: m.url, defaultBudgetSeconds: m.defaultBudgetSeconds ?? null });
    else skipped.push({ name: m.name, reason: m.online ? 'busy' : 'offline' });
  }
  return { machines, skipped, extraName: extra ? extra.name : null };
}
