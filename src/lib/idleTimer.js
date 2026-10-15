// Pure idle-sign-out timer logic for shared-workstation hygiene (admin side only — see
// ResidentScheduler.jsx's wiring, gated on AUTH_ENABLED). Deliberately has no DOM/React/Supabase
// dependency so it can be unit-tested with fake timers; the component supplies callbacks and
// forwards real activity events into `notifyActivity()`.
//
// Shape: after `idleMs` of no activity, `onWarn` fires (giving the admin `warnMs` of runway —
// default 60s — to notice and click "Stay signed in"); if nothing resets the timer before idleMs
// elapses a second time (measured from the SAME last-activity point, not restarted at the warning),
// `onTimeout` fires. Any `notifyActivity()` call — including the "Stay signed in" button — cancels
// both pending timers and reschedules from now.
export const DEFAULT_IDLE_TIMEOUT_MINUTES = 30;
export const DEFAULT_IDLE_WARNING_SECONDS = 60;

export function createIdleTimer({
  idleMs = DEFAULT_IDLE_TIMEOUT_MINUTES * 60 * 1000,
  warnMs = DEFAULT_IDLE_WARNING_SECONDS * 1000,
  onWarn,
  onTimeout,
  setTimeoutFn = setTimeout,
  clearTimeoutFn = clearTimeout,
} = {}) {
  let warnTimer = null;
  let timeoutTimer = null;
  let active = false;

  function clearTimers() {
    if (warnTimer != null) { clearTimeoutFn(warnTimer); warnTimer = null; }
    if (timeoutTimer != null) { clearTimeoutFn(timeoutTimer); timeoutTimer = null; }
  }

  // warnMs >= idleMs would ask for a warning before idle is even reached — clamp so the warning
  // timer never fires after (or at the same time as) the timeout itself.
  const warnDelay = Math.max(0, idleMs - Math.min(warnMs, idleMs));

  function schedule() {
    clearTimers();
    if (!active) return;
    warnTimer = setTimeoutFn(() => { warnTimer = null; onWarn && onWarn(); }, warnDelay);
    timeoutTimer = setTimeoutFn(() => { timeoutTimer = null; onTimeout && onTimeout(); }, idleMs);
  }

  return {
    start() { active = true; schedule(); },
    stop() { active = false; clearTimers(); },
    // Any real user activity (mouse/key/touch/scroll) or an explicit "Stay signed in" click.
    notifyActivity() { if (active) schedule(); },
    isActive: () => active,
  };
}
