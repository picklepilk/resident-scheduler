import { describe, it, expect } from 'vitest';
import { stepsFor, trackOptimizeProgress, describeOptimizeProgress, agoText } from './optimizeProgress.js';

describe('optimizeProgress', () => {
  it('step lists follow the stage count', () => {
    expect(stepsFor(6).map(s => s.key)).toEqual(['errors', 'blocking', 'rank', 'rest', 'quality', 'polish']);
    expect(stepsFor(5)).toHaveLength(5);
    expect(stepsFor(1)[0].key).toBe('single');
  });

  it('counts improvements within a stage and keeps the total across stages', () => {
    let t = trackOptimizeProgress(null, { stage: 1, stages: 6, best: null, elapsed: 0, budget: 300 }, 0);
    expect(t.improvements).toBe(0);
    t = trackOptimizeProgress(t, { stage: 1, stages: 6, best: 50, elapsed: 2, budget: 300 }, 2000);
    t = trackOptimizeProgress(t, { stage: 1, stages: 6, best: 40, elapsed: 4, budget: 300 }, 4000);
    t = trackOptimizeProgress(t, { stage: 1, stages: 6, best: 40, elapsed: 6, budget: 300 }, 6000);
    expect(t.improvements).toBe(2);
    expect(t.lastImprovedAt).toBe(4000);
    // new stage: best resets (stage-local), total carries
    t = trackOptimizeProgress(t, { stage: 2, stages: 6, best: 900, elapsed: 8, budget: 300 }, 8000);
    expect(t.stage).toBe(2);
    expect(t.stageImprovements).toBe(1);
    expect(t.improvements).toBe(3);
    expect(t.best).toBe(900);
  });

  it('ignores a missing progress object', () => {
    expect(trackOptimizeProgress(null, null, 0)).toBeNull();
    const t = { stage: 1 };
    expect(trackOptimizeProgress(t, undefined, 0)).toBe(t);
  });

  it('marks steps done/current/pending', () => {
    const d = describeOptimizeProgress({ stage: 3, stages: 6, elapsed: 60, budget: 300 }, 'running');
    expect(d.steps.map(s => s.state)).toEqual(['done', 'done', 'current', 'pending', 'pending', 'pending']);
    expect(d.stepText).toBe('Step 3 of 6: Rule priority');
    expect(d.pct).toBe(20);
  });

  it('done marks every step done and flags an early finish', () => {
    const d = describeOptimizeProgress({ stage: 6, stages: 6, elapsed: 40, budget: 300 }, 'done');
    expect(d.steps.every(s => s.state === 'done')).toBe(true);
    expect(d.finishedEarly).toBe(true);
    expect(d.stepText).toBe('Finished');
  });

  it('before any progress shows Starting / Waiting', () => {
    expect(describeOptimizeProgress(null, 'running', { elapsedFallback: 3, budgetFallback: 300 }).stepText).toBe('Starting');
    expect(describeOptimizeProgress(null, 'queued').stepText).toBe('Waiting for the machine');
  });

  it('agoText', () => {
    expect(agoText(null, 0)).toBeNull();
    expect(agoText(0, 12_000)).toBe('12 s ago');
    expect(agoText(0, 125_000)).toBe('2 min ago');
  });
});
