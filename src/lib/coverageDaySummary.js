// Pure helpers for the Dashboard coverage heatmap: per-day open-slot score, block summary, and
// short chip labels. Data comes from computeCoverageByDate's `{perShift:{[id]:{count,min,max}}}`.

// Open slots for one day = sum over shifts of max(0, min - count).
export function dayOpenSlots(cov) {
  if (!cov || !cov.perShift) return 0;
  let open = 0;
  for (const info of Object.values(cov.perShift)) {
    if (info && info.min > count0(info)) open += info.min - count0(info);
  }
  return open;
}
function count0(info) { return info.count || 0; }

// { totalOpen, daysWithOpen, worst: { ds, open } | null }. Ties for worst go to the earliest date.
export function summarizeBlockCoverage(dates, coverageByDate) {
  let totalOpen = 0, daysWithOpen = 0, worst = null;
  for (const ds of dates || []) {
    const open = dayOpenSlots(coverageByDate?.[ds]);
    if (open <= 0) continue;
    totalOpen += open;
    daysWithOpen += 1;
    if (!worst || open > worst.open) worst = { ds, open };
  }
  return { totalOpen, daysWithOpen, worst };
}

// Short chip label from the catalog entry (area + its own `short`) — never parsed from the id.
export function shiftChipLabel(shift) {
  if (!shift) return '';
  return shift.area && shift.short ? `${shift.area} ${shift.short}` : (shift.label || shift.id || '');
}
