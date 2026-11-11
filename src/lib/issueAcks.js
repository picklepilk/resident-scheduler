// Pure helpers for "acknowledge / dismiss" on validateAll warnings (Wave E2). Stored on the block as
// `block.issueAcks = { [ackKey]: { at, by, note } }`. Errors (level 'error') can never be
// acknowledged. Acknowledging NEVER changes export-blocking semantics: EXPORT_BLOCKING_RULE_IDS,
// blockingWarnCount and the export-confirm gate keep counting an acknowledged blocking warning.

// Identity of EXACTLY the issue the chief saw: rule + resident + date + anchorDate (run-anchored
// issues such as isolated night stints carry only anchorDate) + shift + message. Numbers stay in
// the key on purpose: if a count or wording changes ("2 vs 3 separate night stints", "Under target
// N/M"), the ack lapses and the issue reappears. Only whitespace/case are normalized.
export function ackKeyFor(issue) {
  if (!issue) return '';
  return [
    issue.rule || '', issue.residentId || '', issue.dateStr || '', issue.anchorDate || '', issue.shiftId || '',
    String(issue.message || '').replace(/\s+/g, ' ').trim().toLowerCase(),
  ].join('|');
}

// Rule ids added 2026-11-11 to warns that used to carry none. An ack saved before then was keyed
// with rule '' — still honor it, so existing acknowledgements don't silently lapse.
export const LEGACY_RULELESS_IDS = new Set(['nightStintIsolated', 'nightStintPair', 'coverageBelowMin', 'coverageAboveMax', 'internPairing', 'jcPresenterMissing']);

// Every key an ack for this issue may be stored under: the current key, plus the pre-id key.
function ackKeysFor(issue) {
  const k = ackKeyFor(issue);
  return issue && LEGACY_RULELESS_IDS.has(issue.rule) ? [k, ackKeyFor({ ...issue, rule: '' })] : [k];
}

// The stored ack entry for an issue (current or legacy key), or undefined.
export function ackEntryFor(acks, issue) {
  if (!acks || typeof acks !== 'object') return undefined;
  for (const k of ackKeysFor(issue)) if (acks[k]) return acks[k];
  return undefined;
}

function ackFor(issue, a) {
  return ackEntryFor(a, issue);
}

export function isAckable(issue) {
  return !!issue && issue.level !== 'error' && !issue.overridden;
}

// Backup/cloud data is untrusted shape.
export function normalizeAcks(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out = {};
  for (const [k, v] of Object.entries(raw)) {
    if (!k || !v || typeof v !== 'object') continue;
    out[k] = { at: typeof v.at === 'string' ? v.at : '', by: typeof v.by === 'string' ? v.by : '', note: typeof v.note === 'string' ? v.note : '' };
  }
  return out;
}

// Splits issues into still-active vs acknowledged. Errors are always active.
export function partitionAcked(issues, acks) {
  const a = normalizeAcks(acks);
  const active = [];
  const acked = [];
  for (const i of Array.isArray(issues) ? issues : []) {
    (isAckable(i) && ackFor(i, a) ? acked : active).push(i);
  }
  return { active, acked };
}

// Returns a NEW acks map with every ackable issue added (existing acks kept, errors skipped).
export function addAcks(acks, issues, { at, by = '', note = '' } = {}) {
  const out = { ...normalizeAcks(acks) };
  const stamp = at || new Date().toISOString();
  for (const i of Array.isArray(issues) ? issues : []) {
    if (!isAckable(i)) continue;
    const key = ackKeyFor(i);
    if (key && !out[key]) out[key] = { at: stamp, by: by || '', note: (note || '').trim().slice(0, 200) };
  }
  return out;
}

export function removeAcks(acks, issues) {
  const out = { ...normalizeAcks(acks) };
  for (const i of Array.isArray(issues) ? issues : []) for (const k of ackKeysFor(i)) delete out[k];
  return out;
}

// Drops acks whose issue is no longer present.
export function pruneAcks(acks, issues) {
  const live = new Set((Array.isArray(issues) ? issues : []).flatMap(ackKeysFor));
  const out = {};
  for (const [k, v] of Object.entries(normalizeAcks(acks))) if (live.has(k)) out[k] = v;
  return out;
}
