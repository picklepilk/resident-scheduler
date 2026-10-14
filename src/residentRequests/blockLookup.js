// Pure helpers for matching a resident's requested date against known scheduling blocks, and for
// reading those blocks read-only via public.resident_block_lookup() (supabase/
// migrate_res_state_admin_only.sql) — a SECURITY DEFINER RPC scoped to exactly the fields this
// surface needs. This file intentionally does NOT import from ResidentScheduler.jsx — the
// resident-facing app is a separate surface with no access to that file's local component state.
// It does import `supabase` from supabaseClient.js, since that's this app's own auth surface (the
// RPC call rides the signed-in resident's own session JWT via supabase-js, same as every other
// authenticated read/write in residentRequests/*).
//
// Until 2026-10-14 this read the WHOLE shared res_state row directly (wide-open RLS, no session
// needed) and narrowed it down client-side — a confirmed data-exposure gap: it pulled every
// resident's name and the full generated schedule to the resident's browser before narrowing
// anything. res_state is admin-only now; resident_block_lookup() does the narrowing server-side
// instead, and requires an approved (non-'pending') caller — same gate
// migrate_block_pending_account_access.sql already enforces for day_off_requests.

import { supabase } from '../supabaseClient';

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

// Shared RPC call backing every read below — the single place the supabase.rpc() call and error
// handling live (fetchRosterForPicker reuses this instead of duplicating it, same as before).
// Returns null on any failure (unconfigured, not signed in, denied, network error) rather than
// throwing, since every caller only uses this for informational display (cutoff warning,
// block-grouping label, name picker) — never a hard gate. Each exported function below calls this
// independently (one RPC round-trip per mounted consumer) — same duplication the old
// fetchResState had when both RequestForm and RequestList were mounted together; not solved here,
// out of scope for this change.
async function fetchLookup() {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase.rpc('resident_block_lookup');
    if (error) return null;
    return data || null;
  } catch {
    return null;
  }
}

// Pure mappings, split out from fetchBlocksForLookup/fetchAyDataForLookup/fetchRosterForPicker so
// they're unit-testable without mocking supabase.rpc — exported for blockLookup.test.js. Every
// input is untrusted shape (the RPC's jsonb result, same "guard like normalizeCoverageEntry"
// posture CLAUDE.md asks for everywhere else this app reads cloud data).
export function normalizeLookupBlocks(data) {
  return Array.isArray(data?.blocks) ? data.blocks : [];
}
export function normalizeLookupAyData(data) {
  return data && typeof data.ayData === 'object' && data.ayData ? data.ayData : {};
}
export function normalizeLookupRoster(data) {
  const roster = Array.isArray(data?.roster) ? data.roster : [];
  return roster.map(r => ({ id: r.id, firstName: r.firstName, lastName: r.lastName }))
    .sort((a, b) => a.lastName.localeCompare(b.lastName));
}

export async function fetchBlocksForLookup() {
  return normalizeLookupBlocks(await fetchLookup());
}

// Per-AY config fetch (the RPC's `ayData` field, mirroring res_state's old res_ay_data key), so
// the resident-facing request form can tell someone that the date they're about to request is
// Thanksgiving. Returns {} on any failure — every caller uses this only to ADD an informational
// note, never to gate or validate a submission, so a failed fetch degrades to "no note" rather
// than to a broken form. Importing src/lib/holidays.js from here is fine and intended: the rule
// this directory honors is "never import from ResidentScheduler.jsx", and lib/* is pure.
export async function fetchAyDataForLookup() {
  return normalizeLookupAyData(await fetchLookup());
}

// Roster fetch — only RENDERS the fields needed to let a resident identify themselves. Unlike the
// old fetchResState path, resident_block_lookup() already narrows this server-side to
// id/firstName/lastName before it ever crosses the wire; normalizeLookupRoster re-narrows anyway
// (never trust remote shape fully, same convention as everywhere else cloud data is read).
export async function fetchRosterForPicker() {
  return normalizeLookupRoster(await fetchLookup());
}
