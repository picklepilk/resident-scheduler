import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createIdleTimer, DEFAULT_IDLE_TIMEOUT_MINUTES, DEFAULT_IDLE_WARNING_SECONDS } from './idleTimer.js';

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe('createIdleTimer', () => {
  it('fires onWarn warnMs before idleMs, then onTimeout at idleMs, when never started again', () => {
    const onWarn = vi.fn();
    const onTimeout = vi.fn();
    const timer = createIdleTimer({ idleMs: 10000, warnMs: 2000, onWarn, onTimeout });
    timer.start();

    vi.advanceTimersByTime(7999);
    expect(onWarn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onWarn).toHaveBeenCalledTimes(1);
    expect(onTimeout).not.toHaveBeenCalled();

    vi.advanceTimersByTime(2000);
    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  it('notifyActivity cancels and reschedules both timers from now', () => {
    const onWarn = vi.fn();
    const onTimeout = vi.fn();
    const timer = createIdleTimer({ idleMs: 10000, warnMs: 2000, onWarn, onTimeout });
    timer.start();

    vi.advanceTimersByTime(7000);
    timer.notifyActivity(); // resets — warn should now be 8s away again, not 1s
    vi.advanceTimersByTime(7999);
    expect(onWarn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onWarn).toHaveBeenCalledTimes(1);
  });

  it('"Stay signed in" (notifyActivity during the warning window) cancels the pending timeout', () => {
    const onWarn = vi.fn();
    const onTimeout = vi.fn();
    const timer = createIdleTimer({ idleMs: 10000, warnMs: 2000, onWarn, onTimeout });
    timer.start();

    vi.advanceTimersByTime(8500); // past the warning
    expect(onWarn).toHaveBeenCalledTimes(1);
    timer.notifyActivity(); // original timeout (due at t=10000, i.e. 1500ms from here) is cancelled

    vi.advanceTimersByTime(1500); // the original timeout's would-be fire time
    expect(onTimeout).not.toHaveBeenCalled();
  });

  it('stop() cancels pending timers and notifyActivity after stop is a no-op', () => {
    const onWarn = vi.fn();
    const onTimeout = vi.fn();
    const timer = createIdleTimer({ idleMs: 10000, warnMs: 2000, onWarn, onTimeout });
    timer.start();
    timer.stop();
    expect(timer.isActive()).toBe(false);

    vi.advanceTimersByTime(20000);
    expect(onWarn).not.toHaveBeenCalled();
    expect(onTimeout).not.toHaveBeenCalled();

    timer.notifyActivity();
    vi.advanceTimersByTime(20000);
    expect(onWarn).not.toHaveBeenCalled();
    expect(onTimeout).not.toHaveBeenCalled();
  });

  it('clamps warnMs so it never pushes the warning past the timeout itself', () => {
    const onWarn = vi.fn();
    const onTimeout = vi.fn();
    // warnMs > idleMs — should not throw, and should still fire onTimeout at idleMs.
    const timer = createIdleTimer({ idleMs: 1000, warnMs: 5000, onWarn, onTimeout });
    timer.start();
    vi.advanceTimersByTime(1000);
    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  it('exports sane defaults (30 min idle, 60s warning)', () => {
    expect(DEFAULT_IDLE_TIMEOUT_MINUTES).toBe(30);
    expect(DEFAULT_IDLE_WARNING_SECONDS).toBe(60);
  });
});
