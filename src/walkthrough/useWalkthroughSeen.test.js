/** @vitest-environment jsdom */
// markSeen must merge into the CURRENT user_metadata (fresh getUser), not the mount-time copy.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { useWalkthroughSeen } from './useWalkthroughSeen';
import { APP_KEY } from './walkthroughSteps';

const auth = vi.hoisted(() => ({ getUser: vi.fn(), updateUser: vi.fn() }));
vi.mock('../supabaseClient', () => ({ supabase: { auth } }));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function mount(session) {
  const container = document.createElement('div');
  let api;
  function Harness() {
    api = useWalkthroughSeen(session);
    return null;
  }
  act(() => { createRoot(container).render(React.createElement(Harness)); });
  return () => api;
}

const SESSION = { user: { user_metadata: { walkthrough_seen: { 'other-app': true } } } };

beforeEach(() => {
  auth.getUser.mockReset();
  auth.updateUser.mockReset().mockResolvedValue({});
  try { localStorage.clear(); } catch { /* ignore */ }
});

describe('useWalkthroughSeen.markSeen', () => {
  it('merges into the freshly fetched metadata so a sibling flag set after sign-in survives', async () => {
    auth.getUser.mockResolvedValue({ data: { user: { user_metadata: { walkthrough_seen: { 'other-app': true, 'newer-app': true } } } }, error: null });
    const get = mount(SESSION);
    await act(async () => { await get().markSeen(); });
    expect(auth.updateUser).toHaveBeenCalledWith({ data: { walkthrough_seen: { 'other-app': true, 'newer-app': true, [APP_KEY]: true } } });
  });

  it('falls back to the session metadata when the fresh read fails', async () => {
    auth.getUser.mockResolvedValue({ data: null, error: { message: 'nope' } });
    const get = mount(SESSION);
    await act(async () => { await get().markSeen(); });
    expect(auth.updateUser).toHaveBeenCalledWith({ data: { walkthrough_seen: { 'other-app': true, [APP_KEY]: true } } });
  });
});
