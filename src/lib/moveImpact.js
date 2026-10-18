// Pure helpers for the "move-impact" confirm (Wave E3): before a date-list edit is applied the
// current block is validated with and without the change; issues that exist only AFTER the edit
// (and are errors / export-blocking warnings) are what the edit "breaks".

// Same identity the acknowledge feature uses (rule + resident + date + anchor + shift + message),
// so an issue that merely persists across the edit is never reported as new.
export function issueIdentity(issue) {
  if (!issue) return '';
  return [
    issue.rule || '', issue.residentId || '', issue.dateStr || '', issue.anchorDate || '', issue.shiftId || '',
    String(issue.message || '').replace(/\s+/g, ' ').trim().toLowerCase(),
  ].join('|');
}

// isBlocking(issue) -> boolean; default = errors only. Duplicate identities are matched as a
// multiset so a second copy of an already-present issue still counts as new.
export function netNewIssues(before, after, isBlocking = i => i && i.level === 'error') {
  const seen = new Map();
  for (const i of Array.isArray(before) ? before : []) {
    const k = issueIdentity(i);
    seen.set(k, (seen.get(k) || 0) + 1);
  }
  const out = [];
  for (const i of Array.isArray(after) ? after : []) {
    if (!isBlocking(i)) continue;
    const k = issueIdentity(i);
    const n = seen.get(k) || 0;
    if (n > 0) { seen.set(k, n - 1); continue; }
    out.push(i);
  }
  return out;
}

// Caps the rows shown in the modal; `more` is how many were cut.
export function capRows(list, cap = 20) {
  const arr = Array.isArray(list) ? list : [];
  return { rows: arr.slice(0, cap), more: Math.max(0, arr.length - cap), total: arr.length };
}
