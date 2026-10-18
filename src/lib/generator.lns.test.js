/** @vitest-environment jsdom */
// B1: time-budgeted attempts + LNS ruin-and-recreate post-pass of generateScheduleBest.
import { describe, it, expect } from 'vitest';
import { generateScheduleBest, replayLns, validateAll } from '../ResidentScheduler.jsx';
import { makeFixture } from './__fixtures__/syntheticRoster.js';

const errorsOf = (fx, schedule) => validateAll(
  fx.allResidents, schedule, fx.block, fx.eligOverrides, fx.appSettings, fx.dayRules, fx.coverage, fx.blocksHistory, fx.ayConf
).filter(i => i.level === 'error').length;

describe('generateScheduleBest — time budget', () => {
  it('absent budget runs exactly `attempts`', () => {
    const fx = makeFixture('understaffed');
    const { report } = generateScheduleBest({ ...fx }, { attempts: 3, baseSeed: 11 });
    expect(report.attempts).toBe(3);
    expect(report.replay.lns).toBeNull();
  });
  it('a budget keeps drawing seeds past `attempts`', () => {
    const fx = makeFixture('understaffed');
    const { report } = generateScheduleBest({ ...fx }, { attempts: 1, baseSeed: 11, timeBudgetMs: 1500 });
    expect(report.attempts).toBeGreaterThan(1);
  });
});

describe('generateScheduleBest — LNS', () => {
  it('is deterministic, never worse, keeps pre-existing cells, and replays', () => {
    const fx = makeFixture('understaffed');
    // Seed a few manual cells from a throwaway run so there is something kept to protect.
    const seedRun = generateScheduleBest({ ...fx }, { attempts: 1, baseSeed: 5, repair: false });
    const rid = fx.allResidents[0].id;
    const manual = Object.entries(seedRun.schedule[rid] || {}).filter(([, v]) => v).slice(0, 4);
    const block = { ...fx.block, schedule: { [rid]: Object.fromEntries(manual) } };
    const args = { ...fx, block };
    const opts = { attempts: 3, baseSeed: 77 };
    const pre = generateScheduleBest(args, { ...opts, lnsIters: 0 });
    const a = generateScheduleBest(args, { ...opts, lnsIters: 12 });
    const b = generateScheduleBest(args, { ...opts, lnsIters: 12 });
    expect(a.schedule).toEqual(b.schedule);
    expect(errorsOf(fx, a.schedule)).toBeLessThanOrEqual(errorsOf(fx, pre.schedule));
    for (const [ds, sid] of manual) expect(a.schedule[rid][ds]).toBe(sid);
    expect(a.report.replay.lns).toEqual({ seed: expect.any(Number), iters: 12 });
    expect(a.report.computeUnderTargetDiagnostics).toBeUndefined();
    expect(a.report.computeUnfilledDiagnostics).toBeUndefined();
    const replayed = replayLns(args, pre, a.report.replay.lns);
    expect(replayed.schedule).toEqual(a.schedule);
  });
});

describe('generateScheduleBest — true-primary fix under Clear & Regenerate', () => {
  it('clearFirst:true yields the same schedule as the fill-from-empty run (fix not wiped)', async () => {
    const { makeRealScaleFixture } = await import('./__fixtures__/realScale.js');
    const fx = makeRealScaleFixture();
    const fresh = generateScheduleBest({ ...fx, block: { ...fx.block, schedule: {} } }, { attempts: 20, baseSeed: 7 });
    expect(fresh.report.truePrimaryFixApplied).toBe(true); // seed chosen because the fix fires
    const cleared = generateScheduleBest({ ...fx, clearFirst: true }, { attempts: 20, baseSeed: 7 });
    expect(cleared.report.truePrimaryFixApplied).toBe(true);
    expect(cleared.schedule).toEqual(fresh.schedule);
  }, 120000);
});
