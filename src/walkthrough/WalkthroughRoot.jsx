import { useMemo } from 'react';
import { WalkthroughProvider, Walkthrough } from './Walkthrough';
import { WalkthroughWelcome } from './WalkthroughWelcome';
import { WALKTHROUGH_STEPS, filterStepsForRole } from './walkthroughSteps';

/**
 * Composition root mounted once, inside the authenticated shell — see the mount site in
 * ResidentScheduler.jsx. Keeps that ~17k-line file's own edit to a single wrap: this component
 * owns the provider tree, the welcome modal, and the tour card, so `ResidentScheduler.jsx` only
 * needs to pass down the four things it already has in scope (`viewer.session`, `viewer.role`,
 * the active tab, and its setter).
 *
 * `role` defaults to 'admin' by the caller when `viewer` is absent (local dev fallback with auth
 * disabled) — see walkthroughSteps.js's module doc for why that's the only role that currently
 * reaches this shell.
 */
export default function WalkthroughRoot({ session, role, setActiveTab, children }) {
  const steps = useMemo(() => filterStepsForRole(WALKTHROUGH_STEPS, role), [role]);

  return (
    <WalkthroughProvider steps={steps} onNavigate={setActiveTab}>
      {children}
      <WalkthroughWelcome session={session} />
      <Walkthrough />
    </WalkthroughProvider>
  );
}
