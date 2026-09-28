// src/lib/toastHistory.js
// Pure state helpers for the toast-history bell (P4 UI polish): toasts already auto-dismiss after
// 5s (see ResidentScheduler.jsx's showToast), so once one disappears there was no way to re-read
// what it said. This is session-only, in-memory history — deliberately NOT a `res_*` localStorage
// key (see CLAUDE.md: a new `res_*` key needs LS_BACKUP_KEYS + syncBindings wiring or it silently
// won't round-trip; a transient notification list has no business surviving a reload, let alone
// syncing across devices). No React, no side effects — the component owns the actual useState.

export const TOAST_HISTORY_LIMIT = 20;

// Prepends one toast onto the history list, newest first, capped at `limit`. Tolerates a missing/
// malformed `history` (never crashes on a bad initial value) and a toast with no message (a no-op —
// there is nothing worth remembering). `toast.at` is accepted rather than always stamped internally
// so a caller (or a test) can pin the clock; it defaults to "now" for the real showToast call site.
export function addToastEntry(history, toast, limit = TOAST_HISTORY_LIMIT) {
  const list = Array.isArray(history) ? history : [];
  if (!toast || !toast.msg) return list;
  const entry = { msg: toast.msg, tone: toast.tone || 'amber', at: toast.at ?? Date.now() };
  return [entry, ...list].slice(0, Math.max(0, limit));
}

// Empties the history — a plain function (rather than inlining `[]` at every call site) so the
// "what does Clear do" question has exactly one answer, same posture as every other single-writer
// helper in this file (CLAUDE.md's markChangelogSeen/saveBlock pattern).
export function clearToastHistory() {
  return [];
}

// Display-time formatting for a history row, relative for anything recent (matches how a chief
// actually reads a list of things that "just happened") and a plain locale time once it's stale
// enough that "Xh ago" stops being more useful than a clock time. `now` is a parameter (not read
// internally via Date.now()) purely so this stays deterministic under test.
export function formatToastAge(at, now = Date.now()) {
  const ms = now - at;
  if (!Number.isFinite(ms) || ms < 0) return new Date(at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}
