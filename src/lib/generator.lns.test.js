/** @vitest-environment jsdom */
// B1: time-budgeted attempts + LNS ruin-and-recreate post-pass of generateScheduleBest.
import { describe, it, expect } from 'vitest';
import { generateScheduleBest, generateScheduleBestAsync, replayLns, replayNightMerge, validateAll, hasFallbackComposition } from '../ResidentScheduler.jsx';
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
    // manual[0] doubles as a locked cell; manual[1] stands in for a hand-overridden cell (those are
    // ordinary non-empty cells in block.schedule, so the same original-kept-cells guard covers them).
    const block = { ...fx.block, schedule: { [rid]: Object.fromEntries(manual) }, lockedCells: { [rid]: { [manual[0][0]]: true } } };
    const args = { ...fx, block };
    const opts = { attempts: 3, baseSeed: 77 };
    const pre = generateScheduleBest(args, { ...opts, lnsIters: 0 });
    const a = generateScheduleBest(args, { ...opts, lnsIters: 12 });
    const b = generateScheduleBest(args, { ...opts, lnsIters: 12 });
    expect(a.schedule).toEqual(b.schedule);
    // Never worse in the lexicographic ladder's leading slots: errors, then the quality vector.
    expect(errorsOf(fx, a.schedule)).toBeLessThanOrEqual(errorsOf(fx, pre.schedule));
    if (errorsOf(fx, a.schedule) === errorsOf(fx, pre.schedule)) {
      const av = a.report.qualityVector, pv = pre.report.qualityVector;
      const k = av.findIndex((x, i) => x !== pv[i]);
      if (k >= 0) expect(av[k]).toBeLessThan(pv[k]);
    }
    for (const [ds, sid] of manual) expect(a.schedule[rid][ds]).toBe(sid);
    expect(a.report.replay.lns).toEqual({ seed: expect.any(Number), iters: 12 });
    expect(a.report.computeUnderTargetDiagnostics).toBeUndefined();
    expect(a.report.computeUnfilledDiagnostics).toBeUndefined();
    // 2026-10-28: a night-merge pass follows LNS (only when LNS ran), so replay applies it too.
    const replayed = replayNightMerge(args, replayLns(args, pre, a.report.replay.lns));
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

describe('generateScheduleBest — LNS acceptance and guards', () => {
  it('accepts improvements on realScale and never reintroduces a fallback-PGY composition', async () => {
    const { makeRealScaleFixture } = await import('./__fixtures__/realScale.js');
    const fx = makeRealScaleFixture();
    const opts = { attempts: 20, baseSeed: 7 };
    const pre = generateScheduleBest({ ...fx }, { ...opts, lnsIters: 0 });
    const post = generateScheduleBest({ ...fx }, { ...opts, lnsIters: 60 });
    expect(post.report.lnsAccepted).toBeGreaterThan(0);
    if (!hasFallbackComposition(pre.schedule, fx.allResidents, fx.block, fx.appSettings, fx.ayConf)) {
      expect(hasFallbackComposition(post.schedule, fx.allResidents, fx.block, fx.appSettings, fx.ayConf)).toBe(false);
    }
  }, 120000);

  it('under a time cap, progress reports elapsed vs the cap', async () => {
    const fx = makeFixture('understaffed');
    const seen = [];
    await generateScheduleBestAsync({ ...fx }, { attempts: 1, baseSeed: 3, lnsIters: 100000, lnsTimeMs: 600 }, p => { if (p.phase === 'lns') seen.push(p); });
    expect(seen.length).toBeGreaterThan(0);
    for (const p of seen) { expect(p.total).toBe(600); expect(p.done).toBeLessThanOrEqual(600); }
  }, 60000);

  it('clearFirst discards the incoming schedule, so nothing is protected as kept', () => {
    const fx = makeFixture('understaffed');
    const rid = fx.allResidents[0].id;
    const seedRun = generateScheduleBest({ ...fx }, { attempts: 1, baseSeed: 5, repair: false });
    const stale = { ...fx.block, schedule: { [rid]: seedRun.schedule[rid] } };
    const r = generateScheduleBest({ ...fx, block: stale, clearFirst: true }, { attempts: 2, baseSeed: 9, lnsIters: 5 });
    expect(r.report.replay.lns.iters).toBe(5);
  });
});
