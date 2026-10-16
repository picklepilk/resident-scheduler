// src/lib/playgrounds.js
// Per-admin scheduling playgrounds — a disposable copy of the workspace each admin can experiment
// in without touching the real schedule (CLAUDE.md "Persistence, cloud sync, demo sandbox"). This
// replaces the old single shared `res_state` row id:'demo' with one row PER playground, id
// `pg_<ownerUid>_<rand>`, so two admins never step on each other's sandbox the way they did before.
// Pure module: no React, no Supabase client, must never import ResidentScheduler.jsx (circular).
//
// Design (short version — see CLAUDE.md for the full writeup):
//  - res_state RLS is already admin-wide (`is_admin()` on every row, no per-row policy needed), so a
//    brand-new row id needs no migration — it's reachable the moment an admin session exists.
//  - A playground's cloud doc carries a `_playground` meta object (name/ownerUid/source/createdAt)
//    the real doc never has — see PLAYGROUND_META_KEY.
//  - Only ONE physical local slot (`res_demo_*`) exists at a time, for whichever playground is
//    currently active — switching playgrounds flushes/swaps/reloads, it doesn't keep N local
//    copies. `res_demo_mode` (device-local, see CLAUDE.md) now holds either the legacy literal
//    'true' (old shared demo, back-compat) or an active playground's row id, instead of a boolean.
//  - Local-only installs (no Supabase): there is nowhere to persist more than one playground's data
//    (no cloud row to hold it while a different one is active), so local-only mode supports exactly
//    ONE playground at a time — creating a second one replaces the first, same as the old shared
//    demo's behavior. This is a deliberate simplification, not an oversight — see CLAUDE.md.

export const REAL_ROW_ID = 'main';
export const LEGACY_DEMO_ROW_ID = 'demo';
export const PLAYGROUND_ID_PREFIX = 'pg_';
export const PLAYGROUND_META_KEY = '_playground';

// A playground row id is PREFIX + ownerUid + '_' + a short random suffix. ownerUid (a Supabase
// auth uuid, or the literal 'local' in local-only/no-auth mode) never itself contains an
// underscore, so splitting on the LAST underscore unambiguously recovers it regardless of the
// random suffix's own contents.
const PLAYGROUND_ID_RE = /^pg_(.+)_[^_]+$/;

export function isPlaygroundId(id) {
  return typeof id === 'string' && PLAYGROUND_ID_RE.test(id);
}

export function isLegacyDemoRowId(id) {
  return id === LEGACY_DEMO_ROW_ID;
}

// Any row that is NOT the one real workspace document — a playground or the old shared demo row.
export function isSandboxRowId(id) {
  return isPlaygroundId(id) || isLegacyDemoRowId(id);
}

export function ownerUidFromPlaygroundId(id) {
  const m = typeof id === 'string' ? id.match(PLAYGROUND_ID_RE) : null;
  return m ? m[1] : null;
}

// Short, not cryptographically unique — collision odds are irrelevant here (one admin creating
// playgrounds by hand, never automated/bulk), and a collision would just overwrite a prior
// playground's row, same failure mode as clicking "new" twice in the same millisecond anywhere else
// in this app.
function randomSuffix() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export function makePlaygroundId(ownerUid) {
  const uid = ownerUid && String(ownerUid).trim() ? String(ownerUid).trim() : 'local';
  return `${PLAYGROUND_ID_PREFIX}${uid}_${randomSuffix()}`;
}

// The raw value stored in the device-local `res_demo_mode` key. Three shapes, oldest-first:
//  - absent / 'false'           -> not in a playground (the real workspace)
//  - 'true'  (LEGACY)           -> the old single shared demo row was active
//  - any other string           -> a playground row id, assumed active
// isPlaygroundModeValue is the boolean "am I in some kind of sandbox right now" used everywhere the
// old code used a plain `demoMode` boolean (export banners, QGenda-export disablement, Settings'
// import/clear refusal, etc.) — that surface is unchanged by this feature, only the ROW the
// sandbox is backed by changes.
export function isPlaygroundModeValue(v) {
  return Boolean(v) && v !== 'false';
}

// Resolves the stored res_demo_mode value to the actual res_state row id it refers to, or null if
// not in sandbox mode / the value is unrecognized (treated as "not in sandbox" — never guess a row
// id out of a corrupt value).
export function resolveActiveRowId(v) {
  if (!isPlaygroundModeValue(v)) return null;
  if (v === 'true') return LEGACY_DEMO_ROW_ID;
  return isPlaygroundId(v) ? v : null;
}

// ─── Write-path guards ──────────────────────────────────────────────────────────────────────────
// Every write path into res_state must target exactly one of "the real row" or "the active
// sandbox row" — never the other. Each call site already knows which one it INTENDS to write
// (it's either real-workspace code or playground code), so this just asserts that intent matches
// the row id it's about to send, catching a wiring bug (e.g. a stale/mis-threaded rowId) before it
// reaches the network instead of silently corrupting the wrong row.
export function assertWriteTargetRowId(rowId, { expectPlayground }) {
  const sandboxed = isSandboxRowId(rowId);
  if (expectPlayground && !sandboxed) {
    throw new Error(`Refusing to write playground data to non-sandbox row "${rowId}"`);
  }
  if (!expectPlayground && sandboxed) {
    throw new Error(`Refusing to write real-workspace data to sandbox row "${rowId}"`);
  }
}

