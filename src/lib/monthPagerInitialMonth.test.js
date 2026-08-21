/** @vitest-environment jsdom */
// Tests for useMonthPager's `initialMonth` seeding (added for TimeOffModal, which must open on the
// block's own month rather than always paging in at the AY-wide range's first month — always last
// July). Mounted with raw React (createRoot + act), same no-testing-library pattern
// src/lib/uiPrefsHook.test.js already uses to test a hook pulled straight out of a non-lib file
// (there: ../uiPrefs.js; here: ResidentScheduler.jsx, already verified import-safe under jsdom by
// grRestRules.test.js/generator.harness.test.js).
import { describe, it, expect, afterEach } from 'vitest';
import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { useMonthPager } from '../ResidentScheduler.jsx';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let containers = [];
afterEach(() => {
  for (const c of containers) c.remove();
  containers = [];
});

function mountPager(startDate, endDate, initialMonth) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  containers.push(container);
  const root = createRoot(container);
  let api;
  function Harness() {
    api = useMonthPager(startDate, endDate, initialMonth);
    return null;
  }
  act(() => {
    root.render(React.createElement(Harness));
  });
  return () => api;
}

// AY26/27-ish range: July 2026 through June 2027.
const AY_START = '2026-07-01';
const AY_END = '2027-06-30';

describe('useMonthPager — initialMonth (3rd arg)', () => {
  it('omitted (2-arg call) still opens on index 0 — both existing callers must be unaffected', () => {
    const getApi = mountPager(AY_START, AY_END);
    expect(getApi().boundedIdx).toBe(0);
    expect(getApi().current).toEqual({ year: 2026, month: 7 });
  });

  it('seeds the page from a YYYY-MM-DD date string', () => {
    const getApi = mountPager(AY_START, AY_END, '2026-11-15');
    expect(getApi().current).toEqual({ year: 2026, month: 11 });
  });

  it('seeds the page from a {year, month} pair', () => {
    const getApi = mountPager(AY_START, AY_END, { year: 2027, month: 3 });
    expect(getApi().current).toEqual({ year: 2027, month: 3 });
  });

  it('falls back to index 0 when initialMonth falls outside the paged range', () => {
    const getApi = mountPager(AY_START, AY_END, '2030-01-01');
    expect(getApi().boundedIdx).toBe(0);
    expect(getApi().current).toEqual({ year: 2026, month: 7 });
  });

  it('is read only on mount — changing the prop on a later render does not re-page a mounted instance', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    containers.push(container);
    const root = createRoot(container);
    let api;
    function Harness({ initialMonth }) {
      api = useMonthPager(AY_START, AY_END, initialMonth);
      return null;
    }
    act(() => { root.render(React.createElement(Harness, { initialMonth: '2026-09-01' })); });
    expect(api.current).toEqual({ year: 2026, month: 9 });
    act(() => { root.render(React.createElement(Harness, { initialMonth: '2027-02-01' })); });
    // Same mounted instance — the initial useState value isn't re-evaluated on prop change.
    expect(api.current).toEqual({ year: 2026, month: 9 });
  });
});
