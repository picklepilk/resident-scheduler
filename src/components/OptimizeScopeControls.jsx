import React, { useState } from 'react'; // classic JSX runtime under vitest

// "Only part of the block" disclosure inside the Optimize menu. Controlled, presentational.
// value: { from, to, residentIds } (raw selection, normalized by the parent with normalizeScope);
// block: { startDate, endDate }; residents: [{ id, label, group? }]; onChange(nextValue).
// Nothing selected = the whole block, exactly as before.

export const EMPTY_SCOPE_SELECTION = { from: '', to: '', residentIds: [] };

export function toggleResident(value, id) {
  const cur = Array.isArray(value?.residentIds) ? value.residentIds : [];
  const residentIds = cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id];
  return { ...EMPTY_SCOPE_SELECTION, ...value, residentIds };
}
export function setScopeDate(value, key, iso) {
  return { ...EMPTY_SCOPE_SELECTION, ...value, [key]: iso || '' };
}
export function setAllResidents(value, residents, on) {
  return { ...EMPTY_SCOPE_SELECTION, ...value, residentIds: on ? residents.map(r => r.id) : [] };
}
export function filterResidents(residents, text) {
  const q = String(text || '').trim().toLowerCase();
  return q ? residents.filter(r => String(r.label || '').toLowerCase().includes(q)) : residents;
}

export default function OptimizeScopeControls({ value, onChange, block, residents = [], disabled = false }) {
  const [filter, setFilter] = useState('');
  const v = { ...EMPTY_SCOPE_SELECTION, ...(value || {}) };
  const chosen = new Set(v.residentIds);
  const shown = filterResidents(residents, filter);
  const groups = [];
  for (const r of shown) {
    const g = r.group || '';
    let grp = groups.find(x => x.name === g);
    if (!grp) { grp = { name: g, items: [] }; groups.push(grp); }
    grp.items.push(r);
  }
  const dateCls = 'min-w-0 flex-1 text-xs border border-gray-300 rounded-lg px-1.5 py-1 bg-white text-gray-800 min-h-[32px]';
  const linkCls = 'text-xs underline text-gray-600 hover:text-gray-900 focus-visible:outline focus-visible:outline-2';
  const active = !!(v.from || v.to || v.residentIds.length);
  return (
    <details className="mt-2 text-xs text-gray-700" data-testid="optimize-scope" open={active || undefined}>
      <summary className="cursor-pointer font-medium text-gray-700 min-h-[32px] flex items-center">
        Only part of the block{active ? ' (selected)' : ''}
      </summary>
      <div className="mt-1 space-y-2">
        <p className="text-gray-500">Optimize changes only the dates and residents you pick here. Everything else stays as it is. Leave empty for the whole block.</p>
        <div className="flex items-center gap-1">
          <input type="date" aria-label="Scope start date" value={v.from} min={block?.startDate} max={block?.endDate} disabled={disabled}
            onChange={e => onChange?.(setScopeDate(v, 'from', e.target.value))} className={dateCls}/>
          <span className="text-gray-400">to</span>
          <input type="date" aria-label="Scope end date" value={v.to} min={block?.startDate} max={block?.endDate} disabled={disabled}
            onChange={e => onChange?.(setScopeDate(v, 'to', e.target.value))} className={dateCls}/>
        </div>
        <div>
          <div className="flex items-center gap-2 mb-1">
            <input type="text" aria-label="Filter residents" placeholder="Filter residents" value={filter} disabled={disabled}
              onChange={e => setFilter(e.target.value)} className="min-w-0 flex-1 text-xs border border-gray-300 rounded-lg px-1.5 py-1 bg-white text-gray-800 min-h-[32px]"/>
            <button type="button" className={linkCls} disabled={disabled} onClick={() => onChange?.(setAllResidents(v, shown, true))}>All</button>
            <button type="button" className={linkCls} disabled={disabled} onClick={() => onChange?.(setAllResidents(v, residents, false))}>None</button>
          </div>
          <div className="max-h-40 overflow-y-auto border border-gray-200 rounded-lg px-2 py-1" data-testid="optimize-scope-residents">
            {groups.length === 0 && <div className="text-gray-500 py-1">No residents match.</div>}
            {groups.map(g => (
              <div key={g.name || '_'}>
                {g.name && <div className="mt-1 font-semibold text-gray-500">{g.name}</div>}
                {g.items.map(r => (
                  <label key={r.id} className="flex items-center gap-2 py-1 min-h-[28px]">
                    <input type="checkbox" checked={chosen.has(r.id)} disabled={disabled} onChange={() => onChange?.(toggleResident(v, r.id))}/>
                    <span className="truncate">{r.label}</span>
                  </label>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </details>
  );
}
