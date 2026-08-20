// src/lib/importLog.js
// Pure helpers for the "Import History" log (res_import_log) — an audit trail of every
// roster/matrix/vacation/lecture import the chief has run, so "what did I upload last week, and
// what did it actually do" doesn't require re-deriving from memory. Pure module: no React, must
// never import ResidentScheduler.jsx (circular).
//
// Entry shape (owned/written by ResidentScheduler.jsx's four importers, not this file):
//   { id, at /* ISO */, kind: 'roster'|'matrix'|'vacation'|'lectures', filename?, sizeBytes?,
//     summary /* string */, rawText? }
// rawText is populated ONLY for the two paste-based importers (roster, lectures) — the two xlsx
// importers (matrix, vacation) store filename+size+summary only. `summary` for the xlsx
// importers is counts only (rows matched, blocks parsed, date ranges) — never a resident name
// list, both because this repo is public (see CLAUDE.md's "never commit real resident names")
// and because an unbounded name list is exactly what the byte cap below exists to prevent from
// silently ballooning a synced cloud document.

// ~500KB serialized — matches the "keep the shared cloud blob from growing without bound" intent
// already applied to OVERRIDE_LOG_CAP/jeopardyLog elsewhere in this app; import entries are rarer
// but each can carry a large rawText paste, so a byte cap (not an entry-count cap) is what
// actually protects the sync payload size.
export const IMPORT_LOG_CAP_BYTES = 500 * 1024;

// Appends `entry` to `log` (existing untrusted-shape guard: a non-array `log` — corrupted
// localStorage, a stale cloud row from an older build — is treated as empty rather than thrown
// on, same convention as reconcileTabOrder's Array.isArray guard) and evicts the OLDEST entries
// until the whole serialized array is back at/under `cap` bytes. A single entry alone larger
// than `cap` (e.g. one huge paste) is still appended, never silently dropped — eviction only
// trims older neighbors around it, so the newest import is always visible.
export function appendImportLog(log, entry, cap = IMPORT_LOG_CAP_BYTES) {
  const base = Array.isArray(log) ? log : [];
  const next = [...base, entry];
  while (next.length > 1 && JSON.stringify(next).length > cap) {
    next.shift();
  }
  return next;
}

// Untrusted-shape guard for reading the persisted/synced value back — same convention as
// reconcileTabOrder (ResidentScheduler.jsx): a non-array value (corrupted localStorage, a
// version-skewed cloud row) reads as "no history" rather than throwing.
export function normalizeImportLog(value) {
  return Array.isArray(value) ? value : [];
}
