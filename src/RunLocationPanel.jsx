import React from 'react';
import { describeRunLocation, loadFraction } from './lib/runLocation.js';

// Tiny route diagram: [This tab] → [where the heavy compute actually is]. The active hop pulses;
// the optimizer node turns green only once the solver itself has reported its host (verified).
// Props: stage 'builtin' | 'solver' | 'idle'; claim 'this-computer' | 'cloud'; runner = latest
// progress.runner / health.runner; jobsMode for the pre-report label.
export default function RunLocationPanel({ stage, claim, runner, jobsMode }) {
  const tab = describeRunLocation({ claim: 'browser' });
  const opt = stage === 'solver' ? describeRunLocation({ claim, runner, jobsMode }) : null;
  const load = opt?.runner ? loadFraction(opt.runner) : null;
  const node = (active, tone, title, detail) => (
    <div className={`flex-1 min-w-0 rounded-md border px-2 py-1.5 ${active ? 'border-primary bg-primary/10' : 'border-border bg-muted/40 opacity-60'}`}>
      <div className="flex items-center gap-1.5 text-xs font-medium text-foreground">
        <span className={`inline-block h-2 w-2 flex-none rounded-full ${tone} ${active ? 'animate-pulse motion-reduce:animate-none' : ''}`}/>
        <span className="truncate">{title}</span>
      </div>
      {detail && <div className="text-[11px] text-muted-foreground truncate">{detail}</div>}
    </div>
  );
  return (
    <div className="w-full" aria-label="Where the computation is running">
      <div className="flex items-stretch gap-2">
        {node(stage === 'builtin', 'bg-sky-500', tab.title, stage === 'builtin' ? 'Computing here now' : 'Built-in pass')}
        <span className="self-center text-muted-foreground" aria-hidden="true">→</span>
        {opt
          ? node(true, opt.verified ? 'bg-green-500' : 'bg-amber-500', opt.title, opt.verified ? `✓ verified · ${opt.detail}` : opt.detail)
          : node(false, 'bg-muted-foreground', claim === 'this-computer' ? 'This computer' : 'Cloud optimizer', 'Not started')}
      </div>
      {load !== null && (
        <div className="mt-1.5" title={`Load average (1 min): ${opt.runner.load1} on ${opt.runner.cpus} cores`}>
          <div className="h-1 rounded-full bg-muted overflow-hidden">
            <div className="h-full rounded-full bg-green-500 transition-[width] duration-500" style={{ width: Math.round(load * 100) + '%' }}/>
          </div>
          <div className="text-[10px] text-muted-foreground font-mono">host load {Math.round(load * 100)}% · pid {opt.runner.pid}</div>
        </div>
      )}
      {opt?.warning && <div className="mt-1 text-[11px] text-amber-600">{opt.warning}</div>}
    </div>
  );
}
