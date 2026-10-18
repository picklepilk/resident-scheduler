// Pure helpers for the Dashboard coverage heatmap: per-day open-slot score, block summary, and
// short chip labels. Data comes from computeCoverageByDate's `{perShift:{[id]:{count,min,max}}}`.

// Open slots for one day = sum over shifts of max(0, min - count).
export function dayOpenSlots(cov) {
  if (!cov || !cov.perShift) return 0;
  let open = 0;
  for (const info of Object.values(cov.perShift)) {
    const count = (info && info.count) || 0;
    if (info && info.min > count) open += info.min - count;
  }
  return open;
}

// Day with requirements but nothing assigned yet (matches coverageDayStatus 'gray').
export function dayIsUngenerated(cov) {
  return !!cov && cov.filled === 0 && cov.minTotal > 0;
}

// { totalOpen, daysWithOpen, worst: { ds, open } | null, notGenerated }. notGenerated = no day has
// any assignment while some day has requirements. Ties for worst go to the earliest date.
export function summarizeBlockCoverage(dates, coverageByDate) {
  let totalOpen = 0, daysWithOpen = 0, worst = null, anyFilled = false, anyReq = false;
  for (const ds of dates || []) {
    const c = coverageByDate?.[ds];
    if (c && c.filled > 0) anyFilled = true;
    if (c && c.minTotal > 0) anyReq = true;
    const open = dayOpenSlots(c);
    if (open <= 0) continue;
    totalOpen += open;
    daysWithOpen += 1;
    if (!worst || open > worst.open) worst = { ds, open };
  }
  return { totalOpen, daysWithOpen, worst, notGenerated: anyReq && !anyFilled };
}

// Short chip label from the catalog entry (area + its own `short`) — never parsed from the id.
export function shiftChipLabel(shift) {
  if (!shift) return '';
  return shift.area && shift.short ? `${shift.area} ${shift.short}` : (shift.label || shift.id || '');
}
