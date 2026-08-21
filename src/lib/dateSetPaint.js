// Pure helpers behind TimeOffModal's calendar-paint interaction (ResidentScheduler.jsx) — factored
// out so the click/drag commit logic is unit-testable without mounting the component, same
// reasoning as calendarGrid.js's month-grid math. Both functions operate on a sorted, deduped
// ISO-date-string array — the shape `approvedDatesOff`/`vacationDates`/`jeopardyDates` already use
// (see DateListEditor's own Add/remove, which this matches: sorted, no duplicates).

// Toggles a single date: removes it if present, adds it (re-sorted) if absent. Used for a plain
// click (a drag whose start and end are the same day collapses to this exact case too — see
// applyDateRangePaint below, which callers use uniformly for both).
export function toggleDateInList(dates, ds) {
  const list = dates || [];
  return list.includes(ds) ? list.filter(d => d !== ds) : [...list, ds].sort();
}

// Whether painting `ds` should ADD or REMOVE it, decided from the date the drag STARTED on — so a
// drag is never ambiguous (mirrors the schedule grid's own lock-paint gesture: the target value is
// captured once, on mousedown, and never re-evaluated per cell crossed).
export function paintActionFor(dates, ds) {
  return (dates || []).includes(ds) ? 'remove' : 'add';
}

// Applies one whole drag-paint commit in a single pass: every date in the inclusive range spanning
// dsA/dsB (order-independent — a drag can move in either direction from its anchor) is added
// (action 'add') or removed (action 'remove') from `dates`. This is the ONE state write a whole
// drag must produce — painting 14 days calls this once, not 14 times. `expand` is the
// inclusive-range expander (ResidentScheduler.jsx's `expandDateRangeInclusive`, itself
// `getBlockDates` from dates.js) — injected rather than imported so this stays a pure function of
// its arguments, with no dependency direction onto the component file.
export function applyDateRangePaint(dates, dsA, dsB, action, expand) {
  const list = dates || [];
  const [start, end] = dsA <= dsB ? [dsA, dsB] : [dsB, dsA];
  const range = new Set(expand(start, end));
  if (action === 'remove') return list.filter(d => !range.has(d));
  return [...new Set([...list, ...range])].sort();
}
