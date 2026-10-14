import { describe, it, expect } from 'vitest';
import { diffState } from './stateDiff.js';

function roster(ids) {
  return ids.map(id => ({ id, firstName: id, lastName: 'Test' }));
}

function block(overrides = {}) {
  return { id: 'b1', name: 'Block 1', startDate: '2026-01-01', endDate: '2026-01-28', schedule: {}, ...overrides };
}

describe('diffState', () => {
  it('reports no changes for two identical documents', () => {
    const doc = { res_em_roster: roster(['r1', 'r2']), res_current_block: block(), res_blocks_history: [] };
    const diff = diffState(doc, doc);
    expect(diff).toEqual({ blocksChanged: 0, residentsAdded: 0, residentsRemoved: 0, scheduleCellsChanged: 0 });
  });

  it('counts residents added and removed by id, independent of order', () => {
    const oldDoc = { res_em_roster: roster(['r1', 'r2', 'r3']) };
    const newDoc = { res_em_roster: roster(['r3', 'r2', 'r4', 'r5']) };
    const diff = diffState(oldDoc, newDoc);
    expect(diff.residentsAdded).toBe(2); // r4, r5
    expect(diff.residentsRemoved).toBe(1); // r1
  });

  it('counts schedule cells added, removed, and swapped', () => {
    const oldDoc = { res_current_block: block({ schedule: { r1: { '2026-01-01': 'POD-D' }, r2: { '2026-01-02': 'MT-N' } } }) };
    const newDoc = { res_current_block: block({ schedule: { r1: { '2026-01-01': 'POD-N' }, r2: {} } }) };
    // r1/2026-01-01: POD-D -> POD-N (1 changed). r2/2026-01-02: MT-N -> absent (1 changed).
    const diff = diffState(oldDoc, newDoc);
    expect(diff.scheduleCellsChanged).toBe(2);
    expect(diff.blocksChanged).toBe(1);
  });

  it('does not count a cell as changed when both sides agree it is unassigned', () => {
    const oldDoc = { res_current_block: block({ schedule: { r1: {} } }) };
    const newDoc = { res_current_block: block({ schedule: {} } ) };
    const diff = diffState(oldDoc, newDoc);
    expect(diff.scheduleCellsChanged).toBe(0);
    expect(diff.blocksChanged).toBe(0);
  });

  it('counts a block as changed when a non-schedule field differs, even with an identical schedule', () => {
    const oldDoc = { res_current_block: block({ name: 'Block 1' }) };
    const newDoc = { res_current_block: block({ name: 'Block 1 (renamed)' }) };
    const diff = diffState(oldDoc, newDoc);
    expect(diff.blocksChanged).toBe(1);
    expect(diff.scheduleCellsChanged).toBe(0);
  });

  it('counts a block present on only one side as changed (added or removed)', () => {
    const oldDoc = { res_current_block: block({ id: 'b1' }), res_blocks_history: [] };
    const newDoc = { res_current_block: block({ id: 'b1' }), res_blocks_history: [block({ id: 'b2' })] };
    const diff = diffState(oldDoc, newDoc);
    expect(diff.blocksChanged).toBe(1); // only b2 differs
  });

  it('matches res_current_block against res_blocks_history by id (a block saved to history then edited live)', () => {
    const oldDoc = { res_blocks_history: [block({ id: 'b1', schedule: { r1: { '2026-01-01': 'POD-D' } } })] };
    const newDoc = { res_current_block: block({ id: 'b1', schedule: { r1: { '2026-01-01': 'POD-N' } } }) };
    const diff = diffState(oldDoc, newDoc);
    expect(diff.blocksChanged).toBe(1);
    expect(diff.scheduleCellsChanged).toBe(1);
  });

  it('tolerates missing/malformed documents instead of throwing', () => {
    expect(diffState(null, undefined)).toEqual({ blocksChanged: 0, residentsAdded: 0, residentsRemoved: 0, scheduleCellsChanged: 0 });
    expect(diffState({}, {})).toEqual({ blocksChanged: 0, residentsAdded: 0, residentsRemoved: 0, scheduleCellsChanged: 0 });
    expect(diffState({ res_em_roster: 'not an array' }, { res_em_roster: [{ id: 'r1' }] }).residentsAdded).toBe(1);
  });

  it('ignores roster entries with no id', () => {
    const oldDoc = { res_em_roster: [{ firstName: 'No', lastName: 'Id' }] };
    const newDoc = { res_em_roster: [{ firstName: 'No', lastName: 'Id' }, { id: 'r1' }] };
    const diff = diffState(oldDoc, newDoc);
    expect(diff.residentsAdded).toBe(1);
    expect(diff.residentsRemoved).toBe(0);
  });

  it('key order never produces a false-positive block change', () => {
    const oldDoc = { res_current_block: { id: 'b1', name: 'X', startDate: '2026-01-01', schedule: {} } };
    const newDoc = { res_current_block: { schedule: {}, startDate: '2026-01-01', name: 'X', id: 'b1' } };
    const diff = diffState(oldDoc, newDoc);
    expect(diff.blocksChanged).toBe(0);
  });
});
