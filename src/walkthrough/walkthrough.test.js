import { describe, it, expect } from 'vitest';
import { WALKTHROUGH_STEPS, RESIDENT_WALKTHROUGH_STEPS, filterStepsForRole, APP_KEY } from './walkthroughSteps';
import { mergeWalkthroughSeen } from './useWalkthroughSeen';

describe('filterStepsForRole', () => {
  it('keeps role-less steps for every role', () => {
    const steps = [{ title: 'a' }, { title: 'b', roles: ['admin'] }];
    expect(filterStepsForRole(steps, 'resident')).toEqual([{ title: 'a' }]);
    expect(filterStepsForRole(steps, 'admin')).toEqual(steps);
  });

  it('hides admin-only steps for a non-matching role', () => {
    const adminOnly = WALKTHROUGH_STEPS.filter(s => s.roles?.includes('admin'));
    expect(adminOnly.length).toBeGreaterThan(0); // sanity: the fixture actually exercises the filter

    const forResident = filterStepsForRole(WALKTHROUGH_STEPS, 'resident');
    for (const s of forResident) expect(s.roles).toBeUndefined();
    expect(forResident.length).toBeLessThan(WALKTHROUGH_STEPS.length);
  });

  it('pending sees only the role-less steps, same set as resident today', () => {
    expect(filterStepsForRole(WALKTHROUGH_STEPS, 'pending'))
      .toEqual(filterStepsForRole(WALKTHROUGH_STEPS, 'resident'));
  });

  it('step count is within the 6-10 spec range', () => {
    expect(WALKTHROUGH_STEPS.length).toBeGreaterThanOrEqual(6);
    expect(WALKTHROUGH_STEPS.length).toBeLessThanOrEqual(10);
  });

  it('every step has a title, headline, and 2-3 bullets, at least one with a concrete example', () => {
    for (const s of WALKTHROUGH_STEPS) {
      expect(s.title).toBeTruthy();
      expect(s.headline).toBeTruthy();
      expect(s.bullets.length).toBeGreaterThanOrEqual(2);
      expect(s.bullets.length).toBeLessThanOrEqual(3);
      expect(s.bullets.some(b => /e\.g\.|example/i.test(b))).toBe(true);
    }
  });

  it('every data-tour target is unique across steps (one element per key at a time)', () => {
    const targets = WALKTHROUGH_STEPS.map(s => s.target).filter(Boolean);
    expect(new Set(targets).size).toBe(targets.length);
  });
});

// Round 2: the resident-facing /requests page's step set (ResidentRequestsApp.jsx). Single flow,
// so no step here carries `roles` — mirrors the admin suite above but asserts the opposite
// (nothing is ever filtered out) instead of duplicating the filtering logic itself, which
// `filterStepsForRole`'s own tests already cover generically.
//
// "Welcome shows/hides" and "replay opens step 0" (the two behaviors named in the round-2 ask)
// are DOM/interaction concerns — this repo has no @testing-library/react or jsdom-render harness
// (see CLAUDE.md: UI/tabs are untested at that level everywhere else too), so they're covered by
// the Playwright pass against /requests instead, same split round 1 used for the admin surface.
describe('RESIDENT_WALKTHROUGH_STEPS', () => {
  it('step count is within the 4-6 spec range', () => {
    expect(RESIDENT_WALKTHROUGH_STEPS.length).toBeGreaterThanOrEqual(4);
    expect(RESIDENT_WALKTHROUGH_STEPS.length).toBeLessThanOrEqual(6);
  });

  it('every step has a title, headline, and 2-3 bullets, at least one with a concrete example', () => {
    for (const s of RESIDENT_WALKTHROUGH_STEPS) {
      expect(s.title).toBeTruthy();
      expect(s.headline).toBeTruthy();
      expect(s.bullets.length).toBeGreaterThanOrEqual(2);
      expect(s.bullets.length).toBeLessThanOrEqual(3);
      expect(s.bullets.some(b => /e\.g\.|example/i.test(b))).toBe(true);
    }
  });

  it('every step has a real data-tour target (single-flow page, no page-level steps)', () => {
    for (const s of RESIDENT_WALKTHROUGH_STEPS) expect(s.target).toBeTruthy();
    const targets = RESIDENT_WALKTHROUGH_STEPS.map(s => s.target);
    expect(new Set(targets).size).toBe(targets.length);
  });

  it('no step carries roles or route — single-flow page, no tabs, no role gate', () => {
    for (const s of RESIDENT_WALKTHROUGH_STEPS) {
      expect(s.roles).toBeUndefined();
      expect(s.route).toBeUndefined();
    }
  });

  it('is unaffected by filterStepsForRole regardless of role', () => {
    for (const role of ['admin', 'resident', 'pending', undefined]) {
      expect(filterStepsForRole(RESIDENT_WALKTHROUGH_STEPS, role)).toEqual(RESIDENT_WALKTHROUGH_STEPS);
    }
  });

  it('targets do not collide with the admin step set (both could theoretically share a build)', () => {
    const adminTargets = new Set(WALKTHROUGH_STEPS.map(s => s.target).filter(Boolean));
    for (const s of RESIDENT_WALKTHROUGH_STEPS) expect(adminTargets.has(s.target)).toBe(false);
  });
});

describe('mergeWalkthroughSeen', () => {
  it('merges without clobbering sibling app keys', () => {
    const existing = { 'em-scheduler': true, 'ems-inventory': true };
    const merged = mergeWalkthroughSeen(existing, APP_KEY);
    expect(merged).toEqual({ 'em-scheduler': true, 'ems-inventory': true, [APP_KEY]: true });
  });

  it('handles a missing existing object', () => {
    expect(mergeWalkthroughSeen(undefined, APP_KEY)).toEqual({ [APP_KEY]: true });
  });

  it('is idempotent', () => {
    const once = mergeWalkthroughSeen(undefined, APP_KEY);
    const twice = mergeWalkthroughSeen(once, APP_KEY);
    expect(twice).toEqual(once);
  });
});
