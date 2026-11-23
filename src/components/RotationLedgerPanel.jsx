import { useState } from 'react';
import RotationStrip, { fmtMD } from './RotationStrip.jsx';
import RotationEditorModal from './RotationEditorModal.jsx';
import { demoBlock, demoBlocks, demoRows, demoComputeLedger } from './rotationLedgerDemo.js';

// Off-service rotation ledger for one block. Presentational: rows come from the parent
// ({ rot, ledger, placedHere, residentId, displayName, specialtyLabel }).

const GROUPS = [
  { id: 'before', title: 'Started before this block' },
  { id: 'inside', title: 'Inside this block' },
  { id: 'after', title: 'Continues after' },
  { id: 'ref', title: 'Not scheduled by us (reference)' },
];
const SOURCE_CHIP = { typed: 'Typed', qgenda: 'QGenda', saved: 'Saved block', estimated: 'Estimated', none: '—' };

export function groupOf(row, block) {
  const { rot } = row;
  if (!rot.scheduledByUs) return 'ref';
  const bs = block?.startDate ?? block?.start, be = block?.endDate ?? block?.end;
  if (bs && rot.start < bs) return 'before';
  if (be && rot.end > be) return 'after';
  return 'inside';
}

function statusOf(row) {
  const { ledger, placedHere, rot } = row;
  if (!rot.scheduledByUs) return { tone: 'none', text: '—' };
  if (ledger.cannotFit > 0) return { tone: 'warn', text: `Cannot fit ${ledger.cannotFit}` };
  const short = ledger.dueHere - placedHere;
  if (short > 0) return { tone: 'short', text: `Short ${short}` };
  return { tone: 'ok', text: 'On track' };
}

export default function RotationLedgerPanel({ rows = [], block, onEdit, onApplyRoster }) {
  const grouped = GROUPS.map(g => ({ ...g, rows: rows.filter(r => groupOf(r, block) === g.id) })).filter(g => g.rows.length);
  return (
    <section className="tri-card tri-rot-panel" aria-label="Rotation ledger">
      <div className="tri-card__band tri-rot-panel__band">
        <h2>Rotation ledger</h2>
        <span className="tri-rot-spacer" />
        {onApplyRoster && <button type="button" className="tri-rot-btn tri-rot-btn--ghost-dark" onClick={onApplyRoster}>Apply roster to this block</button>}
      </div>
      {rows.length === 0 ? (
        <p className="tri-rot-empty">No rotations loaded. Import the roster (Dashboard, Import Master Matrix) to track off-service obligations across blocks.</p>
      ) : (
        <div className="tri-rot-table" role="table" aria-label="Rotations">
          <div className="tri-rot-row tri-rot-row--head" role="row">
            {['Resident', 'Specialty', 'ER dates', 'Owes', 'Before', 'Here', 'After', 'Ledger', 'Source', 'Status', ''].map((h, i) => (
              <span key={i} role="columnheader">{h}</span>
            ))}
          </div>
          {grouped.map(g => (
            <div role="rowgroup" key={g.id}>
              <div className="tri-rot-group">{g.title}</div>
              {g.rows.map(row => {
                const { rot, ledger } = row;
                const st = statusOf(row);
                const isRef = g.id === 'ref';
                return (
                  <div className={`tri-rot-row${isRef ? ' tri-rot-row--ref' : ''}`} role="row" key={rot.id}>
                    <span role="cell" className="tri-rot-name" data-label="Resident">{row.displayName}<span className="tri-rot-muted"> PGY-{rot.pgy}</span></span>
                    <span role="cell" data-label="Specialty">{row.specialtyLabel}</span>
                    <span role="cell" className="tri-rot-mono" data-label="ER dates">{fmtMD(rot.start)} to {fmtMD(rot.end)}</span>
                    <span role="cell" className="tri-rot-mono" data-label="Owes">
                      {isRef ? '—' : ledger.obligation}{!isRef && ledger.obligationSource === 'typed' && <span className="tri-rot-chip tri-rot-chip--typed">typed</span>}
                    </span>
                    <span role="cell" className="tri-rot-mono" data-label="Before">{isRef ? '—' : ledger.doneBefore}</span>
                    <span role="cell" className="tri-rot-mono" data-label="Here">{isRef ? '—' : `${row.placedHere}/${ledger.dueHere}`}</span>
                    <span role="cell" className="tri-rot-mono" data-label="After">{isRef ? '—' : ledger.owedAfter}</span>
                    <span role="cell" className="tri-rot-cell-strip" data-label={isRef ? undefined : 'Ledger'}>{!isRef && <RotationStrip ledger={ledger} placedHere={row.placedHere} block={block} compact />}</span>
                    <span role="cell" data-label="Source">{isRef ? '—' : <span className="tri-rot-chip">{SOURCE_CHIP[ledger.doneBeforeSource] || '—'}</span>}</span>
                    <span role="cell" data-label="Status"><span className={`tri-rot-status tri-rot-status--${st.tone}`}>{st.text}</span></span>
                    <span role="cell" className="tri-rot-cell-edit">
                      <button type="button" className="tri-rot-btn" onClick={() => onEdit?.(rot)} aria-label={`Edit rotation for ${row.displayName}`}>Edit</button>
                    </span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// Dev-only visual check: panel plus an editor, all on invented data. Not wired into the app.
export function RotationLedgerPreview() {
  const [dark, setDark] = useState(false);
  const [editing, setEditing] = useState(demoRows()[0].rot);
  const [rows, setRows] = useState(() => demoRows());
  const [empty, setEmpty] = useState(false);
  const compute = rot => demoComputeLedger(rot, demoBlock);
  const find = async seg => { await new Promise(r => setTimeout(r, 250)); return seg.days > 3 ? { count: Math.max(1, Math.round(seg.days / 2)), slotLabel: 'Peds ED' } : null; };
  return (
    <div className={dark ? 'dark' : ''} style={{ background: 'hsl(var(--background))', color: 'hsl(var(--foreground))', minHeight: '100vh', padding: 16, fontFamily: 'var(--font-body)' }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <button type="button" className="tri-rot-btn" onClick={() => setDark(d => !d)}>{dark ? 'Light mode' : 'Dark mode'}</button>
        <button type="button" className="tri-rot-btn" onClick={() => setEmpty(e => !e)}>{empty ? 'Show rows' : 'Show empty state'}</button>
        <button type="button" className="tri-rot-btn" onClick={() => setEditing(rows[0].rot)}>Open editor</button>
      </div>
      <RotationLedgerPanel rows={empty ? [] : rows} block={demoBlock} onEdit={setEditing} onApplyRoster={() => {}} />
      {editing && (
        <RotationEditorModal rot={editing} block={demoBlock} blocks={demoBlocks} specialtyLabel={rows.find(r => r.rot.id === editing.id)?.specialtyLabel}
          computeLedger={compute} onFindInQgenda={find} onClose={() => setEditing(null)}
          onSave={d => { setRows(rs => rs.map(r => r.rot.id === d.id ? { ...r, rot: d, ledger: compute(d) } : r)); setEditing(null); }} />
      )}
    </div>
  );
}
