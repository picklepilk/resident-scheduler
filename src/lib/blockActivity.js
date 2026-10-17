// Per-block activity log: who changed the schedule and when. Two admins share ONE synced document,
// so without this nobody can tell their own trial run from the colleague's edits. Rides inside the
// block object (like overrideLog), so it persists through block save/load/backup/sync with no new
// res_* key. Pure — no React, never imports ResidentScheduler.jsx.
//
// Entry: { at: ISO, by: userId|null, email: string|null, kind, cells, count, note }
// `count` = number of merged actions (a burst of cell edits collapses into one entry).

export const ACTIVITY_KINDS = Object.freeze(['generate', 'edit', 'lock', 'undo', 'clear', 'import']);

const DEFAULT_MERGE_WINDOW_MS = 15 * 60 * 1000;
const DEFAULT_CAP = 60;
// Kinds whose `cells` count is a hand-edit tally (generate/import carry whole-schedule numbers).
const EDIT_KINDS = new Set(['edit', 'undo', 'clear', 'lock']);

const strOrNull = v => (typeof v === 'string' ? v : null);
const nonNegInt = (v, dflt) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : dflt);

function normalizeEntry(e) {
  if (!e || typeof e !== 'object' || Array.isArray(e)) return null;
  if (typeof e.at !== 'string' || !Number.isFinite(Date.parse(e.at))) return null;
  if (!ACTIVITY_KINDS.includes(e.kind)) return null;
  return {
    at: e.at, by: strOrNull(e.by), email: strOrNull(e.email), kind: e.kind,
    cells: nonNegInt(e.cells, 0), count: nonNegInt(e.count, 1), note: strOrNull(e.note),
  };
}

// Untrusted shape (old snapshot, backup, cloud) — drop anything unusable, sort oldest first.
export function normalizeActivityLog(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.map(normalizeEntry).filter(Boolean).sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
}

// Returns a NEW array. Same actor + kind inside the window merges into the last entry (generate
// never merges — each generation is its own event).
export function appendActivity(log, entry, { mergeWindowMs = DEFAULT_MERGE_WINDOW_MS, cap = DEFAULT_CAP } = {}) {
  const base = normalizeActivityLog(log);
  const next = normalizeEntry(entry);
  if (!next) return base;
  const last = base[base.length - 1];
  if (last && last.by === next.by && last.email === next.email && last.kind === next.kind && next.kind !== 'generate'
      // undo and redo share kind 'undo' (redo carries note 'redo'); never fold one into the other.
      && (next.kind !== 'undo' || next.note === last.note)) {
    const dt = Date.parse(next.at) - Date.parse(last.at);
    if (dt >= 0 && dt <= mergeWindowMs) {
      const merged = { ...last, at: next.at, cells: last.cells + next.cells, count: last.count + 1, note: next.note ?? last.note };
      return [...base.slice(0, -1), merged].slice(-cap);
    }
  }
  return [...base, next].slice(-cap);
}

export function lastActivity(log) {
  const l = normalizeActivityLog(log);
  return l.length ? l[l.length - 1] : null;
}

// Entries by someone other than the viewer, newer than the device's last "seen" marker. A null
// viewer id matches null-actor entries (auth off / this device).
export function unseenByOthers(log, viewerId, seenAtIso) {
  const me = viewerId ?? null;
  const seenMs = seenAtIso ? Date.parse(seenAtIso) : NaN;
  return normalizeActivityLog(log)
    .filter(e => e.by !== me && (!Number.isFinite(seenMs) || Date.parse(e.at) > seenMs))
    .reverse();
}

export function summarizeActivity(entries) {
  const out = { edits: 0, generates: 0, imports: 0, actors: [] };
  for (const e of Array.isArray(entries) ? entries : []) {
    if (EDIT_KINDS.has(e.kind)) out.edits += e.cells || 0;
    else if (e.kind === 'generate') out.generates += e.count || 1;
    else if (e.kind === 'import') out.imports += e.count || 1;
    const actor = e.email ?? null;
    if (!out.actors.includes(actor)) out.actors.push(actor);
  }
  return out;
}

export function actorLabel(entry, viewer) {
  if (viewer?.userId && entry?.by === viewer.userId) return 'You';
  const email = entry?.email;
  if (typeof email === 'string' && email) {
    const local = email.split('@')[0];
    if (local) return local.charAt(0).toUpperCase() + local.slice(1);
  }
  return 'This device';
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function relativeTime(iso, nowMs = Date.now()) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  const diff = Math.max(0, nowMs - t);
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day <= 14) return `${day}d ago`;
  const d = new Date(t);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}
