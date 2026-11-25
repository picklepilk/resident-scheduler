import React, { useEffect, useState } from 'react'; // classic JSX runtime under vitest
import { precheckLine } from '../lib/solverPrecheck.js';

// Information line in the Optimize menu: does the current grid pass the solver's hard rules?
// `run(signal)` resolves to a summary from summarizePrecheck (or null); it is called once, after a short
// debounce, while this component is mounted (mounted = menu open). Any failure shows nothing. Never blocks Optimize.
export default function OptimizePrecheckLine({ run, delayMs = 500 }) {
  const [summary, setSummary] = useState(null);
  useEffect(() => {
    const ctl = new AbortController();
    const t = setTimeout(() => {
      Promise.resolve().then(() => run?.(ctl.signal)).then(s => { if (!ctl.signal.aborted) setSummary(s || null); }).catch(() => {});
    }, delayMs);
    return () => { clearTimeout(t); ctl.abort(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const text = precheckLine(summary);
  if (!text) return null;
  return (
    <p className={`px-3 py-1.5 border-t border-gray-200 text-xs ${summary.ok ? 'text-gray-600' : 'text-amber-700'}`} role="status" data-testid="optimize-precheck">{text}</p>
  );
}
