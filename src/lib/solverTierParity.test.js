// src/lib/solverTierParity.test.js
// Cross-language guard: solver-service/solver/model/elastic.py hand-mirrors RULE_POLICY's tiers in
// four tuples (ALWAYS_HARD_* never get a pass-2 relax literal; RELAXABLE_* do). That mirror drifted
// twice (ec74598 duty-hour families, caef526 policy-cap families) — each time pass 2 could silently
// break an acgme/program-tier rule. This test reads the Python source directly (no Python needed)
// and fails if a family's relaxability disagrees with its JS tier, or if a new family appears
// without a decision recorded in FAMILY_TO_RULE below.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RULE_POLICY } from './rulePolicy.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ELASTIC_PY = path.resolve(__dirname, '../../solver-service/solver/model/elastic.py');

// Solver family name -> RULE_POLICY id. null = no RULE_POLICY entry (JS only ever reports it as a
// plain, non-blocking warn), so it must be relaxable. Names per elastic.py's own comments and
// count_caps.py's SPEC_TO_RULE.
const FAMILY_TO_RULE = {
  restGap: 'restShiftLength',
  circadianPair: 'eveToNextDayDay',
  nightRunMax: 'nightRunMax',
  consecutiveWork: 'sixConsecutiveWorkDays',
  postRun6Rest: 'sixDayRunRest',
  hours320: 'rolling80h',
  nightCap: 'nightsTotalBlock',
  nightSegments: 'nightStintCount',
  bamcWedNight: 'bamcWedNight',
  jcCap: 'jcMaxPerAy',
  traumaPedsSplit: 'traumaPedsSplit',
  traumaCap: null,
  pedsMixMax: null,
  targetCeiling: null,
};

function readTuple(src, name) {
  const m = src.match(new RegExp(`^${name} = \\(([\\s\\S]*?)^\\)`, 'm'));
  if (!m) throw new Error(`${name} tuple not found in elastic.py`);
  return [...m[1].matchAll(/"([A-Za-z0-9]+)"/g)].map(x => x[1]);
}

describe('elastic.py relaxable families agree with rulePolicy.js tiers', () => {
  const src = readFileSync(ELASTIC_PY, 'utf-8');
  const alwaysHard = [
    ...readTuple(src, 'ALWAYS_HARD_DUTY_HOUR_FAMILIES'),
    ...readTuple(src, 'ALWAYS_HARD_POLICY_CAP_FAMILIES'),
  ];
  const relaxable = [
    ...readTuple(src, 'RELAXABLE_DUTY_HOUR_FAMILIES'),
    ...readTuple(src, 'RELAXABLE_POLICY_CAP_FAMILIES'),
  ];

  it('every solver family has a recorded JS mapping', () => {
    for (const fam of [...alwaysHard, ...relaxable]) {
      expect(Object.prototype.hasOwnProperty.call(FAMILY_TO_RULE, fam), `${fam} missing from FAMILY_TO_RULE`).toBe(true);
    }
  });

  it('always-hard families map to acgme/program-tier rules', () => {
    for (const fam of alwaysHard) {
      const ruleId = FAMILY_TO_RULE[fam];
      expect(ruleId, `${fam} is always-hard but maps to no RULE_POLICY id`).toBeTruthy();
      expect(['acgme', 'program'], `${fam} -> ${ruleId}`).toContain(RULE_POLICY[ruleId]?.tier);
    }
  });

  it('relaxable families map to override-tier rules or to no RULE_POLICY entry', () => {
    for (const fam of relaxable) {
      const ruleId = FAMILY_TO_RULE[fam];
      if (ruleId === null) continue;
      expect(RULE_POLICY[ruleId], `${fam} -> ${ruleId} not in RULE_POLICY`).toBeTruthy();
      expect(RULE_POLICY[ruleId].tier, `${fam} -> ${ruleId} is relaxable in pass 2`).toBe('override');
    }
  });
});
