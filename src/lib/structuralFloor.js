// Structural (unavoidable) part of the fairness+shape score. Pure; the big file may not be
// imported here. A LOWER BOUND ("at least"), never an addition: underTargetTotal and areaSpread
// are already inside quality-vector slot 3 (FAIRNESS_AXIS_WEIGHTS 2 each), so this only splits
// slot 3 into structural vs movable.
import { FAIRNESS_AXIS_WEIGHTS, AREA_CONCENTRATION_FLOOR } from './scheduleQuality.js';

// residents: [{ target, areas: string[] }] (areas = distinct shift areas the resident can ever
// work this block). Mirrors solver-service/solver/report/structural.py.
export function computeStructuralFloor({ supply = 0, residents = [] } = {}) {
  let demand = 0, singleAreaResidents = 0, areaSpreadUnits = 0;
  for (const r of residents) {
    if (!r || !(r.target > 0)) continue;
    demand += r.target;
    if (Array.isArray(r.areas) && new Set(r.areas).size === 1) {
      singleAreaResidents++;
      areaSpreadUnits += Math.max(0, r.target - Math.ceil(r.target * AREA_CONCENTRATION_FLOOR));
    }
  }
  const targetExcess = Math.max(0, demand - supply);
  const underTargetPoints = targetExcess * FAIRNESS_AXIS_WEIGHTS.underTargetTotal;
  const areaSpreadPoints = areaSpreadUnits * FAIRNESS_AXIS_WEIGHTS.areaSpread;
  return {
    supply, demand, targetExcess, underTargetPoints, singleAreaResidents,
    areaSpreadUnits, areaSpreadPoints, totalPoints: underTargetPoints + areaSpreadPoints, approximate: true,
  };
}

// Split slot-3 total into { total, structural, movable }; structural capped at total so a loose
// bound never shows negative movable. null when inputs are unusable.
export function splitFairnessPoints(total, floor) {
  if (typeof total !== 'number' || !Number.isFinite(total) || !floor || !Number.isFinite(floor.totalPoints)) return null;
  const structural = Math.min(Math.max(0, floor.totalPoints), Math.max(0, total));
  return { total, structural, movable: Math.max(0, total - structural) };
}

// Plain-language capacity gap, or null when targets fit.
export function describeCapacityGap({ demand, supply } = {}) {
  if (!(demand > supply)) return null;
  return `Structurally impossible: targets total ${demand} but schedule can hold at most ${supply} resident-shifts (targets exceed available shifts by ${demand - supply}) — raise coverage maxes or lower targets.`;
}
