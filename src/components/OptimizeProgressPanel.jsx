import React from 'react'; // classic JSX runtime under vitest (no react plugin there)
import { Check } from 'lucide-react';
import { describeOptimizeProgress, agoText } from '../lib/optimizeProgress.js';

// Live "where is the solver" tracker for an Optimize job (props only, no fetching).
// tracker: trackOptimizeProgress() state or null; status: job status string;
// elapsedFallback/budgetFallback: client-side clock + budget used before the first progress poll;
// now: ms timestamp (re-render tick).
const mmss = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

// Optional extras (all absent on hosts without the matching feature, so the old look is unchanged):
// trend: { state, text } from describeTrend ("Still improving..."); live: [{ key, text }] from liveComparison
// (current best grid vs the start); wrappingUp: Stop-and-keep-best was pressed; autoStop: run ends by itself
// when it levels off.
export default function OptimizeProgressPanel({ tracker, status, elapsedFallback = 0, budgetFallback = 0, now = Date.now(), trend = null, live = null, wrappingUp = false, autoStop = false, stopped = false }) {
  const d = describeOptimizeProgress(tracker, status, { elapsedFallback, budgetFallback });
  const ago = agoText(tracker?.lastImprovedAt, now);
  const improvements = tracker?.improvements || 0;
  return (
    <div className="basis-full" data-testid="optimize-progress">
      <ol className="flex flex-wrap gap-1.5" aria-label="Optimize steps">
        {d.steps.map((s, i) => (
          <li key={s.key} title={s.detail}
            aria-current={s.state === 'current' ? 'step' : undefined}
            className={`tri-node flex items-center gap-1.5 px-2 py-1 text-xs ${s.state === 'current' ? 'tri-node--active font-semibold' : s.state === 'pending' ? 'tri-node--idle' : ''}`}>
            <span className="inline-flex items-center justify-center w-4 h-4 rounded-full text-[10px] flex-none"
              style={s.state === 'done'
                ? { background: 'var(--signal)', color: '#fff' }
                : s.state === 'current'
                ? { border: '1.5px solid var(--signal)', color: 'var(--signal)' }
                : { border: '1px solid hsl(var(--border))', color: 'hsl(var(--muted-foreground))' }}>
              {s.state === 'done' ? <Check size={10} strokeWidth={3}/> : i + 1}
            </span>
            {s.label}
          </li>
        ))}
      </ol>
      <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-xs">
        <span className="font-medium text-foreground">{d.stepText}</span>
        {d.current && status !== 'done' && <span className="text-muted-foreground">{d.current.detail}</span>}
      </div>
      <div className="mt-1.5 h-1.5 w-full rounded-full overflow-hidden" style={{ background: 'hsl(var(--muted))' }}
        role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={d.pct} aria-label="Time used">
        <div className="h-full rounded-full" style={{ width: `${status === 'done' ? 100 : d.pct}%`, background: 'var(--signal)', transition: 'width 1s linear' }}/>
      </div>
      <div className="mt-1 flex flex-wrap gap-x-3 text-[11px] text-muted-foreground">
        <span>{mmss(d.elapsed)} of {mmss(d.budget)}</span>
        <span>{improvements === 0 ? 'No better schedule found yet' : `${improvements} improvement${improvements === 1 ? '' : 's'} found`}{ago ? ` · last ${ago}` : ''}</span>
        {stopped ? <span data-testid="optimize-stopped-early">Stopped early: kept the best schedule found so far.</span>
          : d.finishedEarly && <span>Finished early: the solver proved it could not do better on these steps.</span>}
      </div>
      {wrappingUp && status !== 'done' && (
        <div className="mt-1 text-xs font-medium tri-optimize-note" data-testid="optimize-wrapping-up" role="status">Wrapping up... keeping the best schedule found so far.</div>
      )}
      {!wrappingUp && autoStop && status !== 'done' && (
        <div className="mt-1 text-[11px] text-muted-foreground" data-testid="optimize-autostop-note">This run stops by itself when the schedule stops getting better.</div>
      )}
      {trend && status !== 'done' && !wrappingUp && (
        <div className={`mt-1 text-xs tri-optimize-trend tri-optimize-trend--${trend.state}`} data-testid="optimize-trend">{trend.text}</div>
      )}
      {Array.isArray(live) && live.length > 0 && status !== 'done' && (
        <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs tri-optimize-live" data-testid="optimize-live" aria-label="Best schedule so far, compared with where you started">
          {live.map(l => <li key={l.key}>{l.text}</li>)}
        </ul>
      )}
    </div>
  );
}
