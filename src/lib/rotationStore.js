// Pure ayData helpers for off-service rotations (ayData[AY].rotations), block dates and QGenda slot
// runs. Lives in the existing res_ay_data blob: NO new res_* key. Never import ResidentScheduler.jsx.
// Stored data is untrusted shape: every read goes through normalizeRotation.
import { normalizeRotation, rotationKey } from './rotationLedger.js';
import { CAT_MAP } from './parse.js';

const letters = s => String(s ?? '').toLowerCase().replace(/[^\p{L}]/gu, '');
const nameKey = r => `${letters(r?.lastName)}|${letters(r?.firstName)}`;
const isIso = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);

function defaultId() {
  try { if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID(); } catch { /* fall through */ }
  return `rot_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

function confOf(ayData, ay) {
  const c = ayData?.[ay];
  return c && typeof c === 'object' && !Array.isArray(c) ? c : {};
}

/** Normalized rotations of one AY (bad entries dropped). Keeps `pgyGuessed` and `externalId`. */
export function getRotations(ayData, ay) {
  const raw = confOf(ayData, ay).rotations;
  const out = [];
  for (const r of Array.isArray(raw) ? raw : []) {
    const n = normalizeRotation(r);
    if (!n) continue;
    if (r.pgyGuessed === true) n.pgyGuessed = true;
    if (r.externalId != null) n.externalId = r.externalId;
    out.push(n);
  }
  return out;
}

/**
 * Merge parsed roster rows into ayData[ay].rotations by rotationKey. Existing match: dates,
 * category, pgy and scheduledByUs come from the import; id, obligation, ranges, splits stay.
 * Rows with pgy null (multi-PGY category) default to the category's first pgyOption with
 * pgyGuessed:true (a stored non-guessed pgy is never replaced by a guess).
 * Returns { ayData, added, updated, guessed }.
 */
export function upsertRotations(ayData, ay, incoming, { makeId = defaultId, now = new Date().toISOString() } = {}) {
  const conf = confOf(ayData, ay);
  const list = (Array.isArray(conf.rotations) ? conf.rotations : []).filter(r => r && typeof r === 'object');
  const byKey = new Map();
  list.forEach((r, i) => { const k = rotationKey(r); if (!byKey.has(k)) byKey.set(k, i); });
  const next = list.slice();
  let added = 0, updated = 0, guessed = 0;
  for (const row of Array.isArray(incoming) ? incoming : []) {
    if (!row) continue;
    const category = row.category || (row.scheduledByUs === false ? 'BAMC_PA' : '');
    let pgy = row.pgy ?? null;
    let pgyGuessed = false;
    if (pgy == null && CAT_MAP[category]?.pgyOptions?.length) { pgy = CAT_MAP[category].pgyOptions[0]; pgyGuessed = true; }
    const fresh = {
      firstName: row.firstName, lastName: row.lastName, category, pgy,
      start: row.start, end: row.end, scheduledByUs: row.scheduledByUs !== false && category !== 'BAMC_PA',
    };
    if (row.externalId != null) fresh.externalId = row.externalId;
    if (!normalizeRotation({ ...fresh, id: 'x' })) continue;
    const k = rotationKey(fresh);
    if (byKey.has(k)) {
      const i = byKey.get(k);
      const old = next[i];
      const merged = { ...old, ...fresh, id: old.id, obligation: old.obligation ?? null,
        ranges: old.ranges ?? [], splits: old.splits ?? [], importedAt: now };
      if (pgyGuessed && old.pgy != null) { merged.pgy = old.pgy; if (old.pgyGuessed === true) merged.pgyGuessed = true; else delete merged.pgyGuessed; }
      else if (pgyGuessed) merged.pgyGuessed = true;
      else delete merged.pgyGuessed;
      if (merged.pgyGuessed) guessed++;
      next[i] = merged;
      updated++;
    } else {
      byKey.set(k, next.length);
      const rec = { ...fresh, id: makeId(), obligation: null, ranges: [], splits: [], importedAt: now };
      if (pgyGuessed) { rec.pgyGuessed = true; guessed++; }
      next.push(rec);
      added++;
    }
  }
  return { ayData: { ...(ayData || {}), [ay]: { ...conf, rotations: next } }, added, updated, guessed };
}

/** Replace the rotation with the same id (or append). `rot` is merged over the stored record. */
export function updateRotation(ayData, ay, rot) {
  const conf = confOf(ayData, ay);
  const list = Array.isArray(conf.rotations) ? conf.rotations.slice() : [];
  const i = list.findIndex(r => r && r.id === rot.id);
  if (i >= 0) list[i] = { ...list[i], ...rot };
  else list.push(rot);
  return { ...(ayData || {}), [ay]: { ...conf, rotations: list } };
}

const sameWindow = (rot, block) => !!block && rot.start <= block.endDate && rot.end >= block.startDate;

/**
 * The rotation that belongs to a block resident. By `resident.rotationId`; else first+last name AND
 * category AND a window overlapping the block. Zero or several matches: null (never guess).
 */
export function findRotationForResident(rotations, resident, block) {
  if (!resident || !Array.isArray(rotations) || !rotations.length) return null;
  if (resident.rotationId != null) {
    const hit = rotations.find(r => r.id === resident.rotationId);
    if (hit) return hit;
  }
  const nk = nameKey(resident);
  if (nk === '|') return null;
  const hits = rotations.filter(r => nameKey(r) === nk && r.category === resident.category && sameWindow(r, block));
  return hits.length === 1 ? hits[0] : null;
}

/** [{id:'b1',startDate,endDate}] from the EM Home header ({start,end} entries). */
export function blockDatesFromHome(homeBlocks) {
  return (Array.isArray(homeBlocks) ? homeBlocks : [])
    .filter(b => isIso(b?.start) && isIso(b?.end) && b.start <= b.end)
    .map((b, i) => ({ id: `b${i + 1}`, startDate: b.start, endDate: b.end }));
}

export function setBlockDates(ayData, ay, blockDates) {
  const conf = confOf(ayData, ay);
  return { ...(ayData || {}), [ay]: { ...conf, blockDates } };
}

/** Keep only dates/counts/areaMix of QGenda slot runs (slot labels are placeholders, never names). */
export function setQgendaSlotRuns(ayData, ay, runs) {
  const conf = confOf(ayData, ay);
  const slim = (Array.isArray(runs) ? runs : []).map(r => ({
    id: r.id, slot: r.slot, hint: r.hint ?? { category: null, pgy: null },
    start: r.start, end: r.end, count: r.count, areaMix: r.areaMix,
  }));
  return { ...(ayData || {}), [ay]: { ...conf, qgendaSlotRuns: slim } };
}

export function getQgendaSlotRuns(ayData, ay) {
  const raw = confOf(ayData, ay).qgendaSlotRuns;
  return (Array.isArray(raw) ? raw : []).filter(r => r && isIso(r.start) && isIso(r.end) && Number.isFinite(r.count) && r.areaMix);
}

/** Block windows for ledger math: stored blockDates, else saved snapshot dates + the open block. */
export function deriveBlocks(ayConf, block, blocksHistory) {
  const stored = (Array.isArray(ayConf?.blockDates) ? ayConf.blockDates : [])
    .filter(b => isIso(b?.startDate) && isIso(b?.endDate) && b.startDate <= b.endDate);
  if (stored.length) return stored;
  const seen = new Set();
  const out = [];
  const push = (id, s, e) => { if (isIso(s) && isIso(e) && s <= e && !seen.has(s)) { seen.add(s); out.push({ id, startDate: s, endDate: e }); } };
  if (block) push(block.id ?? 'open', block.startDate, block.endDate);
  for (const sn of Array.isArray(blocksHistory) ? blocksHistory : []) {
    push(sn?.id ?? null, sn?.data?.startDate ?? sn?.startDate, sn?.data?.endDate ?? sn?.endDate);
  }
  return out.sort((a, b) => a.startDate.localeCompare(b.startDate));
}

/** Ledger context for offServiceWindowStatus: null when the AY has no rotations (legacy path). */
export function buildRotationCtx(ayConf, block, blocksHistory) {
  const rotations = getRotations({ x: ayConf }, 'x');
  if (!rotations.length) return null;
  return { rotations, blocks: deriveBlocks(ayConf, block, blocksHistory) };
}

/**
 * Preview for "Apply roster to this block". Every rotation we schedule (scheduledByUs !== false)
 * touching the block is paired with an existing block resident (rotationId, else normalized name +
 * category, one resident per rotation) or marked to add. Reference rows are skipped; block residents
 * claimed by no rotation are listed as notOnRoster (never changed).
 * @returns {{entries:{rot:object,match:(object|null),action:'update'|'add',pgyFix:(number|null)}[],
 *   notOnRoster:object[], skipped:object[]}}
 */
export function planApplyRoster(rotations, residents, block) {
  const touching = (Array.isArray(rotations) ? rotations : []).filter(r => sameWindow(r, block));
  const skipped = touching.filter(r => r.scheduledByUs === false);
  const ours = touching.filter(r => r.scheduledByUs !== false).sort((a, b) => a.start.localeCompare(b.start) || nameKey(a).localeCompare(nameKey(b)));
  const list = (Array.isArray(residents) ? residents : []).filter(r => r && r.category !== 'EM_HOME');
  const claimed = new Set();
  const entries = [];
  for (const rot of ours) {
    let match = list.find(r => r.rotationId === rot.id && !claimed.has(r.id)) || null;
    if (!match) match = list.find(r => !claimed.has(r.id) && !r.rotationId && nameKey(r) === nameKey(rot) && r.category === rot.category) || null;
    if (!match) match = list.find(r => !claimed.has(r.id) && nameKey(r) === nameKey(rot) && r.category === rot.category) || null;
    if (match) claimed.add(match.id);
    const pgyFix = match && rot.pgyGuessed && match.pgy != null && match.pgy !== rot.pgy ? match.pgy : null;
    entries.push({ rot, match, action: match ? 'update' : 'add', pgyFix });
  }
  return { entries, notOnRoster: list.filter(r => !claimed.has(r.id)), skipped };
}
