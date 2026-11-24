import { describe, it, expect } from 'vitest';
import {
  appendSample, recentGain, describeTrend, shouldAutoStop, bestOfProgress, incumbentToSchedule, countIsolatedNights, countWarnings,
  summarizeLive, liveComparison, shouldRecomputeLive, incumbentKey, isFinalStage,
  AUTO_STOP_MIN_STAGE_SECONDS, AUTO_STOP_WINDOW_SECONDS, AUTO_STOP_MIN_GAIN_PCT, LIVE_RECOMPUTE_MS,
} from './optimizeLive.js';

// progress sample helper: stage 5 = quality, stage 6 = polishing (outerLns)
const P = (elapsed, best, stage = 6, stageName) => ({ stage, stages: 6, elapsed, best, ...(stageName ? { stageName } : {}) });
const series = (...ps) => ps.reduce((s, p) => appendSample(s, p), []);

describe('constants', () => {
  it('match the agreed rule', () => {
    expect(AUTO_STOP_MIN_STAGE_SECONDS).toBe(120);
    expect(AUTO_STOP_WINDOW_SECONDS).toBe(120);
    expect(AUTO_STOP_MIN_GAIN_PCT).toBe(0.3);
    expect(LIVE_RECOMPUTE_MS).toBe(10000);
  });
});

describe('isFinalStage / appendSample', () => {
  it('stageName wins, else stage 6 of 6', () => {
    expect(isFinalStage({ stageName: 'outerLns', stage: 6, stages: 6 })).toBe(true);
    expect(isFinalStage({ stageName: 'tier4_quality', stage: 6, stages: 6 })).toBe(false);
    expect(isFinalStage({ stage: 6, stages: 6 })).toBe(true);
    expect(isFinalStage({ stage: 5, stages: 6 })).toBe(false);
    expect(isFinalStage({ stage: 5, stages: 5 })).toBe(false);
    expect(isFinalStage(null)).toBe(false);
  });
  it('skips progress without elapsed or best, duplicates and a clock that goes backwards', () => {
    let s = appendSample([], { stage: 6, stages: 6 });
    expect(s).toEqual([]);
    s = appendSample(s, P(10, 100));
    s = appendSample(s, P(10, 100));
    s = appendSample(s, P(5, 90));
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ t: 10, stage: 6, final: true, best: 100 });
  });
  it('caps the series length', () => {
    let s = [];
    for (let i = 0; i < 20; i++) s = appendSample(s, P(i, 100 - i), 5);
    expect(s).toHaveLength(5);
    expect(s[0].t).toBe(15);
  });
});

describe('shouldAutoStop', () => {
  // flat: 1000 from t=0..300 in the final stage
  const flat = (from = 0, to = 300, step = 10, best = 1000, stage = 6) => {
    let s = [];
    for (let t = from; t <= to; t += step) s = appendSample(s, P(t, best, stage));
    return s;
  };
  it('stops on a flat final stage that has run long enough', () => {
    expect(shouldAutoStop(flat(), 300)).toBe(true);
  });
  it('does not stop before the final stage has run 120 s', () => {
    expect(shouldAutoStop(flat(0, 100), 100)).toBe(false);
    expect(shouldAutoStop(flat(0, 119), 119)).toBe(false);
    expect(shouldAutoStop(flat(0, 120), 120)).toBe(true);
  });
  it('does not stop while gaining 0.3% or more over the last 120 s; stops just under', () => {
    // best 1000 until t=190, then 996: gain over the window [180,300] = 4 of 996 = 0.40%
    let a = [];
    for (let t = 0; t <= 300; t += 10) a = appendSample(a, P(t, t <= 190 ? 1000 : 996));
    expect(shouldAutoStop(a, 300)).toBe(false);
    // gain 2 of 998 = 0.20% -> stops
    let b = [];
    for (let t = 0; t <= 300; t += 10) b = appendSample(b, P(t, t <= 190 ? 1000 : 998));
    expect(shouldAutoStop(b, 300)).toBe(true);
  });
  it('a stage change restarts the clock and never compares across stages', () => {
    // quality stage (5) flat for 200 s, then polishing starts at t=200
    let s = flat(0, 190, 10, 5000, 5);
    for (let t = 200; t <= 290; t += 10) s = appendSample(s, P(t, 100, 6));
    expect(shouldAutoStop(s, 290)).toBe(false); // polishing only 90 s old, best 5000 -> 100 is not a "gain"
    for (let t = 300; t <= 330; t += 10) s = appendSample(s, P(t, 100, 6));
    expect(shouldAutoStop(s, 330)).toBe(true); // 130 s into polishing, flat
  });
  it('never stops in a non-final stage, however flat', () => {
    expect(shouldAutoStop(flat(0, 900, 10, 1000, 5), 900)).toBe(false);
    expect(shouldAutoStop(flat(0, 900, 10, 1000, 4), 900)).toBe(false);
  });
  it('missing or too-sparse samples never stop', () => {
    expect(shouldAutoStop([], 500)).toBe(false);
    expect(shouldAutoStop(null, 500)).toBe(false);
    expect(shouldAutoStop(flat(0, 300), NaN)).toBe(false);
    // only samples inside the last 120 s: no reference sample at or before now-120
    let s = [];
    for (let t = 250; t <= 300; t += 10) s = appendSample(s, P(t, 1000));
    expect(shouldAutoStop(s, 300)).toBe(false);
  });
  it('a perfect score stops', () => {
    expect(shouldAutoStop(flat(0, 300, 10, 0), 300)).toBe(true);
  });
  it('thresholds are overridable', () => {
    expect(shouldAutoStop(flat(0, 60), 60, { minStageSeconds: 30, windowSeconds: 30 })).toBe(true);
  });
});

