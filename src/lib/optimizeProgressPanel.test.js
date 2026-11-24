import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import OptimizeProgressPanel from '../components/OptimizeProgressPanel.jsx';

describe('OptimizeProgressPanel', () => {
  it('shows the current step, time and improvements', () => {
    const html = renderToStaticMarkup(createElement(OptimizeProgressPanel, {
      tracker: { stage: 5, stages: 6, elapsed: 75, budget: 300, improvements: 4, lastImprovedAt: 10_000 },
      status: 'running', now: 22_000,
    }));
    expect(html).toContain('Step 5 of 6: Fairness &amp; variety');
    expect(html).toContain('1:15 of 5:00');
    expect(html).toContain('4 improvements found · last 12 s ago');
    expect(html).toContain('aria-current="step"');
  });
  it('renders before the first progress poll', () => {
    const html = renderToStaticMarkup(createElement(OptimizeProgressPanel, { tracker: null, status: 'running', elapsedFallback: 5, budgetFallback: 300 }));
    expect(html).toContain('Starting');
    expect(html).toContain('No better schedule found yet');
  });
  it('says stopped early, not proved optimal, after a manual stop', () => {
    const tracker = { stage: 6, stages: 6, elapsed: 120, budget: 900, improvements: 3 };
    const stopped = renderToStaticMarkup(createElement(OptimizeProgressPanel, { tracker, status: 'done', stopped: true }));
    expect(stopped).toContain('Stopped early: kept the best schedule found so far.');
    expect(stopped).not.toContain('proved it could not do better');
    const proved = renderToStaticMarkup(createElement(OptimizeProgressPanel, { tracker, status: 'done' }));
    expect(proved).toContain('proved it could not do better');
    expect(proved).not.toContain('Stopped early');
  });
});
