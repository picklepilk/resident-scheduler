import { describe, it, expect } from 'vitest';
import {
  solverBudgetSeconds, solverTimeoutMs, buildEngineComparison, qualityVectorLabels, backendFor, backendLabel,
  DEFAULT_SOLVE_MAX_TIME_SECONDS, DEEP_SOLVE_MAX_TIME_SECONDS,
} from './solverBudget.js';

describe('solverBudgetSeconds', () => {
  it('keeps the constant values', () => {
    expect(DEFAULT_SOLVE_MAX_TIME_SECONDS).toBe(120);
    expect(DEEP_SOLVE_MAX_TIME_SECONDS).toBe(300);
  });
  it('deep always 300', () => {
    for (const usingLocal of [true, false]) for (const jobsMode of ['durable', 'memory'])
      expect(solverBudgetSeconds({ usingLocal, jobsMode, deep: true })).toBe(300);
  });
  it('local or durable (Modal) gets 300, Fly gets 120', () => {
    expect(solverBudgetSeconds({ usingLocal: true, jobsMode: 'memory', deep: false })).toBe(300);
    expect(solverBudgetSeconds({ usingLocal: false, jobsMode: 'durable', deep: false })).toBe(300);
    expect(solverBudgetSeconds({ usingLocal: false, jobsMode: 'memory', deep: false })).toBe(120);
    expect(solverBudgetSeconds({ usingLocal: false, jobsMode: undefined })).toBe(120);
  });
  it('timeout is budget + 60 s', () => {
    expect(solverTimeoutMs(120)).toBe(180000);
    expect(solverTimeoutMs(300)).toBe(360000);
  });
});

describe('backend labels', () => {
  it('maps', () => {
    expect(backendFor({ usingLocal: true, jobsMode: 'durable' })).toBe('local');
    expect(backendFor({ usingLocal: false, jobsMode: 'durable' })).toBe('modal');
    expect(backendFor({ usingLocal: false, jobsMode: 'memory' })).toBe('fly');
    expect(backendFor({ usingLocal: false, jobsMode: null })).toBe('cloud');
    expect(backendLabel('cloud')).toBe('Cloud');
    expect(backendLabel('modal')).toBe('Cloud (Modal)');
    expect(backendLabel('fly')).toBe('Cloud (Fly)');
    expect(backendLabel('local')).toBe('This computer');
  });
});

describe('buildEngineComparison', () => {
  const sc = (e, w, v) => ({ errorCount: e, blockingWarnCount: w, qualityVector: v });
  const ctx = { target: 'cloud', backend: 'fly', budgetSeconds: 120, wallSeconds: 47.26, solverStatus: 'FEASIBLE' };
  it('solver win', () => {
    const c = buildEngineComparison({ ...ctx, pick: { winner: 'cpsat', solver: sc(0, 0, [0, 0, 0, 5]), local: sc(1, 0, [1, 0, 0, 9]) } });
    expect(c.winner).toBe('solver');
    expect(c.wallSeconds).toBe(47.3);
  });
  it('local win and tie', () => {
    expect(buildEngineComparison({ ...ctx, pick: { winner: 'local', solver: sc(2, 0, [3, 0, 0, 9]), local: sc(1, 0, [1, 0, 0, 9]) } }).winner).toBe('local');
    expect(buildEngineComparison({ ...ctx, pick: { winner: 'local', solver: sc(1, 0, [1, 0, 0, 9]), local: sc(1, 0, [1, 0, 0, 9]) } }).winner).toBe('tie');
  });
  it('solver null stays local, plain JSON', () => {
    const c = buildEngineComparison({ ...ctx, solverStatus: null, pick: { winner: 'local', solver: null, local: sc(1, 0, [1, 0, 0, 9]) } });
    expect(c.solver).toBeNull();
    expect(c.winner).toBe('local');
    expect(JSON.parse(JSON.stringify(c))).toEqual(c);
  });
});

describe('qualityVectorLabels', () => {
  it('follows rule priority order', () => {
    expect(qualityVectorLabels(['coverageMin', 'seniorComposition', 'postNightRest']))
      .toEqual(['Coverage misses', 'Senior gaps', 'Rest compromises', 'Fairness + shape']);
    expect(qualityVectorLabels(['postNightRest', 'coverageMin', 'seniorComposition'])[0]).toBe('Rest compromises');
  });
});
