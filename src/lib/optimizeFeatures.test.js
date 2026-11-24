import { describe, it, expect, vi, afterEach } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  parseFeatures, hasFeature, commonFeatures, capsFromFeatures, optimizeBudgetOptions, budgetAvailable, budgetSeconds,
  optimizeRunPlan, optimizeButtonLabel, stoppedEarlyText, targetFeatures, aggregateBestOfJobs, BEST_OF_TARGET,
} from './optimizeFlow.js';
import { stopSolveJob } from './solverJobs.js';
import OptimizeMenuSection from '../components/OptimizeMenuSection.jsx';
import OptimizeProgressPanel from '../components/OptimizeProgressPanel.jsx';
import OptimizeCompareModal from '../components/OptimizeCompareModal.jsx';

describe('host features', () => {
  it('parseFeatures: absent / malformed = none', () => {
    expect(parseFeatures({ features: ['stop', 'longRun'] })).toEqual(['stop', 'longRun']);
    expect(parseFeatures({})).toEqual([]);
    expect(parseFeatures(null)).toEqual([]);
    expect(parseFeatures({ features: 'stop' })).toEqual([]);
    expect(parseFeatures({ features: ['stop', 3, '', null] })).toEqual(['stop']);
  });
  it('hasFeature / capsFromFeatures', () => {
    expect(hasFeature(['stop'], 'stop')).toBe(true);
    expect(hasFeature(undefined, 'stop')).toBe(false);
    expect(capsFromFeatures(['stop'])).toEqual({ stop: true, longRun: false });
    expect(capsFromFeatures(undefined)).toEqual({ stop: false, longRun: false });
  });
  it('commonFeatures needs every machine to offer it', () => {
    expect(commonFeatures([['stop', 'longRun'], ['stop']])).toEqual(['stop']);
    expect(commonFeatures([['stop'], []])).toEqual([]);
    expect(commonFeatures([])).toEqual([]);
  });
});

describe('budget choices with and without features', () => {
  const values = o => o.map(x => x.value);
  it('no features: exactly the old list', () => {
    expect(values(optimizeBudgetOptions())).toEqual(['auto', 5, 10, 15, 30]);
    expect(values(optimizeBudgetOptions({ stop: false, longRun: false }))).toEqual(['auto', 5, 10, 15, 30]);
  });
  it('stop adds "until it levels off"; longRun adds "long polish"', () => {
    const a = optimizeBudgetOptions({ stop: true });
    expect(values(a)).toEqual(['auto', 5, 10, 15, 30, 'leveloff']);
    expect(a.at(-1).label).toBe('Until it levels off (15 min max)');
    const b = optimizeBudgetOptions({ longRun: true });
    expect(values(b)).toEqual(['auto', 5, 10, 15, 30, 'long']);
    expect(b.at(-1).label).toBe('Long polish (2 hours)');
    expect(values(optimizeBudgetOptions({ stop: true, longRun: true }))).toEqual(['auto', 5, 10, 15, 30, 'leveloff', 'long']);
  });
  it('budgetAvailable gates the two new choices only', () => {
    expect(budgetAvailable('leveloff', {})).toBe(false);
    expect(budgetAvailable('leveloff', { stop: true })).toBe(true);
    expect(budgetAvailable('long', { stop: true })).toBe(false);
    expect(budgetAvailable('long', { longRun: true })).toBe(true);
    expect(budgetAvailable('auto', {})).toBe(true);
    expect(budgetAvailable(10, {})).toBe(true);
  });
  it('budgetSeconds knows the new choices and leaves Auto alone', () => {
    expect(budgetSeconds('leveloff')).toBe(900);
    expect(budgetSeconds('long')).toBe(7200);
    expect(budgetSeconds('auto', 120)).toBe(120);
    expect(budgetSeconds('auto')).toBe(300);
  });
  it('optimizeRunPlan: levels-off = 900 s + auto-stop; long = 7200 s + longRun; reduced with a note when the host lacks it', () => {
    expect(optimizeRunPlan('leveloff', 120, { stop: true })).toEqual({ seconds: 900, config: {}, autoStop: true, note: null });
    expect(optimizeRunPlan('leveloff', 120, {})).toMatchObject({ seconds: 900, autoStop: false });
    expect(optimizeRunPlan('leveloff', 120, {}).note).toMatch(/full 15 minutes/);
    expect(optimizeRunPlan('long', 120, { longRun: true })).toEqual({ seconds: 7200, config: { longRun: true }, autoStop: false, note: null });
    expect(optimizeRunPlan('long', 120, { stop: true })).toMatchObject({ seconds: 1800, config: {} });
    expect(optimizeRunPlan('long', 120, {}).note).toMatch(/30 minutes/);
    // existing choices unchanged
    expect(optimizeRunPlan('auto', 120, { stop: true, longRun: true })).toEqual({ seconds: 120, config: {}, autoStop: false, note: null });
    expect(optimizeRunPlan(15, 120, {})).toEqual({ seconds: 900, config: {}, autoStop: false, note: null });
  });
  it('button label', () => {
    expect(optimizeButtonLabel('auto', 5)).toBe('Optimize (5 min)');
    expect(optimizeButtonLabel('leveloff', 15)).toBe('Optimize (up to 15 min)');
    expect(optimizeButtonLabel('long', 120)).toBe('Optimize (long polish, up to 2 h)');
  });
});

