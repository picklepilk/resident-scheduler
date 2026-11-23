import { useEffect, useMemo, useRef, useState } from 'react';
import RotationStrip, { fmtMD } from './RotationStrip.jsx';

// Edit one rotation: ER dates, typed obligation, per-segment shift counts, splits. Presentational:
// computeLedger(draftRot) is injected (lib/rotationLedger.js) and re-run on every draft change.

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';
const SOURCE_LABEL = { typed: 'typed', qgenda: 'QGenda', saved: 'saved block', auto: 'auto' };

const sameRange = (r, s) => r.start === s.start && r.end === s.end;

export default function RotationEditorModal({ rot, block, blocks, computeLedger, onSave, onClose, onFindInQgenda, specialtyLabel }) {
  const [draft, setDraft] = useState(() => ({ ...rot, ranges: [...(rot.ranges || [])], splits: [...(rot.splits || [])] }));
  const [splitInput, setSplitInput] = useState('');
  const [busyKey, setBusyKey] = useState(null);
  const [findMsg, setFindMsg] = useState('');
  const dialogRef = useRef(null);
  const firstRef = useRef(null);

  const ledger = useMemo(() => computeLedger(draft), [computeLedger, draft]);
  const segments = ledger?.segments || [];
  const title = `Rotation: ${specialtyLabel || rot.category || ''} PGY-${rot.pgy ?? '?'}`;

  useEffect(() => { firstRef.current?.focus(); }, []);

  const onKeyDown = e => {
    if (e.key === 'Escape') { e.stopPropagation(); onClose?.(); return; }
    if (e.key !== 'Tab') return;
    const els = [...(dialogRef.current?.querySelectorAll(FOCUSABLE) || [])];
    if (!els.length) return;
    const first = els[0], last = els[els.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };

  const setField = (k, v) => setDraft(d => ({ ...d, [k]: v }));
  const pinRange = (seg, count, source) => setDraft(d => {
    const rest = d.ranges.filter(r => !sameRange(r, seg));
    if (count == null) return { ...d, ranges: rest };
    return { ...d, ranges: [...rest, { start: seg.start, end: seg.end, count, source }] };
  });
  const onCount = (seg, raw) => {
    if (raw === '') return pinRange(seg, null);
    const n = Math.max(0, Math.floor(Number(raw)));
    if (Number.isFinite(n)) pinRange(seg, n, 'typed');
  };
  const onOwes = raw => setField('obligation', raw === '' ? null : Math.max(0, Math.floor(Number(raw)) || 0));
  const addSplit = () => {
    if (!splitInput || draft.splits.includes(splitInput)) return;
    setField('splits', [...draft.splits, splitInput].sort());
    setSplitInput('');
  };
  const removeSplit = s => setField('splits', draft.splits.filter(x => x !== s));
  const find = async seg => {
    if (!onFindInQgenda) return;
    const key = `${seg.start}|${seg.end}`;
    setBusyKey(key); setFindMsg('');
    try {
      const res = await onFindInQgenda(seg);
      if (res && Number.isFinite(res.count)) {
        setDraft(d => ({ ...d, ranges: [...d.ranges.filter(r => !sameRange(r, seg)), { start: seg.start, end: seg.end, count: res.count, source: 'qgenda', ...(res.slotLabel ? { slotLabel: res.slotLabel } : {}), ...(res.qgendaRunId ? { qgendaRunId: res.qgendaRunId } : {}) }] }));
        setFindMsg(`Found ${res.count} in QGenda for ${fmtMD(seg.start)} to ${fmtMD(seg.end)}${res.slotLabel ? ` (${res.slotLabel})` : ''}.`);
      } else setFindMsg(`Nothing found in QGenda for ${fmtMD(seg.start)} to ${fmtMD(seg.end)}.`);
    } catch { setFindMsg('QGenda lookup failed.'); }
    setBusyKey(null);
  };
  const reset = () => setDraft(d => ({ ...d, ranges: [], splits: [], obligation: null }));
  const valid = draft.start && draft.end && draft.end >= draft.start;

  return (
    <div className="tri-rot-scrim" onMouseDown={e => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div ref={dialogRef} className="tri-rot-modal" role="dialog" aria-modal="true" aria-label={title} onKeyDown={onKeyDown}>
        <div className="tri-card__band tri-rot-modal__head">
          <h2>{title}</h2>
          <button type="button" className="tri-rot-btn tri-rot-btn--ghost-dark" onClick={onClose} aria-label="Close">Close</button>
        </div>
        <div className="tri-rot-modal__body">
          <div className="tri-rot-fields">
            <label className="tri-rot-field">
              <span>ER start</span>
              <input ref={firstRef} type="date" value={draft.start || ''} onChange={e => setField('start', e.target.value)} />
            </label>
            <label className="tri-rot-field">
              <span>ER end</span>
              <input type="date" value={draft.end || ''} min={draft.start || undefined} onChange={e => setField('end', e.target.value)} />
            </label>
            <label className="tri-rot-field">
              <span>Owes</span>
              <span className="tri-rot-field__row">
                <input type="number" min="0" inputMode="numeric" className="tri-rot-num" value={draft.obligation ?? ''}
                  placeholder={ledger ? String(ledger.base) : ''} onChange={e => onOwes(e.target.value)} />
                <span className="tri-rot-muted">(auto {ledger?.base ?? 0})</span>
              </span>
            </label>
          </div>
          {!valid && <p className="tri-rot-warn" role="alert">ER end must be on or after ER start.</p>}

          <div className="tri-rot-preview"><RotationStrip ledger={ledger} placedHere={0} block={block} /></div>
          {ledger?.cannotFit > 0 && (
            <p className="tri-rot-warn" role="alert">{ledger.cannotFit} shift{ledger.cannotFit === 1 ? '' : 's'} cannot fit in the days available in this block.</p>
          )}

          <h3 className="tri-rot-h3">Shifts by range</h3>
          <div className="tri-rot-segs" role="table" aria-label="Shifts by range">
            <div className="tri-rot-segs__head" role="row">
              <span role="columnheader">Range</span><span role="columnheader">Days</span><span role="columnheader">Shifts</span><span role="columnheader">Source</span>
            </div>
            {segments.map(seg => {
              const key = `${seg.start}|${seg.end}`;
              const pinned = seg.source && seg.source !== 'auto';
              return (
                <div className="tri-rot-segs__row" role="row" key={key}>
                  <span role="cell" className="tri-rot-segs__range">
                    {fmtMD(seg.start)} to {fmtMD(seg.end)}
                    <em className="tri-rot-where">{seg.where === 'before' ? 'before this block' : seg.where === 'after' ? 'after this block' : 'this block'}</em>
                  </span>
                  <span role="cell" className="tri-rot-mono">{seg.days}</span>
                  <span role="cell" className="tri-rot-segs__count">
                    <input type="number" min="0" inputMode="numeric" className="tri-rot-num" aria-label={`Shifts ${fmtMD(seg.start)} to ${fmtMD(seg.end)}`}
                      value={pinned ? seg.count : ''} placeholder={String(seg.count ?? 0)} onChange={e => onCount(seg, e.target.value)} />
                    {!pinned && <span className="tri-rot-muted">auto</span>}
                  </span>
                  <span role="cell" className="tri-rot-segs__src">
                    {pinned && <span className="tri-rot-chip">{SOURCE_LABEL[seg.source] || seg.source}</span>}
                    {seg.where === 'before' && onFindInQgenda && (
                      <button type="button" className="tri-rot-btn" disabled={busyKey === key} onClick={() => find(seg)}>
                        {busyKey === key ? 'Looking' : 'Find in QGenda'}
                      </button>
                    )}
                  </span>
                </div>
              );
            })}
            {segments.length === 0 && <p className="tri-rot-muted tri-rot-pad">No ranges. Set ER start and end.</p>}
          </div>
          <p className="tri-rot-muted" aria-live="polite">{findMsg}</p>

          <div className="tri-rot-splits">
            <div className="tri-rot-field__row">
              <input type="date" aria-label="Split date" value={splitInput} min={draft.start || undefined} max={draft.end || undefined} onChange={e => setSplitInput(e.target.value)} />
              <button type="button" className="tri-rot-btn" onClick={addSplit} disabled={!splitInput}>+ Split a range</button>
            </div>
            {draft.splits.length > 0 && (
              <ul className="tri-rot-splitlist">
                {draft.splits.map(s => (
                  <li key={s}>
                    <span className="tri-rot-mono">New range starts {fmtMD(s)}</span>
                    <button type="button" className="tri-rot-btn" onClick={() => removeSplit(s)} aria-label={`Remove split at ${fmtMD(s)}`}>Remove</button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <div className="tri-rot-modal__foot">
          <button type="button" className="tri-rot-btn" onClick={reset}>Reset to auto</button>
          <span className="tri-rot-spacer" />
          <button type="button" className="tri-rot-btn" onClick={onClose}>Cancel</button>
          <button type="button" className="tri-rot-btn tri-rot-btn--primary" disabled={!valid} onClick={() => onSave?.(draft)}>Save rotation</button>
        </div>
      </div>
    </div>
  );
}