describe('describeTrend / recentGain', () => {
  const run = (f, to = 300) => { let s = []; for (let t = 0; t <= to; t += 10) s = appendSample(s, P(t, f(t), 5)); return s; };
  it('unknown until a full window of the stage has passed', () => {
    expect(describeTrend(run(() => 1000, 60), 60).state).toBe('unknown');
    expect(describeTrend([], 10).state).toBe('unknown');
  });
  it('improving with a percentage in plain words', () => {
    const t = describeTrend(run(x => 1000 - x), 300); // 1000 - t: gain 120 over 120 s, current 700 -> 17%
    expect(t.state).toBe('improving');
    expect(t.text).toContain('Still improving');
    expect(t.text).toContain('17%');
    expect(t.text).toContain('last 2 minutes');
  });
  it('levelling off when the gain is under the threshold', () => {
    const t = describeTrend(run(() => 1000), 300);
    expect(t.state).toBe('levelling');
    expect(t.text).toContain('Levelling off');
  });
  it('only compares inside the latest stage', () => {
    let s = []; for (let t = 0; t <= 200; t += 10) s = appendSample(s, P(t, 9000, 4));
    for (let t = 210; t <= 300; t += 10) s = appendSample(s, P(t, 50, 5));
    expect(recentGain(s, 300).known).toBe(false); // stage 5 is only 90 s old
  });
});

describe('bestOfProgress', () => {
  it('picks the running machine furthest along, lowest best on ties; null when none', () => {
    const per = [
      { machine: 'A', status: 'running', progress: P(10, 50, 5) },
      { machine: 'B', status: 'running', progress: P(10, 80, 6) },
      { machine: 'C', status: 'running', progress: P(10, 60, 6) },
      { machine: 'D', status: 'done', progress: P(10, 1, 6) },
    ];
    expect(bestOfProgress(per).best).toBe(60);
    expect(bestOfProgress([{ status: 'queued' }])).toBeNull();
    expect(bestOfProgress(null)).toBeNull();
  });
});

