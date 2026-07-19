import { useEffect, useState } from 'react';
import { supabase, AUTH_ENABLED } from './supabaseClient';
import LoginScreen from './residentRequests/LoginScreen';

export default function RequestsTab({ emRoster, setEmRoster, onRequestsChanged }) {
  const [session, setSession] = useState(undefined);
  const [role, setRole] = useState(undefined); // undefined = not fetched, null = no profile row

  useEffect(() => {
    if (!AUTH_ENABLED) { setSession(null); return; }
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => setSession(newSession));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) return;
    supabase.from('profiles').select('role').eq('id', session.user.id).maybeSingle()
      .then(({ data }) => setRole(data ? data.role : null));
    // A first-time chief login has no profile row yet — create one (defaults to role='resident';
    // an admin flips it to 'chief' by hand in the Supabase table editor, same one-time bootstrap
    // documented in the day_off_requests.sql schema comment).
    supabase.from('profiles').upsert({ id: session.user.id, email: session.user.email }, { onConflict: 'id', ignoreDuplicates: true }).then(() => {});
  }, [session]);

  if (!AUTH_ENABLED) {
    return <p className="text-sm text-gray-400 p-4">Day-off requests aren't configured yet — set VITE_ALLOWED_EMAIL_DOMAIN.</p>;
  }

  if (session === undefined) return null;
  if (!session) {
    return (
      <div className="p-4">
        <LoginScreen embedded title="Chief Sign-In" subtitle="Sign in to review day-off requests." />
      </div>
    );
  }
  if (role === undefined) return null;
  if (role !== 'chief') {
    return <p className="text-sm text-gray-400 p-4">Your account isn't set up for chief access yet. Contact the app admin.</p>;
  }

  return <ApprovalQueue emRoster={emRoster} setEmRoster={setEmRoster} session={session} onRequestsChanged={onRequestsChanged} />;
}

function ApprovalQueue({ emRoster, setEmRoster, session, onRequestsChanged }) {
  const [requests, setRequests] = useState([]);
  const [noteDraft, setNoteDraft] = useState({});

  async function loadRequests() {
    const { data } = await supabase.from('day_off_requests').select('*').order('submitted_at', { ascending: true });
    setRequests(data || []);
  }
  useEffect(() => { loadRequests(); }, []);

  function residentName(residentId) {
    const r = emRoster.find(x => x.id === residentId);
    return r ? `${r.lastName}, ${r.firstName}` : residentId;
  }

  async function decide(req, status) {
    const note = noteDraft[req.id] || null;
    await supabase.from('day_off_requests').update({
      status, decision_note: note, decided_at: new Date().toISOString(), decided_by: session.user.id,
    }).eq('id', req.id);
    if (status === 'approved') {
      setEmRoster(prev => prev.map(r => r.id === req.resident_id
        ? { ...r, approvedDatesOff: Array.from(new Set([...(r.approvedDatesOff || []), ...req.dates])).sort() }
        : r));
    }
    loadRequests();
    onRequestsChanged?.();
  }

  const pending = requests.filter(r => r.status === 'pending');
  const decided = requests.filter(r => r.status !== 'pending');

  return (
    <div className="p-4 space-y-4 max-w-2xl">
      <div>
        <p className="font-display text-sm font-semibold text-gray-800 mb-2">Pending ({pending.length})</p>
        {pending.length === 0 && <p className="text-sm text-gray-400">Nothing pending.</p>}
        <div className="space-y-2">
          {pending.map(req => (
            <div key={req.id} className="bg-white border border-gray-200 rounded-lg p-3">
              <p className="text-sm font-medium text-gray-800">{residentName(req.resident_id)}</p>
              <p className="text-xs text-gray-500">{req.dates.join(', ')}</p>
              {req.reason && <p className="text-xs text-gray-500 mt-1">"{req.reason}"</p>}
              <input type="text" placeholder="Optional note back to resident" value={noteDraft[req.id] || ''}
                onChange={e => setNoteDraft(prev => ({ ...prev, [req.id]: e.target.value }))}
                className="input-field w-full mt-2 text-xs" />
              <div className="flex gap-2 mt-2">
                <button onClick={() => decide(req, 'approved')} className="bg-green-600 text-white text-xs font-medium rounded-md px-3 py-1.5">Approve</button>
                <button onClick={() => decide(req, 'denied')} className="bg-red-600 text-white text-xs font-medium rounded-md px-3 py-1.5">Deny</button>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div>
        <p className="font-display text-sm font-semibold text-gray-800 mb-2">Decided</p>
        <div className="space-y-1">
          {decided.map(req => (
            <p key={req.id} className="text-xs text-gray-400">{residentName(req.resident_id)} · {req.dates.join(', ')} · {req.status}</p>
          ))}
        </div>
      </div>
    </div>
  );
}
