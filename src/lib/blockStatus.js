// src/lib/blockStatus.js
// Pure step-derivation for the Schedule tab's block status rail (BlockContextBar). Answers "what's
// left before this block is done" from state the app already computes elsewhere — no new
// validateAll pass, no new persistence. See CLAUDE.md "Scheduling rules" header comment convention:
// this stays lib-legal because every input is a plain value/boolean the caller already has on hand
// (root `issues`/`issueCounts` memo, blocksHistory snapshot lookup, block.generationReport,
// block.lastExportedAt) — nothing here re-derives anything ResidentScheduler.jsx already owns.
//
// STEP ORDER IS FIXED: setup -> generated -> errors -> publish -> export. Exactly one step is
// 'current' (the first not-yet-done step in that order); everything before it is 'done', everything
// after it is 'pending' REGARDLESS of that later step's own underlying truthiness — e.g. a hand-built
// schedule with zero errors but never run through Generate still shows 'generated' as current and
// 'errors' as pending, not done. That's deliberate: this is a stepper, not five independent booleans.

export const BLOCK_STEP_IDS = ['setup', 'generated', 'errors', 'publish', 'export'];

// UTC so the label is deterministic regardless of the machine/test-runner timezone — `lastExportedAt`
// is always an ISO string (see ResidentScheduler.jsx runExport).
const SHORT_MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function formatShortDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${SHORT_MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

/**
 * @param {object} state
 * @param {boolean} state.hasDates       block.startDate && block.endDate
 * @param {boolean} state.hasReport      !!block.generationReport
 * @param {number}  state.errorCount     issueCounts.errors (root issues memo, level==='error')
 * @param {boolean} state.published      the matching blocksHistory snapshot's `published`
 * @param {boolean} state.hasSnapshot    whether a blocksHistory snapshot exists for this block yet
 * @param {?string} state.lastExportedAt block.lastExportedAt (ISO string) or null/undefined
 * @returns {{id:string, state:'done'|'current'|'pending', label:string}[]}
 */
export function deriveBlockSteps({ hasDates, hasReport, errorCount, published, hasSnapshot, lastExportedAt }) {
  const errors = Number(errorCount) || 0;
  const raw = [
    { id: 'setup', done: !!hasDates, label: 'Set up' },
    { id: 'generated', done: !!hasReport, label: hasReport ? 'Generated' : 'Generate' },
    { id: 'errors', done: errors === 0, label: errors > 0 ? `${errors} error${errors === 1 ? '' : 's'} to fix` : 'No errors' },
    { id: 'publish', done: !!published, label: published ? 'Published' : (hasSnapshot ? 'Publish' : 'Save block first') },
    { id: 'export', done: !!lastExportedAt, label: lastExportedAt ? `Exported ${formatShortDate(lastExportedAt)}` : 'Export' },
  ];

  let currentAssigned = false;
  return raw.map(step => {
    if (!currentAssigned && step.done) return { id: step.id, state: 'done', label: step.label };
    if (!currentAssigned) { currentAssigned = true; return { id: step.id, state: 'current', label: step.label }; }
    return { id: step.id, state: 'pending', label: step.label };
  });
}