describe('live numbers', () => {
  const dates = ['2026-07-01', '2026-07-02', '2026-07-03', '2026-07-04', '2026-07-05', '2026-07-06'];
  it('incumbentToSchedule maps rows and carries unknown-shift cells from the start grid', () => {
    const base = { r1: { '2026-07-01': 'ODD-X', '2026-07-02': 'POD-D' }, r2: {} };
    const sched = incumbentToSchedule([['r1', '2026-07-02', 'POD-N'], ['r2', '2026-07-03', 'PED-D'], ['bad'], [null, 'd', 's']], base, sid => sid !== 'ODD-X');
    expect(sched).toEqual({ r1: { '2026-07-02': 'POD-N', '2026-07-01': 'ODD-X' }, r2: { '2026-07-03': 'PED-D' } });
    expect(incumbentToSchedule(undefined)).toEqual({});
  });
  it('countIsolatedNights counts single-night runs away from the block edges', () => {
    const isNight = sid => sid.endsWith('-N');
    const sched = {
      a: { '2026-07-03': 'POD-N' },                                            // isolated
      b: { '2026-07-02': 'POD-N', '2026-07-03': 'PED-N' },                     // run of 2
      c: { '2026-07-01': 'POD-N' },                                            // touches first day: may continue, not counted
      d: { '2026-07-06': 'POD-N' },                                            // touches last day
      e: { '2026-07-02': 'POD-N', '2026-07-04': 'POD-N', '2026-07-03': 'POD-D' }, // two isolated
    };
    expect(countIsolatedNights(sched, dates, isNight)).toBe(3);
    expect(countIsolatedNights({}, dates, isNight)).toBe(0);
    expect(countIsolatedNights(sched, [], isNight)).toBe(0);
  });
  it('countIsolatedNights uses the app shift catalog by default', () => {
    expect(countIsolatedNights({ a: { '2026-07-03': 'POD-N' } }, dates)).toBe(1);
    expect(countIsolatedNights({ a: { '2026-07-03': 'POD-D' } }, dates)).toBe(0);
  });
  it('countWarnings ignores errors, info and overridden issues', () => {
    expect(countWarnings([{ level: 'warn' }, { level: 'warn', overridden: true }, { level: 'error' }, { level: 'info' }, null])).toBe(1);
    expect(countWarnings(undefined)).toBe(0);
  });
  it('summarizeLive + liveComparison give plain "was / fewer / more" lines', () => {
    const validate = sched => (sched.a ? [{ level: 'warn' }, { level: 'warn' }] : [{ level: 'warn' }, { level: 'warn' }, { level: 'warn' }, { level: 'warn' }]);
    const start = summarizeLive({ x: { '2026-07-03': 'POD-N', '2026-07-05': 'POD-N' } }, dates, validate);
    const now = summarizeLive({ a: { '2026-07-03': 'POD-N' } }, dates, validate);
    expect(start).toEqual({ isolatedNights: 2, warnings: 4 });
    expect(now).toEqual({ isolatedNights: 1, warnings: 2 });
    const rows = liveComparison(start, now);
    expect(rows.map(r => r.text)).toEqual(['Single isolated nights: 1 (was 2, 1 fewer)', 'Warnings: 2 (was 4, 2 fewer)']);
    expect(liveComparison(start, start)[0].text).toContain('no change');
    expect(liveComparison({ isolatedNights: 1, warnings: 1 }, { isolatedNights: 3, warnings: 1 })[0].text).toContain('2 more');
  });
});

describe('throttle', () => {
  it('needs a changed incumbent AND 10 s since the last recompute', () => {
    expect(shouldRecomputeLive({ key: 'a', now: 0 })).toBe(true);                                   // first one
    expect(shouldRecomputeLive({ lastAt: 0, lastKey: 'a', key: 'b', now: 9_999 })).toBe(false);     // too soon
    expect(shouldRecomputeLive({ lastAt: 0, lastKey: 'a', key: 'b', now: 10_000 })).toBe(true);
    expect(shouldRecomputeLive({ lastAt: 0, lastKey: 'a', key: 'a', now: 60_000 })).toBe(false);    // same grid
    expect(shouldRecomputeLive({ lastAt: 0, lastKey: 'a', key: null, now: 60_000 })).toBe(false);   // no incumbent
  });
  it('incumbentKey changes with stage, elapsed, objective and size', () => {
    const inc = { stage: 5, elapsed: 12, objective: 40, rows: [['r', 'd', 's']] };
    expect(incumbentKey(inc)).toBe('5|12|40|1');
    expect(incumbentKey({ ...inc, elapsed: 14 })).not.toBe(incumbentKey(inc));
    expect(incumbentKey(null)).toBeNull();
    expect(incumbentKey({})).toBeNull();
  });
});
