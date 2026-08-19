// Pure helpers for matching a resident's requested date against known scheduling blocks, and for
// reading those blocks read-only from the shared res_state cloud row (same wide-open-RLS row the
// main app's cloud sync already uses — see ResidentScheduler.jsx's SUPABASE SYNC section). This
// file intentionally does NOT import from ResidentScheduler.jsx — the resident-facing app is a
// separate surface with no access to that file's local component state. It does import the small
// isUnresolvedToken guard from supabaseClient.js, since that's this app's own auth surface, not
// ResidentScheduler.jsx.

import { isUnresolvedToken } from '../supabaseClient';

export function findBlockForDate(dateStr, blocks) {
  return blocks.find(b => b.startDate && b.endDate && dateStr >= b.startDate && dateStr <= b.endDate) || null;
}

// Block label for a request: matched off its EARLIEST date (dates aren't submitted in sorted
// order — RequestForm lets a resident add date fields in any order), so a multi-date request that
// spans two blocks lands under the block its earliest date falls into, deterministically — not
// whichever date happened to be first in the array. Shared by RequestList (resident-facing list,
// admin's "view as" preview) and RequestsTab's ApprovalQueue — this file's whole purpose is to be
// the one place this logic lives, see the header comment above.
export function blockLabelFor(req, blocks) {
  if (!req.dates.length) return 'Not yet scheduled';
  const earliest = [...req.dates].sort()[0];
  const block = findBlockForDate(earliest, blocks);
  return block ? block.name : 'Not yet scheduled';
}

// Groups requests by block label — chronological by block startDate, "Not yet scheduled" last.
// Requests within a group keep whatever order the caller's `requests` array already has (callers
// that need a secondary sort, e.g. by resident name, sort their own copy before/after grouping).
export function groupByBlock(requests, blocks) {
  const byLabel = new Map();
  for (const req of requests) {
    const label = blockLabelFor(req, blocks);
    if (!byLabel.has(label)) byLabel.set(label, []);
    byLabel.get(label).push(req);
  }
  const order = [...blocks].sort((a, b) => a.startDate.localeCompare(b.startDate)).map(b => b.name);
  const labels = [...byLabel.keys()].sort((a, b) => {
    if (a === 'Not yet scheduled') return 1;
    if (b === 'Not yet scheduled') return -1;
    return order.indexOf(a) - order.indexOf(b);
  });
  return labels.map(label => ({ label, requests: byLabel.get(label) }));
}

// "LastName, FirstName" — shared so the picker (ResidentPicker) and the chief queue (RequestsTab)
// can't drift on how a resident's name is displayed.
export function formatResidentName(resident) {
  return resident ? `${resident.lastName}, ${resident.firstName}` : '';
}

// Whole weeks between two ISO date strings (toDateStr expected to be on/after fromDateStr).
export function weeksUntil(fromDateStr, toDateStr) {
  const from = new Date(`${fromDateStr}T00:00:00Z`);
  const to = new Date(`${toDateStr}T00:00:00Z`);
  return Math.floor((to.getTime() - from.getTime()) / (7 * 24 * 60 * 60 * 1000));
}

const RES_STATE_URL_KEY = '__SUPABASE_URL__';
const RES_STATE_ANON_KEY = '__SUPABASE_ANON__';

// Shared read-only fetch of the shared res_state row's `data` blob — the single place the
// URL/anon-key-reading and error handling live for every read this resident-facing app needs
// (Task 6's fetchRosterForPicker reuses this instead of duplicating it). No Supabase Auth session
// needed, since that table's RLS policy is intentionally wide-open (public_read_write). Returns
// null on any failure (unconfigured, network error, empty row) rather than throwing, since every
// caller only uses this for informational display (cutoff warning, block-grouping label, name
// picker) — never a hard gate.
//
// KNOWN LIMITATION (accepted, not a regression — res_state has been wide-open by design since
// before this feature; see ResidentScheduler.jsx's SUPABASE SYNC section): this pulls the WHOLE
// shared document — the full generated schedule, every resident's shifts — to the resident's
// browser before the caller narrows it down to just block dates or roster names. "Residents never
// see the schedule" is enforced by this app's UI only, not by RLS/data-layer scoping; a resident
// who inspects network traffic (or who simply navigates to the unauthenticated main `/` route on
// the same origin) can already see the full schedule today, with or without this feature. Closing
// this for real would mean serving `/requests` a narrow, RLS-scoped view (or Edge Function) instead
// of this blob, and gating `/` itself — both out of scope here; left as a documented tradeoff.
export async function fetchResState() {
  const url = (typeof globalThis !== 'undefined' && globalThis[RES_STATE_URL_KEY]) || '';
  const anon = (typeof globalThis !== 'undefined' && globalThis[RES_STATE_ANON_KEY]) || '';
  if (!url || isUnresolvedToken(url) || !anon || isUnresolvedToken(anon)) return null;
  // Same 15s bound as ResidentScheduler.jsx's sbFetch, for the same reason: a stalled (not
  // failed) network shouldn't hang this form/list forever with no recovery.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(`${url}/rest/v1/res_state?id=eq.main&select=data`, {
      headers: { apikey: anon, Authorization: `Bearer ${anon}` },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const rows = await res.json();
    return rows && rows[0] && rows[0].data ? rows[0].data : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchBlocksForLookup() {
  const data = await fetchResState();
  if (!data) return [];
  const current = data.res_current_block;
  const history = Array.isArray(data.res_blocks_history) ? data.res_blocks_history : [];
  const all = [...history, ...(current ? [current] : [])];
  return all
    .filter(b => b && b.startDate && b.endDate)
    .map(b => ({ id: b.id, name: b.name || b.startDate, startDate: b.startDate, endDate: b.endDate }));
}

// Read-only roster fetch, same res_state row as fetchBlocksForLookup — only RENDERS the fields
// needed to let a resident identify themselves. See fetchResState's own comment above: the
// underlying fetch still pulls the whole shared document (including the full schedule) to the
// browser first; this function just narrows what's returned/displayed, not what crossed the wire.
export async function fetchRosterForPicker() {
  const data = await fetchResState();
  const roster = data && Array.isArray(data.res_em_roster) ? data.res_em_roster : [];
  return roster.map(r => ({ id: r.id, firstName: r.firstName, lastName: r.lastName }))
    .sort((a, b) => a.lastName.localeCompare(b.lastName));
}