// ─── Playground metadata ────────────────────────────────────────────────────────────────────────
// Lives at doc._playground inside a playground's res_state document (or the local-only meta
// object) — the real doc and the legacy demo row never have this key.
export function makePlaygroundMeta({ name, ownerUid, ownerEmail, source }) {
  return {
    name: (name && String(name).trim()) || 'Untitled playground',
    ownerUid: ownerUid || null,
    ownerEmail: ownerEmail || null,
    source: source === 'blank' ? 'blank' : 'copy',
    createdAt: new Date().toISOString(),
  };
}

// Shapes one row of a `select=id,updated_at,meta:data->_playground` PostgREST listing (or an
// equivalent local-only descriptor) into display-ready form. Untrusted shape in both cases — a
// historical/foreign row, or hand-edited localStorage — so every field is guarded, never assumed.
export function shapePlaygroundListRow(row) {
  const meta = (row && typeof row.meta === 'object' && row.meta) || {};
  const id = row && row.id;
  return {
    id,
    name: (typeof meta.name === 'string' && meta.name.trim()) || 'Untitled playground',
    source: meta.source === 'blank' ? 'blank' : 'copy',
    ownerUid: typeof meta.ownerUid === 'string' ? meta.ownerUid : ownerUidFromPlaygroundId(id),
    ownerEmail: typeof meta.ownerEmail === 'string' ? meta.ownerEmail : null,
    createdAt: typeof meta.createdAt === 'string' ? meta.createdAt : null,
    updatedAt: (row && row.updated_at) || null,
  };
}

// Defense-in-depth filter on top of the id=like.pg_<uid>_* query the caller already scoped the
// request to — belt-and-suspenders against a future query change silently widening the listing to
// another admin's playgrounds. "Mine" is decided by the id's own embedded owner uid, same thing
// the server-side `like` filter already keyed on.
export function filterOwnPlaygrounds(rows, ownerUid) {
  if (!ownerUid) return [];
  return (rows || []).filter(r => ownerUidFromPlaygroundId(r && r.id) === ownerUid);
}

// ─── Promote-to-real ────────────────────────────────────────────────────────────────────────────
// "Use this schedule for real": finds the real workspace's block matching the playground's
// current block (same id, else same start/end dates), and summarizes what promoting would change.
// Only ever looks at the real doc's LIVE block (res_current_block) — a saved blocksHistory
// snapshot isn't what the chief is actively viewing, so it's never a promote target; the chief can
// always re-save afterward if they want a new snapshot of the promoted result.
export function findMatchingRealBlock(realDoc, pgBlock) {
  const real = realDoc && realDoc.res_current_block;
  if (!real || !pgBlock) return null;
  if (real.id && pgBlock.id && real.id === pgBlock.id) return real;
  if (real.startDate && real.endDate && real.startDate === pgBlock.startDate && real.endDate === pgBlock.endDate) {
    return real;
  }
  return null;
}

// Cell-level diff restricted to one block's schedule — same "unassigned ?? null" collapsing
// convention as stateDiff.js's scheduleCellsChanged, plus which residents own a changed cell
// (stateDiff.js only needed a count; promote's confirm UI wants "N residents affected" too).
export function summarizePromoteDiff(realBlock, pgBlock) {
  const os = (realBlock && realBlock.schedule) || {};
  const ns = (pgBlock && pgBlock.schedule) || {};
  const residentIds = new Set([...Object.keys(os), ...Object.keys(ns)]);
  let cellsChanged = 0;
  const affected = new Set();
  for (const rid of residentIds) {
    const oldRow = os[rid] || {};
    const newRow = ns[rid] || {};
    const dates = new Set([...Object.keys(oldRow), ...Object.keys(newRow)]);
    for (const d of dates) {
      if ((oldRow[d] ?? null) !== (newRow[d] ?? null)) { cellsChanged++; affected.add(rid); }
    }
  }
  return { cellsChanged, residentsAffected: affected.size };
}

// Pure merge: returns a NEW real doc with ONLY the matched block's schedule (and lockedCells, if
// the playground block carries any) replaced — every other field (roster, settings, rules,
// blocksHistory, the block's own dates/name/offServiceResidents/etc.) is untouched. Returns null
// if no matching real block exists (caller shows "nothing to promote into" instead of guessing).
export function promoteBlockSchedule(realDoc, pgBlock) {
  const target = findMatchingRealBlock(realDoc, pgBlock);
  if (!target) return null;
  const patch = { schedule: (pgBlock && pgBlock.schedule) || {} };
  if (pgBlock && pgBlock.lockedCells !== undefined) patch.lockedCells = pgBlock.lockedCells;
  return { ...realDoc, res_current_block: { ...target, ...patch } };
}
