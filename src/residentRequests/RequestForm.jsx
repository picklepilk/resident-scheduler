import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { fetchBlocksForLookup, fetchAyDataForLookup, findBlockForDate, weeksUntil } from './blockLookup';
import { holidayNameForDateAnyAy } from '../lib/holidays.js';

const CUTOFF_WEEKS = 8;

export default function RequestForm({ residentId, onSubmitted }) {
  const [blocks, setBlocks] = useState([]);
  const [ayData, setAyData] = useState({});
  const [dates, setDates] = useState(['']);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { fetchBlocksForLookup().then(setBlocks); }, []);
  // Separate from the blocks fetch on purpose: both go through the same cached-by-nobody
  // fetchResState call, but a failure in either must not take out the other's informational note.
  useEffect(() => { fetchAyDataForLookup().then(setAyData); }, []);

  const today = new Date().toISOString().slice(0, 10);
  const cutoffWarning = dates.some(d => {
    if (!d) return false;
    const block = findBlockForDate(d, blocks);
    return block && weeksUntil(today, block.startDate) < CUTOFF_WEEKS;
  });
  // Named holidays among the picked dates. Informational only — a holiday request is a perfectly
  // normal request and nothing here blocks or discourages submitting it; the resident just gets to
  // know the chief will be weighing it against year-to-date holiday coverage rather than treating
  // it as an ordinary day.
  const holidayHits = [...new Set(dates.filter(Boolean)
    .map(d => holidayNameForDateAnyAy(d, ayData)).filter(Boolean))];

  function updateDate(i, value) {
    setDates(prev => prev.map((d, idx) => idx === i ? value : d));
  }
  function addDateField() { setDates(prev => [...prev, '']); }
  function removeDateField(i) { setDates(prev => prev.filter((_, idx) => idx !== i)); }

  async function submit(e) {
    e.preventDefault();
    setError('');
    const cleaned = dates.filter(Boolean);
    if (cleaned.length === 0) { setError('Pick at least one date.'); return; }
    setBusy(true);
    const { error: insertError } = await supabase.from('day_off_requests').insert({
      resident_id: residentId,
      dates: cleaned,
      reason: reason.trim() || null,
    });
    setBusy(false);
    if (insertError) { setError(insertError.message); return; }
    setDates(['']);
    setReason('');
    onSubmitted();
  }

  return (
    <form onSubmit={submit} className="bg-white border border-gray-200 rounded-lg p-4 mb-4">
      <p className="font-display text-sm font-semibold uppercase tracking-wide text-gray-800 mb-3">Request a day off</p>
      {dates.map((d, i) => (
        // min-w-0 on the input lets the native date control shrink instead of forcing the row
        // wider than a 375px screen; the Remove button is shrink-0 with a real tap area.
        <div key={i} className="flex items-center gap-2 mb-2">
          <input type="date" value={d} onChange={e => updateDate(i, e.target.value)} className="input-field min-w-0 flex-1" />
          {dates.length > 1 && (
            <button type="button" onClick={() => removeDateField(i)}
              className="shrink-0 px-2 py-2 text-xs text-gray-400 hover:text-red-500">Remove</button>
          )}
        </div>
      ))}
      <button type="button" onClick={addDateField} className="text-xs text-primary font-medium mb-3">+ Add another date</button>
      <label className="block text-xs font-medium text-gray-700 mb-1">Reason (optional)</label>
      <textarea value={reason} onChange={e => setReason(e.target.value)} rows={2}
        className="input-field w-full mb-3" placeholder="Optional — let the chief know why, if you'd like" />
      {holidayHits.length > 0 && (
        <p className="text-xs text-amber-700 mb-3">
          Heads up — {holidayHits.join(' and ')} {holidayHits.length > 1 ? 'fall' : 'falls'} on
          {' '}{holidayHits.length > 1 ? 'these dates' : 'one of these dates'}. Holiday coverage is
          tracked and evened out across the year, so the chief weighs these against who has already
          worked one. Still worth asking.
        </p>
      )}
      {cutoffWarning && (
        <p className="text-xs text-amber-600 mb-3">
          Heads up — one or more of these dates fall within {CUTOFF_WEEKS} weeks of that block's start.
          You can still submit; the chief may just have less flexibility to accommodate it.
        </p>
      )}
      {error && <p className="text-xs text-red-500 mb-3">{error}</p>}
      <button type="submit" disabled={busy}
        className="bg-primary text-white text-sm font-medium rounded-md px-4 py-2 disabled:opacity-50">
        {busy ? 'Submitting…' : 'Submit request'}
      </button>
    </form>
  );
}
