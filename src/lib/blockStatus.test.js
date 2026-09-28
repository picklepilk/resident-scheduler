// src/lib/blockStatus.test.js
import { describe, it, expect } from 'vitest';
import { deriveBlockSteps, BLOCK_STEP_IDS } from './blockStatus.js';

const BASE = { hasDates: true, hasReport: true, errorCount: 0, published: false, hasSnapshot: true, lastExportedAt: null };
const ids = steps => steps.map(s => s.id);
const states = steps => steps.map(s => s.state);
const stepFor = (steps, id) => steps.find(s => s.id === id);

describe('deriveBlockSteps', () => {
  it('always returns all five steps in fixed order', () => {
    const steps = deriveBlockSteps(BASE);
    expect(ids(steps)).toEqual(BLOCK_STEP_IDS);
  });

  it('brand-new block: no dates yet -> setup is current, everything after is pending', () => {
    const steps = deriveBlockSteps({ hasDates: false, hasReport: false, errorCount: 0, published: false, hasSnapshot: false, lastExportedAt: null });
    expect(states(steps)).toEqual(['current', 'pending', 'pending', 'pending', 'pending']);
    expect(stepFor(steps, 'setup').label).toBe('Set up');
  });

  it('dates set, never generated -> generated is current', () => {
    const steps = deriveBlockSteps({ ...BASE, hasReport: false });
    expect(stepFor(steps, 'setup').state).toBe('done');
    expect(stepFor(steps, 'generated').state).toBe('current');
    expect(stepFor(steps, 'generated').label).toBe('Generate');
    // errors/publish/export sit behind an unfinished 'generated' step even though errorCount is 0 —
    // this is a stepper, not five independent booleans (see module header comment).
    expect(states(steps).slice(2)).toEqual(['pending', 'pending', 'pending']);
  });

  it('generated with errors -> errors step is current with a count label', () => {
    const steps = deriveBlockSteps({ ...BASE, errorCount: 3 });
    expect(stepFor(steps, 'generated').state).toBe('done');
    expect(stepFor(steps, 'errors').state).toBe('current');
    expect(stepFor(steps, 'errors').label).toBe('3 errors to fix');
    expect(states(steps).slice(3)).toEqual(['pending', 'pending']);
  });

  it('singular error count reads "1 error to fix"', () => {
    const steps = deriveBlockSteps({ ...BASE, errorCount: 1 });
    expect(stepFor(steps, 'errors').label).toBe('1 error to fix');
  });

  it('zero errors, no snapshot yet -> publish step says Save block first', () => {
    const steps = deriveBlockSteps({ ...BASE, hasSnapshot: false });
    expect(stepFor(steps, 'errors').state).toBe('done');
    expect(stepFor(steps, 'errors').label).toBe('No errors');
    const pub = stepFor(steps, 'publish');
    expect(pub.state).toBe('current');
    expect(pub.label).toBe('Save block first');
  });

  it('zero errors, saved snapshot, not published -> publish step is current and actionable', () => {
    const steps = deriveBlockSteps({ ...BASE, hasSnapshot: true });
    const pub = stepFor(steps, 'publish');
    expect(pub.state).toBe('current');
    expect(pub.label).toBe('Publish');
  });

  it('published -> publish is done, export becomes current', () => {
    const steps = deriveBlockSteps({ ...BASE, published: true });
    expect(stepFor(steps, 'publish').state).toBe('done');
    expect(stepFor(steps, 'publish').label).toBe('Published');
    const exp = stepFor(steps, 'export');
    expect(exp.state).toBe('current');
    expect(exp.label).toBe('Export');
  });

  it('published and exported -> every step done, export shows a short date', () => {
    const steps = deriveBlockSteps({ ...BASE, published: true, lastExportedAt: '2026-09-26T14:00:00.000Z' });
    expect(states(steps)).toEqual(['done', 'done', 'done', 'done', 'done']);
    expect(stepFor(steps, 'export').label).toBe('Exported Sep 26');
  });

  it('exported once, then schedule changes again (lastExportedAt persists) -> still reads done', () => {
    // deriveBlockSteps has no notion of "stale" export — that's out of scope for P1; it only asks
    // whether an export has ever happened since block.lastExportedAt was last stamped.
    const steps = deriveBlockSteps({ ...BASE, published: true, lastExportedAt: '2026-01-05T00:00:00.000Z' });
    expect(stepFor(steps, 'export').state).toBe('done');
    expect(stepFor(steps, 'export').label).toBe('Exported Jan 5');
  });

  it('errorCount is defensively coerced (non-number treated as 0)', () => {
    const steps = deriveBlockSteps({ ...BASE, hasReport: true, errorCount: undefined });
    expect(stepFor(steps, 'errors').label).toBe('No errors');
  });
});