describe('stoppedEarlyText', () => {
  it('only when report.stoppedEarly is true', () => {
    expect(stoppedEarlyText({ report: {} }, { elapsedSeconds: 100 })).toBeNull();
    expect(stoppedEarlyText(null, null)).toBeNull();
    expect(stoppedEarlyText({ report: { stoppedEarly: true } }, { elapsedSeconds: 252 })).toBe('Stopped early at 4:12');
    expect(stoppedEarlyText({ report: { stoppedEarly: true, elapsedSeconds: 61 } }, { elapsedSeconds: 252 })).toBe('Stopped early at 1:01');
    expect(stoppedEarlyText({ report: { stoppedEarly: true } }, { progress: { elapsed: 75 } })).toBe('Stopped early at 1:15');
    expect(stoppedEarlyText({ report: { stoppedEarly: true } }, {})).toBe('Stopped early');
  });
});

describe('targetFeatures', () => {
  const pool = [
    { name: 'Mac', url: 'https://mac.test', online: true, busy: false, features: ['stop', 'longRun'] },
    { name: 'PicklePower', url: 'https://pp.test', online: true, busy: false, features: ['stop'] },
    { name: 'Old', url: 'https://old.test', online: true, busy: false, features: [] },
  ];
  it('manual pool machine', () => {
    expect(targetFeatures({ preference: 'pool:Mac', poolStatus: pool })).toEqual(['stop', 'longRun']);
    expect(targetFeatures({ preference: 'pool:Old', poolStatus: pool })).toEqual([]);
  });
  it('Auto follows the same pick as submit (this computer first, else first idle pool machine)', () => {
    expect(targetFeatures({ preference: 'cloud', poolStatus: pool })).toEqual(['stop', 'longRun']);
    expect(targetFeatures({ preference: 'cloud', localStatus: { online: true, busy: false, features: [] }, poolStatus: pool })).toEqual([]);
  });
  it('Best of = what every machine offers', () => {
    expect(targetFeatures({ preference: BEST_OF_TARGET, poolStatus: pool })).toEqual(['stop']);
  });
  it('nothing usable / no features = none (old menu)', () => {
    expect(targetFeatures({ preference: 'cloud', poolStatus: [] })).toEqual([]);
    expect(targetFeatures({ preference: 'cloud', poolStatus: [{ name: 'X', url: 'https://x.test', online: false, busy: false }] })).toEqual([]);
  });
});

describe('aggregateBestOfJobs carries stopping', () => {
  it('running aggregate says stopping when any machine does', () => {
    const a = aggregateBestOfJobs([{ machine: 'A', view: { status: 'running', stopping: true } }, { machine: 'B', view: { status: 'running' } }]);
    expect(a.status).toBe('running');
    expect(a.stopping).toBe(true);
    expect(aggregateBestOfJobs([{ machine: 'A', view: { status: 'running' } }]).stopping).toBeUndefined();
  });
});

