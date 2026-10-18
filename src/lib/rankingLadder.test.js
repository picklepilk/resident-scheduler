import { describe, it, expect } from 'vitest';
import { countBlockingWarns } from '../ResidentScheduler.jsx';
import { computeQualityVector, betterQuality } from './scheduleQuality.js';
import { restRankedBelowCoverage } from './rulePriorityRanking.js';
import { OVERRIDE_TIER_RULE_IDS } from './rulePolicy.js';

const REST = { rule: 'postNightRest', level: 'warn' };
const base = { seniorGaps: 0, underTargetTotal: 0, deficitSpread: 0, nightSpread: 0, weekendSpread: 0,
  holidaySpread: 0, nightShapePenalty: 0, workShapePenalty: 0, traumaRunPenalty: 0, secondRestDayPenalty: 0 };
const covFirst = ['coverageMin', 'seniorComposition', 'postNightRest'];
const restFirst = ['postNightRest', 'coverageMin', 'seniorComposition'];

// Mirror scoreGenerationResult: warn count from issues, vector from metrics.
function score(holes, restWarns, pri) {
  const issues = Array.from({ length: restWarns }, () => REST);
  return {
    errorCount: 0,
    blockingWarnCount: countBlockingWarns(issues, pri),
    qualityVector: computeQualityVector({ ...base, coverageMiss: holes, restCompromises: restWarns }, pri),
  };
}

describe('ranking follows Soft Rule Priority', () => {
  it('countBlockingWarns drops postNightRest only when coverage outranks rest', () => {
    const issues = [REST, REST, { rule: 'x', level: 'warn', conferenceTolerated: true }];
    expect(countBlockingWarns(issues, covFirst)).toBe(1);
    expect(countBlockingWarns(issues, restFirst)).toBe(3);
    expect(restRankedBelowCoverage(restFirst)).toBe(false);
  });
  it('1 hole + 3 rest warns beats 5 holes + 0 under default; reverse when rest ranks first', () => {
    expect(betterQuality(score(1, 3, covFirst), score(5, 0, covFirst))).toBe(true);
    expect(betterQuality(score(5, 0, covFirst), score(1, 3, covFirst))).toBe(false);
    expect(betterQuality(score(5, 0, restFirst), score(1, 3, restFirst))).toBe(true);
    expect(betterQuality(score(1, 3, restFirst), score(5, 0, restFirst))).toBe(false);
  });
});

// Senior composition mirrors rest: warn count from issues, vector slot from the same issue list.
const COMP = { rule: 'podPgy3Composition', level: 'warn' };
const compFirst = ['seniorComposition', 'coverageMin', 'postNightRest'];
function scoreComp(holes, compWarns, pri) {
  const issues = Array.from({ length: compWarns }, () => COMP);
  return {
    errorCount: 0,
    blockingWarnCount: countBlockingWarns(issues, pri),
    qualityVector: computeQualityVector({ ...base, coverageMiss: holes, seniorGaps: compWarns, restCompromises: 0 }, pri),
  };
}

describe('senior composition follows Soft Rule Priority', () => {
  it('countBlockingWarns drops composition issues only when coverage outranks seniorComposition', () => {
    const issues = [COMP, { rule: 'flexSeniorComposition', level: 'warn' }, { rule: 'nightsTotalBlock', level: 'warn' }];
    expect(countBlockingWarns(issues, covFirst)).toBe(1); // nightsTotalBlock has no Rules-tab entry
    expect(countBlockingWarns(issues, compFirst)).toBe(3);
  });
  it('1 hole + 1 composition warn beats 3 holes under default; reverse when composition ranks first', () => {
    expect(betterQuality(scoreComp(1, 1, covFirst), scoreComp(3, 0, covFirst))).toBe(true);
    expect(betterQuality(scoreComp(3, 0, covFirst), scoreComp(1, 1, covFirst))).toBe(false);
    expect(betterQuality(scoreComp(3, 0, compFirst), scoreComp(1, 1, compFirst))).toBe(true);
    expect(betterQuality(scoreComp(1, 1, compFirst), scoreComp(3, 0, compFirst))).toBe(false);
  });
  it('composition warnings still block export (gate unchanged)', () => {
    expect(OVERRIDE_TIER_RULE_IDS).toEqual(expect.arrayContaining(['podPgy3Composition', 'flexSeniorComposition']));
  });
});

