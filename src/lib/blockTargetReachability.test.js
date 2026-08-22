// src/lib/blockTargetReachability.test.js
//
// Regression guard for a class of bug found via live chief-benchmark verification: EM/EMS and
// EM/TOX PGY-2 (DEFAULT_DAY_RULES.EM_HOME_2's em_ems_window/em_tox_window shiftGates) were
// hard-gated to 2 weekdays/week (overrideImmune, outsideAction:'blockEntireDay') but had no
// BLOCK_TARGETS entry, so getShiftTarget fell back to the flat SHIFT_TARGETS.EM_HOME_2 (19) — a
// target that is mathematically impossible to reach given the gate's own weekday restriction, and
// produced 2 permanent export-blocking "Under target" hard errors on every generated block. Fixed
// by adding EM_HOME_2__EM_EMS/EM_HOME_2__EM_TOX entries to BLOCK_TARGETS (see that map's own
// comment for the full derivation).
//
// This test asserts the general invariant so a future shiftGate change can't silently reintroduce
// the same impossibility for any EM Home rotation: whenever a category+PGY's default day rules
// hard-confine a blockType to a fixed set of weekdays (a shiftGate with `allowedDays` and
// `outsideAction: 'blockEntireDay'` — i.e. the WHOLE day is blocked outside those weekdays, not
// just some shift ids), that rotation's effective shift target must not exceed the number of
// times those weekdays can occur in a 28-day block.
//
// The weekday count is derived programmatically, not hardcoded per rotation: a 28-day block is
// EXACTLY 4 calendar weeks (28 = 4*7), so every weekday-of-week occurs exactly 4 times regardless
// of which date the block starts on — no calendar/date-math or specific start date is needed.
import { describe, it, expect } from 'vitest';
import { DEFAULT_DAY_RULES, EM_HOME_BLOCK_TYPES_BY_PGY, getShiftTarget } from '../ResidentScheduler.jsx';

const WEEKDAY_OCCURRENCES_PER_28_DAY_BLOCK = 4; // 28 / 7, exact — true for any block start date

function blockTypesForGate(gate, allBlockTypesForPgy) {
  const filter = gate.blockTypeFilter;
  if (!filter) return allBlockTypesForPgy; // no filter = gate applies to every blockType at this PGY
  if (filter.mode === 'only') return filter.ids || [];
  // 'except' — every blockType at this PGY not named in ids (ref:'TRAUMA_BLOCKS' never pairs with
  // allowedDays/blockEntireDay in the current rule set, so it's intentionally not resolved here).
  const excluded = new Set(filter.ids || []);
  return allBlockTypesForPgy.filter(bt => !excluded.has(bt));
}

describe('EM Home block targets stay reachable under blockEntireDay weekday gates', () => {
  for (const [key, rules] of Object.entries(DEFAULT_DAY_RULES)) {
    const m = /^EM_HOME_(\d)$/.exec(key);
    if (!m) continue; // only EM Home categories carry BLOCK_TARGETS rotation-specific overrides
    const pgy = Number(m[1]);
    const allBlockTypesForPgy = EM_HOME_BLOCK_TYPES_BY_PGY[pgy] || [];

    for (const gate of rules.shiftGates || []) {
      // Only a gate that blocks the ENTIRE day outside its allowedDays can make a flat target
      // unreachable — a gate that merely strips a subset of shift ids (outsideAction:
      // 'stripShiftIds') still leaves other shifts workable on the excluded weekdays.
      if (!gate.allowedDays || gate.outsideAction !== 'blockEntireDay') continue;

      const maxWorkableDays = gate.allowedDays.length * WEEKDAY_OCCURRENCES_PER_28_DAY_BLOCK;
      const blockTypes = blockTypesForGate(gate, allBlockTypesForPgy);

      for (const blockType of blockTypes) {
        it(`${key} on blockType ${blockType} (gate '${gate.id}'): target <= ${maxWorkableDays} workable days`, () => {
          const target = getShiftTarget({ category: 'EM_HOME', pgy, blockType }, {});
          // null = self-cover / no target at all, which is trivially reachable (never a violation).
          if (target == null) return;
          expect(target).toBeLessThanOrEqual(maxWorkableDays);
        });
      }
    }
  }
});
