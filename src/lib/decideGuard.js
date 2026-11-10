// Admin approve/deny writes are conditional on the request still being pending (`.eq('status',
// 'pending')`). A conditional update that matches nothing returns an empty array rather than an
// error, so the caller checks this before stamping local roster state or refreshing.
export function wasDecisionApplied(rows) {
  return Array.isArray(rows) && rows.length > 0;
}

export const DECISION_STALE_MESSAGE = 'Request was already decided or withdrawn';
