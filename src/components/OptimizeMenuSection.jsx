import { optimizeBudgetOptions } from '../lib/optimizeFlow.js';

// Generate-menu section. Props only, no fetching.
// machines: [{name, status:'online'|'busy'|'offline'}]; machine: 'auto' or a machine name;
// budget: 'auto' | 5 | 10 | 15 | 30; budgetMinutes: number shown in the button (resolved by parent);
// disabledReason: string shown under the controls and disables the button; running: bool.
export default function OptimizeMenuSection({ machines = [], machine = 'auto', onMachineChange, budget = 'auto', onBudgetChange, budgetMinutes, disabledReason = '', running = false, onOptimize }) {
  const disabled = running || !!disabledReason;
  const mins = budgetMinutes != null ? budgetMinutes : (budget === 'auto' ? 5 : budget);
  const selectCls = 'w-full text-sm border border-gray-300 rounded-lg px-2 py-1.5 bg-white text-gray-800 min-h-[36px] focus-visible:outline focus-visible:outline-2';
  return (
    <div className="px-3 py-2 border-t border-gray-200" data-testid="optimize-menu-section">
      <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Optimize on a solver machine</div>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs text-gray-600">Machine
          <select className={selectCls} value={machine} onChange={e => onMachineChange?.(e.target.value)} disabled={running}>
            <option value="auto">Auto</option>
            {machines.map(m => (
              <option key={m.name} value={m.name} disabled={m.status === 'offline'}>
                {m.name}{m.status === 'busy' ? ' (busy)' : m.status === 'offline' ? ' (offline)' : ''}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-gray-600">Time
          <select className={selectCls} value={String(budget)} disabled={running}
            onChange={e => onBudgetChange?.(e.target.value === 'auto' ? 'auto' : Number(e.target.value))}>
            {optimizeBudgetOptions().map(o => <option key={String(o.value)} value={String(o.value)}>{o.label}</option>)}
          </select>
        </label>
      </div>
      {disabledReason && <p className="mt-2 text-xs text-gray-500" role="status">{disabledReason}</p>}
      <button type="button" onClick={() => onOptimize?.()} disabled={disabled}
        className="mt-2 w-full px-3 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
        style={{ outlineColor: 'var(--signal)' }}>
        {running ? 'Optimizing…' : `Optimize (${mins} min)`}
      </button>
    </div>
  );
}
