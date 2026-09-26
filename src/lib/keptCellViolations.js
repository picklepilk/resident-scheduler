// src/lib/keptCellViolations.js
// Kept-cell hard-error detection (see CLAUDE.md "under-target lift, kept-cell violations" plan
// A3): the generator/repair pass never overwrites a pre-existing non-empty cell (`keptCells` in
// ResidentScheduler.jsx's generateSchedule), so a hand-edited/locked/partial-regenerate-leftover
// cell that already violates a hard rule survives every fill/repair attempt untouched and keeps
// showing up as a red validateAll error. Pure module (lib/* may never import
// ResidentScheduler.jsx) — every table it needs (the validateAll issue list, the schedule, the
// lockedCells map) is passed in by the caller.

// Groups hard (level:'error'), resident+date-attributable validateAll issues by the schedule cell
// they land on, then splits into `locked` (block.lockedCells says the cell can't be auto-cleared)
// and `fixable` (everything else). Issues with no residentId/dateStr (block-wide facts like
// `rule:'underTarget'`, night-run-length, or a coverage-composition gap with no single resident to
// blame) are not cell-attributable and are dropped — there's no cell to clear for them. An issue
// naming a cell that's since gone empty (stale) is also dropped: nothing to fix there any more.
// Multiple issues on the same cell collapse into one entry with a `messages` array.
export function violatingCells(issues, schedule = {}, lockedCells = {}) {
  const byCell = new Map(); // `${residentId}|${dateStr}` -> {residentId, name, dateStr, shiftId, messages}
  for (const issue of issues || []) {
    if (issue.level !== 'error' || !issue.residentId || !issue.dateStr) continue;
    const shiftId = (schedule[issue.residentId] || {})[issue.dateStr];
    if (!shiftId) continue;
    const key = `${issue.residentId}|${issue.dateStr}`;
    let cell = byCell.get(key);
    if (!cell) {
      cell = { residentId: issue.residentId, name: issue.name || null, dateStr: issue.dateStr, shiftId, messages: [] };
      byCell.set(key, cell);
    }
    cell.messages.push(issue.message);
  }
  const fixable = [];
  const locked = [];
  for (const cell of byCell.values()) {
    (lockedCells?.[cell.residentId]?.[cell.dateStr] ? locked : fixable).push(cell);
  }
  return { fixable, locked };
}

// Which of violatingCells' {fixable, locked} split will actually SURVIVE a specific pending
// generate action untouched — mirrors runGenerate/runPartialRegenerate's own kept-cell semantics
// (ResidentScheduler.jsx) so a readiness warning built from this can never disagree with what the
// action is about to do:
//   'fill'     — plain "Generate Schedule" (clearFirst:false) clears nothing at all, so every
//                violator (locked or not) is still there afterward.
//   'clear'    — "Clear & Regenerate" wipes the whole schedule first, so nothing survives.
//   'unlocked' — "Regenerate Unlocked" clears every unlocked cell itself, so a fixable violator
//                gets cleared+refilled by the action; only locked ones survive.
//   'range'    — "Regenerate Range" clears unlocked cells only inside [rangeStart,rangeEnd], so a
//                fixable violator OUTSIDE that window survives right alongside every locked one.
export function keptCellsForMode({ fixable, locked }, mode, rangeStart, rangeEnd) {
  if (mode === 'fill') return { fixable, locked };
  if (mode === 'unlocked') return { fixable: [], locked };
  if (mode === 'range') return { fixable: fixable.filter(c => c.dateStr < rangeStart || c.dateStr > rangeEnd), locked };
  // 'clear' and any unrecognized mode: treat as "nothing survives" rather than over-warning.
  return { fixable: [], locked: [] };
}
