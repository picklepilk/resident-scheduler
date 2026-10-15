// src/lib/coverageBoard.js
// Pure row/colour model for the Coverage tab's heatmap sub-view (docs/superpowers/plans/
// 2026-10-15-coverage-board.md, build step 4). Deliberately computes NOTHING about coverage
// counts itself -- every {count,min,max} triple handled here is exactly what
// computeCoverageByDate/getActiveCoverageShifts (ResidentScheduler.jsx) already produced, so the
// heatmap can never disagree with the schedule grid's own coverage footer (CLAUDE.md: "never fork
// coverage math").
import { SHIFT_AREAS } from './shifts.js';

// Reading order within an area's heatmap rows: day, swing (PED-S's 11:00-20:00 sits inside the
// day/eve overlap), eve, night, matching how the rest of the app lists shift types (SHIFT_TYPES).
const TYPE_ORDER = { day: 0, swing: 1, eve: 2, night: 3 };

// Four-state read the plan calls for (below min / at min / between min-max / over max), plus a
// fifth "nothing to show" bucket (no requirement AND nothing assigned) so an inactive cell doesn't
// paint as a false "below min" -- same "gray" idea as ResidentScheduler.jsx's own shiftCellStatus,
// just split one notch finer since the heatmap needs to distinguish "exactly at the floor" (no
// slack) from "comfortably within range" at a glance.
export function coverageCellStatus({ count, min, max }) {
  const c = count ?? 0, mn = min ?? 0, mx = max ?? 0;
  if (c === 0 && mn === 0) return 'empty';
  if (c < mn) return 'below';
  if (c === mn) return 'atMin';
  if (c > mx) return 'over';
  return 'between';
}

// Groups an already-computed active-shift list (SHIFTS filtered by the existing
// getActiveCoverageShifts -- "has a coverage requirement or an assignment somewhere in this
// block") into heatmap rows: one sub-group per SHIFT_AREAS entry (POD/PED/FLEX/MT/TRAUMA), shifts
// within an area ordered day -> swing -> eve -> night, 12h shift ids (POD-D12 etc.) sorting
// alongside their 9h same-type sibling since TYPE_ORDER keys off `type`, not the id's hour suffix.
// An area with no active shift this block is omitted entirely (no empty header row).
export function buildHeatmapRows(activeShifts) {
  return SHIFT_AREAS
    .map(area => ({
      area,
      shifts: (activeShifts || [])
        .filter(s => s.area === area)
        .sort((a, b) => (TYPE_ORDER[a.type] ?? 9) - (TYPE_ORDER[b.type] ?? 9)),
    }))
    .filter(g => g.shifts.length > 0);
}

// One heatmap cell's data for (dateStr, shiftId), or null when the shift structurally doesn't run
// that date -- computeCoverageByDate's perShift map already omits it then (shiftCoverageForDate's
// SHIFT_DOW guard), so this never re-derives shiftActiveOnDow itself; a null here IS "blank cell".
export function heatmapCell(coverageByDate, dateStr, shiftId) {
  const info = coverageByDate?.[dateStr]?.perShift?.[shiftId];
  if (!info) return null;
  const { count, min, max } = info;
  return { count, min, max, status: coverageCellStatus(info) };
}
