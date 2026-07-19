import { useEffect, useState } from 'react';
import { supabase, AUTH_ENABLED } from './supabaseClient';
import LoginScreen from './residentRequests/LoginScreen';
import { findBlockForDate, formatResidentName } from './residentRequests/blockLookup';

export default function RequestsTab({ emRoster, setEmRoster, blocks, onRequestsChanged }) {
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
    // A first-time admin login has no profile row yet — create one (defaults to role='resident';
    // the FIRST admin flips their own row to 'admin' by hand via the Supabase table editor —
    // one-time bootstrap, documented in the day_off_requests.sql schema comment — every admin
    // after that is promoted from within this tab by an existing admin, see AdminManagement below).
    supabase.from('profiles').upsert({ id: session.user.id, email: session.user.email }, { onConflict: 'id', ignoreDuplicates: true }).then(() => {});
  }, [session]);

  if (!AUTH_ENABLED) {
    return <p className="text-sm text-gray-400 p-4">Day-off requests aren't configured yet — set VITE_ALLOWED_EMAIL_DOMAIN.</p>;
  }

  if (session === undefined) return null;
  if (!session) {
    return (
      <div className="p-4">
        <LoginScreen embedded title="Admin Sign-In" subtitle="Sign in to review day-off requests." />
      </div>
    );
  }
  if (role === undefined) return null;
  if (role !== 'admin') {
    return <p className="text-sm text-gray-400 p-4">Your account isn't set up for admin access yet. Contact an existing admin to request access.</p>;
  }

  return (
    <>
      <ApprovalQueue emRoster={emRoster} setEmRoster={setEmRoster} blocks={blocks} session={session} onRequestsChanged={onRequestsChanged} />
      <AdminManagement session={session} emRoster={emRoster} />
    </>
  );
}

// Block label for a request: matched off its EARLIEST date (dates aren't submitted in sorted
// order — RequestForm lets a resident add date fields in any order), so a multi-date request that
// spans two blocks lands under the block its earliest date falls into, deterministically — not
// whichever date happened to be first in the array.
function blockLabelFor(req, blocks) {
  if (!req.dates.length) return 'Not yet scheduled';
  const earliest = [...req.dates].sort()[0];
  const block = findBlockForDate(earliest, blocks);
  return block ? block.name : 'Not yet scheduled';
}

// Groups requests by block label (design spec: "List of pending requests grouped by
// resident/block") — chronological by block startDate, "Not yet scheduled" last, residents sorted
// by name within each group so the admin can scan who's asking for what block at a glance.
function groupByBlock(requests, blocks) {
  const byLabel = new Map();
  for (const req of requests) {
    const label = blockLabelFor(req, blocks);
    if (!byLabel.has(label)) byLabel.set(label, []);
    byLabel.get(label).push(req);
  }
  const order = [...blocks].sort((a, b) => a.startDate.localeCompare(b.startDate)).map(b => b.name);
  const labels = [...byLabel.keys()].sort((a, b) => {
    if (a === 'Not yet scheduled') return 1;
    if (b === 'Not yet scheduled') return -1;
    return order.indexOf(a) - order.indexOf(b);
  });
  return labels.map(label => ({ label, requests: byLabel.get(label) }));
}

function ApprovalQueue({ emRoster, setEmRoster, blocks, session, onRequestsChanged }) {
  const [requests, setRequests] = useState([]);
  const [noteDraft, setNoteDraft] = useState({});

  async function loadRequests() {
    const { data } = await supabase.from('day_off_requests').select('*').order('submitted_at', { ascending: true });
    setRequests(data || []);
  }
  useEffect(() => { loadRequests(); }, []);

  function residentName(residentId) {
    const r = emRoster.find(x => x.id === residentId);
    return r ? formatResidentName(r) : residentId;
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
  const pendingGroups = groupByBlock(pending, blocks)
    .map(g => ({ ...g, requests: [...g.requests].sort((a, b) => residentName(a.resident_id).localeCompare(residentName(b.resident_id))) }));

  return (
    <div className="p-4 space-y-4 max-w-2xl">
      <div>
        <p className="font-display text-sm font-semibold text-gray-800 mb-2">Pending ({pending.length})</p>
        {pending.length === 0 && <p className="text-sm text-gray-400">Nothing pending.</p>}
        <div className="space-y-4">
          {pendingGroups.map(group => (
            <div key={group.label}>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">{group.label}</p>
              <div className="space-y-2">
                {group.requests.map(req => (
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

// Lets an existing admin grant/revoke admin access for other signed-in users, so the FIRST admin
// (bootstrapped once via manual SQL, see day_off_requests.sql) never needs a second manual SQL
// edit to add more — every admin after that is promoted here instead. Relies on the
// profiles_admin_select_all / profiles_admin_update_role RLS policies (admin-only; a resident
// session sees/changes nothing here even if this component somehow rendered for one).
function AdminManagement({ session, emRoster }) {
  const [profiles, setProfiles] = useState([]);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState(null);

  async function loadProfiles() {
    const { data, error: loadError } = await supabase.from('profiles').select('id, email, role, resident_id').order('email');
    if (loadError) { setError(loadError.message); return; }
    setError(null);
    setProfiles(data || []);
  }
  useEffect(() => { loadProfiles(); }, []);

  function residentLabel(residentId) {
    if (!residentId) return 'Not linked';
    const r = emRoster.find(x => x.id === residentId);
    return r ? formatResidentName(r) : residentId;
  }

  async function toggleRole(profile) {
    const newRole = profile.role === 'admin' ? 'resident' : 'admin';
    setBusyId(profile.id);
    const { error: updateError } = await supabase.from('profiles').update({ role: newRole }).eq('id', profile.id);
    setBusyId(null);
    if (updateError) { setError(updateError.message); return; }
    setError(null);
    loadProfiles();
  }

  return (
    <div className="p-4 max-w-2xl border-t border-gray-200 mt-6 pt-4">
      <p className="font-display text-sm font-semibold text-gray-800 mb-2">Admin access</p>
      {error && <p className="text-xs text-red-600 mb-2">{error}</p>}
      <div className="space-y-1">
        {profiles.map(p => (
          <div key={p.id} className="flex items-center justify-between text-xs bg-white border border-gray-200 rounded-md px-3 py-2">
            <div>
              <p className="text-gray-800">{p.email} {p.id === session.user.id && <span className="text-gray-400">(you)</span>}</p>
              <p className="text-gray-400">{p.role} · {residentLabel(p.resident_id)}</p>
            </div>
            <button
              onClick={() => toggleRole(p)}
              disabled={p.id === session.user.id || busyId === p.id}
              className="text-xs font-medium rounded-md px-3 py-1.5 border border-gray-300 disabled:opacity-40"
            >
              {busyId === p.id ? 'Saving…' : p.role === 'admin' ? 'Revoke admin' : 'Make admin'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
