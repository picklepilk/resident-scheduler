import { useMemo } from 'react';
import { WalkthroughProvider, Walkthrough } from './Walkthrough';
import { WalkthroughWelcome } from './WalkthroughWelcome';
import { WALKTHROUGH_STEPS, filterStepsForRole } from './walkthroughSteps';

/**
 * Composition root mounted once, inside an authenticated shell — see the two mount sites:
 * ResidentScheduler.jsx (admin surface, `/`) and ResidentRequestsApp.jsx (resident surface,
 * `/requests`). Keeps each caller's own edit to a single wrap: this component owns the provider
 * tree, the welcome modal, and the tour card, so a caller only needs to pass down what it already
 * has in scope — the session, the viewer's role, and (tab-SPA callers only) the active tab setter.
 *
 * `steps` defaults to the admin tab set (`WALKTHROUGH_STEPS`) so ResidentScheduler.jsx's existing
 * call site needs no change; ResidentRequestsApp.jsx passes `RESIDENT_WALKTHROUGH_STEPS`
 * explicitly. `role` defaults to 'admin' by the ResidentScheduler.jsx caller when `viewer` is
 * absent (local dev fallback with auth disabled) — see walkthroughSteps.js's module doc for why
 * that's the only role that currently reaches that shell. `setActiveTab` is a no-op default:
 * ResidentRequestsApp.jsx is a single-flow page with no tabs, so its steps carry no `route`.
 */
export default function WalkthroughRoot({ session, role, steps: stepsProp = WALKTHROUGH_STEPS, setActiveTab = () => {}, children }) {
  const steps = useMemo(() => filterStepsForRole(stepsProp, role), [stepsProp, role]);

  return (
    <WalkthroughProvider steps={steps} onNavigate={setActiveTab}>
      {children}
      <WalkthroughWelcome session={session} />
      <Walkthrough />
    </WalkthroughProvider>
  );
}
