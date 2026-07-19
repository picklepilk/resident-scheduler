import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { fetchRosterForPicker } from './blockLookup';

export default function ResidentPicker({ session, onLinked }) {
  const [roster, setRoster] = useState([]);
  const [selected, setSelected] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { fetchRosterForPicker().then(setRoster); }, []);

  async function confirm() {
    if (!selected) return;
    setBusy(true);
    setError('');
    const { error: upsertError } = await supabase.from('profiles').upsert({
      id: session.user.id,
      email: session.user.email,
      resident_id: selected,
    });
    setBusy(false);
    if (upsertError) { setError(upsertError.message); return; }
    onLinked(selected);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="bg-white border border-gray-200 rounded-lg p-6 w-full max-w-sm">
        <p className="font-display text-lg font-semibold text-gray-800 mb-1">Which resident are you?</p>
        <p className="text-sm text-gray-500 mb-4">One-time setup — this links your login to your profile.</p>
        <select value={selected} onChange={e => setSelected(e.target.value)} className="input-field w-full mb-3">
          <option value="">Select your name…</option>
          {roster.map(r => <option key={r.id} value={r.id}>{r.lastName}, {r.firstName}</option>)}
        </select>
        {error && <p className="text-xs text-red-500 mb-3">{error}</p>}
        <button onClick={confirm} disabled={!selected || busy}
          className="w-full bg-primary text-white text-sm font-medium rounded-md py-2 disabled:opacity-50">
          {busy ? 'Saving…' : 'Confirm'}
        </button>
      </div>
    </div>
  );
}
