/** @vitest-environment jsdom */
// Tests for ../uiPrefs.js's `useUiPrefs` hook — the cloud-sync half of UI prefs (device-local
// persistence is covered by uiPrefs.test.js next to this file, which tests the pure
// normalizeUiPrefs/DEFAULT_UI_PREFS helpers in src/lib/uiPrefs.js). Lives under src/lib/ purely so
// it sits inside vitest.config.js's `src/lib/**/*.test.js` include glob — src/uiPrefs.js itself is
// outside that glob and has no test suite of its own (same reasoning documented at the top of
// src/lib/uiPrefs.js for why the pure helpers were split out), same pattern several other files
// here already use to test a module living outside src/lib under jsdom (see
// grRestRules.test.js/generator.harness.test.js importing ResidentScheduler.jsx).
//
// Covers two real bugs fixed alongside this test:
//  1. The debounced cloud save built a supabase-js PostgrestBuilder but never awaited/thenned it —
//     a lazy thenable that never issues its fetch() unless awaited/thenned, so no HTTP request was
//     ever sent and cross-device sync was entirely dead. Asserted by checking the mock builder's
//     `.then` was actually invoked, not just that `.update()`/`.eq()` were called with the right args.
//  2. A local edit made before the mount-time cloud load resolved was silently overwritten (or,
//     even if not overwritten, is lost never reaches the cloud) once the load landed. Asserted via
//     a controllable (deferred) mock load that resolves after an edit has already happened.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { useUiPrefs } from '../uiPrefs.js';
import { __mock } from '../supabaseClient.js';

vi.mock('../supabaseClient.js', () => {
  const state = { authEnabled: true, selectImpl: null, updateError: null };
  const updateCalls = [];
  const selectCalls = [];

  function makeUpdateBuilder(payload) {
    const record = { payload, eqArgs: null, thenCalled: false };
    updateCalls.push(record);
    const builder = {
      eq: (...args) => {
        record.eqArgs = args;
        return builder;
      },
      then: (onFulfilled, onRejected) => {
        record.thenCalled = true;
        return Promise.resolve({ data: null, error: state.updateError }).then(onFulfilled, onRejected);
      },
      catch: onRejected => builder.then(undefined, onRejected),
    };
    return builder;
  }

  const supabase = {
    from: () => ({
      select: (...args) => {
        const rec = { args, eqArgs: null };
        selectCalls.push(rec);
        return {
          eq: (...eqArgs) => {
            rec.eqArgs = eqArgs;
            return {
              maybeSingle: () =>
                state.selectImpl ? state.selectImpl() : Promise.resolve({ data: null, error: null }),
            };
          },
        };
      },
      update: payload => makeUpdateBuilder(payload),
    }),
  };

  return {
    get AUTH_ENABLED() {
      return state.authEnabled;
    },
    supabase,
    __mock: {
      state,
      updateCalls,
      selectCalls,
      reset() {
        state.authEnabled = true;
        state.selectImpl = null;
        state.updateError = null;
        updateCalls.length = 0;
        selectCalls.length = 0;
      },
    },
  };
});

// React's `act` no-ops (with a console warning) unless this flag is set — there's no shared test
// setup file in this repo (vitest.config.js has no `setupFiles`), so set it here.
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const VIEWER = { email: 'chief@example.com', userId: 'user-1', role: 'admin' };

let containers = [];

function mountHook(viewer) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  containers.push(container);
  const root = createRoot(container);
  let api;
  function Harness() {
    api = useUiPrefs(viewer);
    return null;
  }
  act(() => {
    root.render(React.createElement(Harness));
  });
  return { getApi: () => api, root };
}

async function flushMicrotasks() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  __mock.reset();
  try {
    localStorage.clear();
  } catch {
    /* jsdom localStorage always available in this env */
  }
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  for (const c of containers) c.remove();
  containers = [];
});

describe('useUiPrefs — cloud save actually fires', () => {
  it('awaits the update builder (and issues update/eq with the right args) after the debounce', async () => {
    const { getApi } = mountHook(VIEWER);
    await flushMicrotasks(); // let the mount-time load resolve (no cloud data)

    act(() => {
      getApi().setShowUnscheduled(true);
    });

    // Nothing should have been sent yet — still inside the debounce window.
    expect(__mock.updateCalls.length).toBe(0);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });

    expect(__mock.updateCalls.length).toBe(1);
    const call = __mock.updateCalls[0];
    expect(call.payload.ui_prefs.showUnscheduled).toBe(true);
    expect(call.eqArgs).toEqual(['id', VIEWER.userId]);
    // The bug being fixed: the builder must actually be awaited/thenned, or supabase-js never
    // issues the underlying fetch().
    expect(call.thenCalled).toBe(true);
  });

  it('does nothing when there is no authenticated viewer', async () => {
    const { getApi } = mountHook(null);
    await flushMicrotasks();

    act(() => {
      getApi().setShowUnscheduled(true);
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });

    expect(__mock.updateCalls.length).toBe(0);
  });
});

describe('useUiPrefs — edits made before the cloud load resolves are not lost', () => {
  it('keeps a pre-load local edit instead of letting the load overwrite it, and flushes it to the cloud', async () => {
    let resolveLoad;
    __mock.state.selectImpl = () => new Promise(resolve => { resolveLoad = resolve; });

    const { getApi } = mountHook(VIEWER);
    // Load is still in flight (deferred, unresolved) — this is the pre-load edit window.
    await flushMicrotasks();

    act(() => {
      getApi().setShowUnscheduled(true);
    });
    expect(getApi().prefs.showUnscheduled).toBe(true);

    // Now the cloud load resolves with a DIFFERENT value for the same field — this is the value
    // that used to silently win and clobber the edit above.
    await act(async () => {
      resolveLoad({ data: { ui_prefs: { tabOverflow: ['other'], cardOpen: {}, showUnscheduled: false } } });
      await Promise.resolve();
      await Promise.resolve();
    });

    // The local edit must survive the load landing.
    expect(getApi().prefs.showUnscheduled).toBe(true);
    expect(getApi().prefs.tabOverflow).toEqual([]);

    // And it must actually reach the cloud — flushed immediately once the load resolves, not
    // silently dropped because the debounced save effect had already bailed out before the load
    // finished.
    expect(__mock.updateCalls.length).toBe(1);
    expect(__mock.updateCalls[0].payload.ui_prefs.showUnscheduled).toBe(true);
    expect(__mock.updateCalls[0].thenCalled).toBe(true);
  });

  it('still applies the cloud overlay when no edit happened during the load', async () => {
    let resolveLoad;
    __mock.state.selectImpl = () => new Promise(resolve => { resolveLoad = resolve; });

    const { getApi } = mountHook(VIEWER);
    await flushMicrotasks();

    await act(async () => {
      resolveLoad({ data: { ui_prefs: { tabOverflow: ['fromCloud'], cardOpen: {}, showUnscheduled: true } } });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(getApi().prefs.tabOverflow).toEqual(['fromCloud']);
    expect(getApi().prefs.showUnscheduled).toBe(true);
    // No local edit happened, so nothing should have been flushed.
    expect(__mock.updateCalls.length).toBe(0);
  });
});
