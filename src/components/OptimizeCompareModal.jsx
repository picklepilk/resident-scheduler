import React, { useEffect, useRef, useState } from 'react'; // React in scope for the classic JSX runtime under vitest
import { formatQualityValue } from '../lib/optimizeFlow.js';

// Before/after compare for "Optimize on a solver machine". Presentational only: the parent computes
// rows (compareQuality) and diff (diffSchedules) from src/lib/optimizeFlow.js. Markup mirrors the
// bestOf (optional): { line, machines: [{machine, gapPct, rank, vector:[...]}] } from pickBestOfMachines for "Best of" runs.
// ResidentScheduler `Modal` primitive (scrim bg-black/50, full-screen sheet below sm:, role=dialog).

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function toneClass(better) {
  if (better === true) return 'text-green-700 font-semibold';
  if (better === false) return 'text-red-700 font-semibold';
  return 'text-gray-500';
}

function CellList({ title, items, render, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  const n = items.length;
  return (
    <div className="mt-3">
      <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open} disabled={n === 0}
        className="text-sm font-semibold text-gray-800 disabled:text-gray-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 rounded"
        style={{ outlineColor: 'var(--signal)' }}>
        {n > 0 ? (open ? '▾ ' : '▸ ') : ''}{title} ({n})
      </button>
      {open && n > 0 && (
        <ul className="mt-1 max-h-48 overflow-y-auto text-xs text-gray-700 border border-gray-200 rounded divide-y divide-gray-100">
          {items.map((it, i) => <li key={i} className="px-2 py-1">{render(it)}</li>)}
        </ul>
      )}
    </div>
  );
}

export default function OptimizeCompareModal({ open, machineName, rows = [], diff, remainingErrors = [], bestOf = null, stoppedEarly = null, residentName = id => id, shiftLabel = id => id, onAccept, onDiscard }) {
  const dialogRef = useRef(null);
  const acceptRef = useRef(null);
  const onDiscardRef = useRef(onDiscard);
  onDiscardRef.current = onDiscard;

  useEffect(() => {
    if (!open) return undefined;
    const prev = typeof document !== 'undefined' ? document.activeElement : null;
    acceptRef.current?.focus();
    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); onDiscardRef.current?.(); return; }
      if (e.key !== 'Tab' || !dialogRef.current) return;
      const els = Array.from(dialogRef.current.querySelectorAll(FOCUSABLE));
      if (!els.length) { e.preventDefault(); return; }
      const first = els[0], last = els[els.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !dialogRef.current.contains(active))) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (active === last || !dialogRef.current.contains(active))) { e.preventDefault(); first.focus(); }
    }
    document.addEventListener('keydown', onKey, true);
    return () => { document.removeEventListener('keydown', onKey, true); try { prev?.focus?.(); } catch { /* ignore */ } };
  }, [open]);

  if (!open) return null;
  const d = diff || { added: [], removed: [], changed: [], kept: 0, total: 0 };
  const title = `Optimized on ${machineName || 'solver machine'}`;
  const nErr = remainingErrors.length;
  const cellRow = c => `${residentName(c.residentId)} · ${c.date} · ${shiftLabel(c.shiftId)}`;
  const removed = [...d.removed, ...d.changed.map(c => ({ residentId: c.residentId, date: c.date, shiftId: c.from }))];
  const added = [...d.added, ...d.changed.map(c => ({ residentId: c.residentId, date: c.date, shiftId: c.to }))];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center sm:p-4 z-50">
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-label={title}
        className="bg-white shadow-2xl flex flex-col w-full h-full max-h-[100dvh] rounded-none sm:h-auto sm:max-h-[90vh] sm:rounded-xl sm:w-full sm:max-w-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 shrink-0">
          <h2 className="text-base font-semibold text-gray-800">{title}</h2>
        </div>
        <div className="overflow-y-auto flex-1 px-5 py-4">
          {stoppedEarly && (
            <div className="mb-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700" data-testid="stopped-early">
              {stoppedEarly}. This is the best schedule found up to that point.
            </div>
          )}
          {bestOf?.line && (
            <div className="mb-3 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800" data-testid="best-of-line">
              <div className="font-semibold">{bestOf.line}</div>
              {Array.isArray(bestOf.machines) && bestOf.machines.length > 1 && (
                <table className="mt-1 w-full text-xs">
                  <thead><tr className="text-left text-blue-700"><th className="font-medium">Machine</th><th className="font-medium text-right">Errors</th><th className="font-medium text-right">Warnings</th><th className="font-medium text-right">Coverage</th><th className="font-medium text-right">Behind</th></tr></thead>
                  <tbody>
                    {bestOf.machines.map(m => (
                      <tr key={m.machine} className="border-t border-blue-100">
                        <td className="py-0.5">{m.machine}{m.rank === 0 ? ' (won)' : ''}</td>
                        {[0, 1, 2].map(i => <td key={i} className="py-0.5 text-right tabular-nums">{formatQualityValue(m.vector?.[i] ?? 0)}</td>)}
                        <td className="py-0.5 text-right tabular-nums">{m.rank === 0 ? '-' : m.gapPct === 0 ? 'tied' : `${formatQualityValue(m.gapPct)}%`}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
          <div className="text-sm font-semibold text-gray-800 mb-1">Current {'→'} Optimized <span className="font-normal text-gray-500">(lower is better)</span></div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500">
                <th className="py-1 font-medium">Measure</th>
                <th className="py-1 font-medium text-right">Current</th>
                <th className="py-1 font-medium text-right">Optimized</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.key} data-better={String(r.better)} className="border-t border-gray-100">
                  <td className="py-1 text-gray-700">{r.label}</td>
                  <td className="py-1 text-right tabular-nums text-gray-700">{formatQualityValue(r.before)}</td>
                  <td className={`py-1 text-right tabular-nums ${toneClass(r.better)}`}>
                    {formatQualityValue(r.after)}{r.better === true ? ' ✓' : r.better === false ? ' ✗' : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <CellList title="Removed" items={removed} render={cellRow} />
          <CellList title="Added" items={added} render={cellRow} />
          <p className="mt-2 text-sm text-gray-600">Kept {d.kept} of {d.total} current shifts.</p>

          {nErr > 0 && (
            <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              <div className="font-semibold">Why {nErr} {nErr === 1 ? 'error remains' : 'errors remain'}</div>
              <ul className="mt-1 list-disc pl-5 text-xs">
                {remainingErrors.slice(0, 5).map((m, i) => <li key={i}>{m}</li>)}
              </ul>
              {nErr > 5 && <div className="mt-1 text-xs">+{nErr - 5} more</div>}
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 px-5 py-3 border-t border-gray-200 shrink-0">
          <button type="button" onClick={() => onDiscard?.()}
            className="px-4 py-2 text-sm rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 min-h-[44px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{ outlineColor: 'var(--signal)' }}>Discard</button>
          <button type="button" ref={acceptRef} onClick={() => onAccept?.()}
            className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 min-h-[44px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{ outlineColor: 'var(--signal)' }}>Accept</button>
        </div>
      </div>
    </div>
  );
}
