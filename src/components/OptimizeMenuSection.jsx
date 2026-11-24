import React from 'react'; // classic JSX runtime under vitest (no react plugin there)
import { optimizeBudgetOptions, optimizeButtonLabel, BUDGET_LEVEL_OFF, BUDGET_LONG } from '../lib/optimizeFlow.js';

// Generate-menu section. Props only, no fetching.
// machines: [{name, status:'online'|'busy'|'offline'}]; machine: 'auto' or a machine name;
// budget: 'auto' | 5 | 10 | 15 | 30 | 'leveloff' | 'long' (the last two only when caps lists them);
// caps: { stop, longRun } what the chosen machine's /health `features` offer (absent = {} = old menu); budgetMinutes: number shown in the button (resolved by parent);
// bestOf: null | { label, extraName, extraChecked, onExtraChange } adds the "Best of" machine option (+ optional third-machine tick-box);
// disabledReason: string shown under the controls and disables the button; running: bool.
export default function OptimizeMenuSection({ machines = [], machine = 'auto', onMachineChange, budget = 'auto', onBudgetChange, budgetMinutes, disabledReason = '', running = false, onOptimize, bestOf = null, caps = {} }) {
  const disabled = running || !!disabledReason;
  const mins = budgetMinutes != null ? budgetMinutes : (budget === 'auto' ? 5 : budget);
  const shownBudget = (budget === BUDGET_LEVEL_OFF && !caps.stop) || (budget === BUDGET_LONG && !caps.longRun) ? 'auto' : budget;
  const selectCls = 'w-full text-sm border border-gray-300 rounded-lg px-2 py-1.5 bg-white text-gray-800 min-h-[36px] focus-visible:outline focus-visible:outline-2';
  return (
    <div className="px-3 py-2 border-t border-gray-200" data-testid="optimize-menu-section">
      <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Optimize on a solver machine</div>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs text-gray-600">Machine
          <select className={selectCls} value={machine} onChange={e => onMachineChange?.(e.target.value)} disabled={running}>
            <option value="auto">Auto</option>
            {bestOf && <option value="best-of">{bestOf.label}</option>}
            {machines.map(m => (
              <option key={m.name} value={m.name} disabled={m.status === 'offline'}>
                {m.name}{m.status === 'busy' ? ' (busy)' : m.status === 'offline' ? ' (offline)' : ''}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-gray-600">Time
          <select className={selectCls} value={String(shownBudget)} disabled={running}
            onChange={e => onBudgetChange?.(isNaN(Number(e.target.value)) ? e.target.value : Number(e.target.value))}>
            {optimizeBudgetOptions(caps).map(o => <option key={String(o.value)} value={String(o.value)}>{o.label}</option>)}
          </select>
        </label>
      </div>
      {bestOf && machine === 'best-of' && (
        <div className="mt-2 text-xs text-gray-600">
          <p>Runs on both machines at once with different seeds and keeps the better result.</p>
          {bestOf.extraName && (
            <label className="mt-1 flex items-center gap-2">
              <input type="checkbox" checked={!!bestOf.extraChecked} disabled={running} onChange={e => bestOf.onExtraChange?.(e.target.checked)}/>
              Also use {bestOf.extraName}
            </label>
          )}
        </div>
      )}
      {shownBudget === BUDGET_LEVEL_OFF && (
        <p className="mt-2 text-xs text-gray-600" data-testid="budget-hint-leveloff">Stops by itself once the schedule has stopped getting better, after 15 minutes at most.</p>
      )}
      {shownBudget === BUDGET_LONG && (
        <p className="mt-2 text-xs text-gray-600" data-testid="budget-hint-long">Meant to be left running, for example overnight. It keeps running on the solver machine. Open the Schedule tab on this device later and the result will be waiting for you (kept 24 hours).</p>
      )}
      {disabledReason && <p className="mt-2 text-xs text-gray-500" role="status">{disabledReason}</p>}
      <button type="button" onClick={() => onOptimize?.()} disabled={disabled}
        className="mt-2 w-full px-3 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
        style={{ outlineColor: 'var(--signal)' }}>
        {running ? 'Optimizing…' : optimizeButtonLabel(shownBudget, mins)}
      </button>
    </div>
  );
}
