// Pure helpers for matching a resident's requested date against known scheduling blocks, and for
// reading those blocks read-only from the shared res_state cloud row (same wide-open-RLS row the
// main app's cloud sync already uses — see ResidentScheduler.jsx's SUPABASE SYNC section). This
// file intentionally does NOT import from ResidentScheduler.jsx — the resident-facing app is a
// separate surface with no access to that file's local component state.

export function findBlockForDate(dateStr, blocks) {
  return blocks.find(b => b.startDate && b.endDate && dateStr >= b.startDate && dateStr <= b.endDate) || null;
}

// Whole weeks between two ISO date strings (toDateStr expected to be on/after fromDateStr).
export function weeksUntil(fromDateStr, toDateStr) {
  const from = new Date(`${fromDateStr}T00:00:00Z`);
  const to = new Date(`${toDateStr}T00:00:00Z`);
  return Math.floor((to.getTime() - from.getTime()) / (7 * 24 * 60 * 60 * 1000));
}

const RES_STATE_URL_KEY = '__SUPABASE_URL__';
const RES_STATE_ANON_KEY = '__SUPABASE_ANON__';

// Read-only fetch of the shared res_state row's block data — no Supabase Auth session needed,
// since that table's RLS policy is intentionally wide-open (public_read_write). Returns [] on any
// failure (unconfigured, network error, empty row) rather than throwing, since this only powers
// an informational cutoff warning and block-grouping label — never a hard gate.
export async function fetchBlocksForLookup() {
  const url = (typeof globalThis !== 'undefined' && globalThis[RES_STATE_URL_KEY]) || '';
  const anon = (typeof globalThis !== 'undefined' && globalThis[RES_STATE_ANON_KEY]) || '';
  if (!url || url.startsWith('%') || !anon || anon.startsWith('%')) return [];
  try {
    const res = await fetch(`${url}/rest/v1/res_state?id=eq.main&select=data`, {
      headers: { apikey: anon, Authorization: `Bearer ${anon}` },
    });
    if (!res.ok) return [];
    const rows = await res.json();
    const data = rows && rows[0] && rows[0].data;
    if (!data) return [];
    const current = data.res_current_block;
    const history = Array.isArray(data.res_blocks_history) ? data.res_blocks_history : [];
    const all = [...history, ...(current ? [current] : [])];
    return all
      .filter(b => b && b.startDate && b.endDate)
      .map(b => ({ id: b.id, name: b.name || b.startDate, startDate: b.startDate, endDate: b.endDate }));
  } catch {
    return [];
  }
}
