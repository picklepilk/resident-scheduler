// src/lib/clearSchedule.js
// Pure "clear a block's schedule WITHOUT regenerating" helper, shared by the Dashboard Current
// Block card and the ScheduleGrid toolbar via ClearScheduleConfirm (one code path, no drift).
//
// Shapes (all untrusted):
//   block.schedule     = { [residentId]: { [dateStr]: shiftId } }
//   block.lockedCells  = { [residentId]: { [dateStr]: true } }
//   block.handOverrides= { [residentId]: { [dateStr]: {shiftId, ruleIds, ...} } }
//   block.issueAcks    = { [ackKey]: {...} }, ackKey = 'rule|resId|dateStr|anchor|shift|msg'
//
// Modes:
//   all       everything: schedule, locks, overrides, acks, generation metadata.
//   unlocked  every cell not locked; locks kept.
//   range     unlocked cells with start <= date <= end only (inclusive, YYYY-MM-DD).
// Partial modes null generationReport/lastGenerated/generatedWithGaps: they describe a whole
// generated schedule that no longer exists, so keeping them would show stale stats / bogus
// "since generate" diffs. issueAcks: unlocked resets all (acks are keyed to exact issues that
// are re-derived); range drops acks whose dateStr falls in the range or is blank (aggregate).
// Hand overrides are pruned to cells that still hold the recorded shift (syncHandOverrides
// would also do this in a tracked update; done here so the helper is self-contained).
const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);

export const CLEAR_MODES = ['all', 'unlocked', 'range'];

function inRange(ds, start, end) {
  return typeof ds === 'string' && ds >= start && ds <= end;
}

export function clearScheduleFields(block, { mode = 'all', start, end } = {}) {
  const b = isObj(block) ? block : {};
  const schedule = isObj(b.schedule) ? b.schedule : {};
  const locked = isObj(b.lockedCells) ? b.lockedCells : {};
  const overrides = isObj(b.handOverrides) ? b.handOverrides : {};
  const m = CLEAR_MODES.includes(mode) ? mode : 'all';

  if (m === 'range' && !(typeof start === 'string' && typeof end === 'string' && start && end && start <= end)) {
    return { block: b, cleared: 0, error: 'Invalid date range' };
  }

  let cleared = 0;
  const countAll = () => {
    for (const cells of Object.values(schedule)) if (isObj(cells)) cleared += Object.keys(cells).filter(ds => cells[ds]).length;
  };

  if (m === 'all') {
    countAll();
    return {
      cleared,
      block: { ...b, schedule: {}, lockedCells: {}, handOverrides: {}, generationReport: null, lastGenerated: null, generatedWithGaps: null, issueAcks: {} },
    };
  }

  const nextSchedule = {};
  for (const [rid, cells] of Object.entries(schedule)) {
    if (!isObj(cells)) continue;
    const keep = {};
    for (const [ds, sid] of Object.entries(cells)) {
      const isLocked = !!(isObj(locked[rid]) && locked[rid][ds]);
      const target = m === 'range' ? inRange(ds, start, end) : true;
      if (!isLocked && target) { if (sid) cleared++; } else keep[ds] = sid;
    }
    if (Object.keys(keep).length) nextSchedule[rid] = keep;
  }

  const nextOverrides = {};
  for (const [rid, byDate] of Object.entries(overrides)) {
    if (!isObj(byDate)) continue;
    const keep = {};
    for (const [ds, e] of Object.entries(byDate)) {
      if (isObj(e) && nextSchedule[rid]?.[ds] === e.shiftId) keep[ds] = e;
    }
    if (Object.keys(keep).length) nextOverrides[rid] = keep;
  }

  let nextAcks = {};
  if (m === 'range' && isObj(b.issueAcks)) {
    for (const [k, v] of Object.entries(b.issueAcks)) {
      const ds = k.split('|')[2];
      if (ds && !inRange(ds, start, end)) nextAcks[k] = v;
    }
  }

  return {
    cleared,
    block: { ...b, schedule: nextSchedule, handOverrides: nextOverrides, generationReport: null, lastGenerated: null, generatedWithGaps: null, issueAcks: nextAcks },
  };
}
