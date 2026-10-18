// Pure helpers for "acknowledge / dismiss" on validateAll warnings (Wave E2). Stored on the block as
// `block.issueAcks = { [ackKey]: { at, by, note } }`. Errors (level 'error') can never be
// acknowledged. Acknowledging NEVER changes export-blocking semantics: EXPORT_BLOCKING_RULE_IDS,
// blockingWarnCount and the export-confirm gate keep counting an acknowledged blocking warning.
import { normalizeIssueMessage } from './reviewPanel.js';

// Stable identity of an issue across re-validation: rule id + resident + date + shift + the message
// with dates/numbers stripped (so a count that drifts, e.g. "3 separate night stints" text variants
// of the same warning, still hits the same ack, while a different resident/date never does).
export function ackKeyFor(issue) {
  if (!issue) return '';
  return [
    issue.rule || '', issue.residentId || '', issue.dateStr || '', issue.shiftId || '',
    normalizeIssueMessage(issue.message),
  ].join('|');
}

export function isAckable(issue) {
  return !!issue && issue.level !== 'error';
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
    (isAckable(i) && a[ackKeyFor(i)] ? acked : active).push(i);
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
  for (const i of Array.isArray(issues) ? issues : []) delete out[ackKeyFor(i)];
  return out;
}

// Drops acks whose issue is no longer present.
export function pruneAcks(acks, issues) {
  const live = new Set((Array.isArray(issues) ? issues : []).map(ackKeyFor));
  const out = {};
  for (const [k, v] of Object.entries(normalizeAcks(acks))) if (live.has(k)) out[k] = v;
  return out;
}
