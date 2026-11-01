import { describe, it, expect } from 'vitest';
import { computeStructuralFloor, splitFairnessPoints, describeCapacityGap } from './structuralFloor.js';

describe('structuralFloor', () => {
  it('computes excess and single-area points (weight 2 each)', () => {
    const f = computeStructuralFloor({ supply: 4, residents: [{ target: 4, areas: ['POD'] }, { target: 2, areas: ['POD', 'FLEX'] }] });
    expect(f).toMatchObject({ demand: 6, targetExcess: 2, underTargetPoints: 4, singleAreaResidents: 1, areaSpreadUnits: 2, areaSpreadPoints: 4, totalPoints: 8, approximate: true });
  });
  it('splits without double counting and caps at total', () => {
    const f = { totalPoints: 8 };
    expect(splitFairnessPoints(20, f)).toEqual({ total: 20, structural: 8, movable: 12 });
    expect(splitFairnessPoints(5, f)).toEqual({ total: 5, structural: 5, movable: 0 });
    expect(splitFairnessPoints(undefined, f)).toBeNull();
    expect(splitFairnessPoints(5, null)).toBeNull();
  });
  it('describes the gap only when demand exceeds supply', () => {
    expect(describeCapacityGap({ demand: 5, supply: 5 })).toBeNull();
    expect(describeCapacityGap({ demand: 9, supply: 5 })).toMatch(/exceed available shifts by 4/);
  });
});