describe('stopSolveJob', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('POSTs /jobs/{id}/stop with auth and returns the view', async () => {
    const f = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ status: 'running', stopping: true }) }));
    vi.stubGlobal('fetch', f);
    const r = await stopSolveJob('abc', { url: 'https://x.test', accessToken: 't' });
    expect(r).toEqual({ ok: true, view: { status: 'running', stopping: true } });
    expect(f).toHaveBeenCalledWith('https://x.test/jobs/abc/stop', expect.objectContaining({ method: 'POST', headers: expect.objectContaining({ Authorization: 'Bearer t' }) }));
  });
  it('404 = lost, other failures never throw', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404 })));
    expect(await stopSolveJob('abc', { url: 'https://x.test' })).toEqual({ ok: false, lost: true });
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500 })));
    expect((await stopSolveJob('abc', { url: 'https://x.test' })).ok).toBe(false);
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    expect(await stopSolveJob('abc', { url: 'https://x.test' })).toEqual({ ok: false, error: 'offline' });
    expect((await stopSolveJob('abc', {})).ok).toBe(false);
  });
});

describe('components', () => {
  const menu = props => renderToStaticMarkup(createElement(OptimizeMenuSection, { machines: [], ...props }));
  it('menu without features shows the old time list and nothing new', () => {
    const html = menu({});
    expect(html).not.toContain('levels off');
    expect(html).not.toContain('Long polish');
    expect(html).toContain('Optimize (5 min)');
  });
  it('menu with features shows the new choices and plain hints', () => {
    const html = menu({ caps: { stop: true, longRun: true } });
    expect(html).toContain('Until it levels off (15 min max)');
    expect(html).toContain('Long polish (2 hours)');
    const long = menu({ caps: { stop: true, longRun: true }, budget: 'long', budgetMinutes: 120 });
    expect(long).toContain('left running');
    expect(long).toContain('overnight');
    expect(long).toContain('Optimize (long polish, up to 2 h)');
    const lvl = menu({ caps: { stop: true }, budget: 'leveloff', budgetMinutes: 15 });
    expect(lvl).toContain('Optimize (up to 15 min)');
  });
  it('a stale new choice on a host without the feature falls back to Auto', () => {
    const html = menu({ caps: {}, budget: 'long', budgetMinutes: 5 });
    expect(html).not.toContain('left running');
    expect(html).toContain('Optimize (5 min)');
  });
  it('progress panel: extras only when given', () => {
    const base = { tracker: { stage: 6, stages: 6, elapsed: 130, budget: 900, improvements: 1, lastImprovedAt: 1000 }, status: 'running', now: 5000 };
    const plain = renderToStaticMarkup(createElement(OptimizeProgressPanel, base));
    expect(plain).not.toContain('optimize-trend');
    expect(plain).not.toContain('optimize-live');
    expect(plain).not.toContain('Wrapping up');
    const rich = renderToStaticMarkup(createElement(OptimizeProgressPanel, {
      ...base, trend: { state: 'levelling', text: 'Levelling off (almost no gain in the last 2 minutes)' },
      live: [{ key: 'a', text: 'Single isolated nights: 3 (was 9, 6 fewer)' }], autoStop: true,
    }));
    expect(rich).toContain('Levelling off');
    expect(rich).toContain('Single isolated nights: 3 (was 9, 6 fewer)');
    expect(rich).toContain('stops by itself');
    const wrapping = renderToStaticMarkup(createElement(OptimizeProgressPanel, { ...base, wrappingUp: true, trend: { state: 'improving', text: 'Still improving' } }));
    expect(wrapping).toContain('Wrapping up');
    expect(wrapping).not.toContain('Still improving');
  });
  it('compare modal says when the run was stopped early', () => {
    const html = renderToStaticMarkup(createElement(OptimizeCompareModal, { open: true, machineName: 'Mac', rows: [], diff: null, stoppedEarly: 'Stopped early at 4:12' }));
    expect(html).toContain('Stopped early at 4:12');
    const none = renderToStaticMarkup(createElement(OptimizeCompareModal, { open: true, machineName: 'Mac', rows: [], diff: null }));
    expect(none).not.toContain('Stopped early');
  });
});
