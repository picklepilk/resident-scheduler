import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { supabase, AUTH_ENABLED, ROLE } from './supabaseClient';
import LoginScreen from './residentRequests/LoginScreen';
import RequestForm from './residentRequests/RequestForm';
import RequestList from './residentRequests/RequestList';
import { formatResidentName, groupByBlock } from './residentRequests/blockLookup';

// Admin-only tab inside the main scheduler. AppGate has already established the viewer is an
// admin before this ever mounts, so the session/role checks below are defence in depth rather
// than the primary gate — kept deliberately, since this component is exported and a future caller
// might mount it somewhere less protected. The profile-row upsert that used to live here is gone:
// AppGate now owns first-login row creation, and doing it in both places raced.
//
// `viewer` ({email, userId, role}, see ResidentScheduler.jsx) is AppGate's already-resolved
// session/role — when present, session/role state is seeded from it directly and the
// getSession()/profiles-role fetch below is skipped, since re-deriving what the caller already
// resolved (on every mount of this tab) was pure waste. `session` is shaped as a
// `{user:{id,email}}` stand-in so every existing `session.user.id`/`session.user.email` read below
// keeps working unchanged. The fetch stays intact as a fallback for a caller that mounts this
// component without the prop (see the header comment above).
export default function RequestsTab({ emRoster, setEmRoster, blocks, onRequestsChanged, showToast, demoMode, viewer }) {
  const [session, setSession] = useState(() => viewer ? { user: { id: viewer.userId, email: viewer.email } } : undefined);
  const [role, setRole] = useState(() => viewer ? viewer.role : undefined); // undefined = not fetched, null = no profile row
  const [profiles, setProfiles] = useState([]);
  const [profilesError, setProfilesError] = useState(null);
  // Bumped whenever ViewAsPanel files a request on the resident's behalf, so the sibling
  // ApprovalQueue (which only otherwise reloads on mount or its own decide()) picks up the new
  // pending request without the admin having to leave and re-enter this tab.
  const [pendingRefreshSignal, setPendingRefreshSignal] = useState(0);

  useEffect(() => {
    if (viewer) return; // already resolved by the caller — see header comment
    if (!AUTH_ENABLED) { setSession(null); return; }
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => setSession(newSession));
    return () => sub.subscription.unsubscribe();
  }, [viewer]);

  useEffect(() => {
    if (viewer) return; // already resolved by the caller — see header comment
    if (!session) return;
    supabase.from('profiles').select('role').eq('id', session.user.id).maybeSingle()
      .then(({ data }) => setRole(data ? data.role : null));
  }, [session, viewer]);

  // Single lifted profiles fetch, shared by AdminManagement (full use) and ViewAsPanel (derives
  // its "who has a linked account" list from it) — previously each fetched its own copy, doubling
  // the round-trip on every mount and letting the two silently drift.
  async function loadProfiles() {
    const { data, error: loadError } = await supabase.from('profiles').select('id, email, role, resident_id').order('email');
    if (loadError) { setProfilesError(loadError.message); return; }
    setProfilesError(null);
    setProfiles(data || []);
  }
  useEffect(() => {
    if (role !== ROLE.ADMIN) return;
    loadProfiles();
  }, [role]);

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
  if (role !== ROLE.ADMIN) {
    return <p className="text-sm text-gray-400 p-4">Your account isn't set up for admin access yet. Contact an existing admin to request access.</p>;
  }

  return (
    <>
      <ApprovalQueue emRoster={emRoster} setEmRoster={setEmRoster} blocks={blocks} session={session} onRequestsChanged={onRequestsChanged} refreshSignal={pendingRefreshSignal} demoMode={demoMode} showToast={showToast} />
      <ViewAsPanel emRoster={emRoster} blocks={blocks} profiles={profiles} profilesError={profilesError}
        onRequestsChanged={onRequestsChanged} onFiled={() => setPendingRefreshSignal(s => s + 1)} demoMode={demoMode} />
      <AdminManagement session={session} emRoster={emRoster} profiles={profiles} onProfileChanged={loadProfiles} demoMode={demoMode} />
      <RequestPortalCard showToast={showToast} />
    </>
  );
}

// Locates the resident-facing request portal for the chief to share — same route main.jsx
// resolves to `ResidentRequestsApp` (`/requests`, trailing slash tolerated). Pure UI: no new
// backend capability, doesn't touch the approval flow or notifications (already implemented via
// the notify-request edge function). Placed last among the tab's sections since it's a
// share/locate affordance rather than a queue the admin works through daily.
//
// Print handling follows this app's existing convention (`no-print` in index.css hides chrome on
// print) rather than inventing a new one: the card's own on-screen-only controls (heading, Copy/
// Print buttons, helper text) carry `no-print` so they vanish when printing, while the QR image +
// URL + a one-line instruction (`print-only`, invisible on screen) are what's left on the page —
// along with `no-print` added to the three sibling sections above so a chief who hits Print while
// on this tab doesn't accidentally print pending requests/admin rosters.
function RequestPortalCard({ showToast }) {
  const canvasRef = useRef(null);
  const portalUrl = `${window.location.origin}/requests`;

  useEffect(() => {
    if (!canvasRef.current) return;
    QRCode.toCanvas(canvasRef.current, portalUrl, { width: 180, margin: 1 }, (err) => {
      if (err) showToast?.('Could not render the QR code', 'red');
    });
  }, [portalUrl]);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(portalUrl);
      showToast?.('Portal link copied', 'green');
    } catch {
      showToast?.('Could not copy — select and copy the link manually', 'red');
    }
  }

  return (
    <div className="p-4 max-w-2xl border-t border-gray-200 mt-6 pt-4">
      <div className="no-print flex items-center justify-between gap-2 mb-2">
        <p className="font-display text-sm font-semibold uppercase tracking-wide text-gray-800">Resident request portal</p>
        <button onClick={() => window.print()}
          className="text-xs font-medium rounded-md px-2.5 py-1 border border-gray-300 bg-white">
          Print
        </button>
      </div>
      <p className="no-print text-xs text-gray-500 mb-3">
        Share this link or QR code so residents can find the day-off request portal — post the
        printed version, text the link, or point them here directly.
      </p>
      <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start">
        <canvas ref={canvasRef} className="border border-gray-200 rounded-md shrink-0" />
        <div className="min-w-0">
          <p className="font-mono text-sm text-gray-800 break-all">{portalUrl}</p>
          <button onClick={copyLink}
            className="no-print mt-2 text-xs font-medium rounded-md px-2.5 py-1 border border-gray-300 bg-white">
            Copy link
          </button>
          <p className="print-only text-xs text-gray-600 mt-2">
            Scan this code, or visit the link above, to submit or check a day-off request.
          </p>
        </div>
      </div>
    </div>
  );
}

// Lets an admin see exactly what a given resident sees, and file a request on their behalf (a
// resident phones one in, or hands over a paper form).
//
// The preview reuses the resident's own RequestList (now with withdraw enabled — see RequestList's
// own header comment). Filing on behalf is a separate, explicit action in this admin panel — the
// admin stays signed in as themselves, which keeps the action attributable in a way impersonation
// would not; withdrawing a mistaken on-behalf filing is the same kind of attributable action, which
// is why it's no longer suppressed here.
//
// Reads work because requests_admin_select_all grants an admin SELECT on every request; filing
// works because of requests_admin_insert_all (migrate_admin_request_on_behalf.sql). Without that
// policy the insert is denied, since requests_insert_own requires the row's resident_id to match
// the caller's own and an admin's is normally NULL.
function ViewAsPanel({ emRoster, blocks, profiles, profilesError, onRequestsChanged, onFiled, demoMode }) {
  const [selected, setSelected] = useState('');
  const [filing, setFiling] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  if (demoMode) {
    return (
      <div className="no-print p-4 max-w-2xl border-t border-gray-200 mt-6 pt-4">
        <p className="font-display text-sm font-semibold uppercase tracking-wide text-gray-800 mb-2">View as resident</p>
        <p className="text-xs text-gray-400">Unavailable in the demo sandbox — this panel files real requests. Exit the demo to use it.</p>
      </div>
    );
  }

  // Only residents someone has actually linked an account to — previewing a roster entry with no
  // account would always render an empty list and read as a bug. Derived straight from the
  // parent's lifted `profiles` (same fetch AdminManagement uses) rather than a second query.
  const linked = profiles.filter(p => p.resident_id).map(p => p.resident_id);
  const options = emRoster
    .filter(r => linked.includes(r.id))
    .sort((a, b) => formatResidentName(a).localeCompare(formatResidentName(b)));

  const selectedResident = emRoster.find(r => r.id === selected);

  return (
    <div className="no-print p-4 max-w-2xl border-t border-gray-200 mt-6 pt-4">
      <p className="font-display text-sm font-semibold uppercase tracking-wide text-gray-800 mb-2">View as resident</p>
      <select value={selected} onChange={e => { setSelected(e.target.value); setFiling(false); }}
        className="input-field w-full mb-3">
        <option value="">Select a resident…</option>
        {options.map(r => <option key={r.id} value={r.id}>{formatResidentName(r)}</option>)}
      </select>
      {profilesError && <p className="text-xs text-red-600 mb-2">{profilesError}</p>}
      {!profilesError && options.length === 0 && (
        <p className="text-xs text-gray-400">No residents have linked an account yet.</p>
      )}

      {selected && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 mb-3">
            <p className="text-xs text-amber-700">
              Viewing as <span className="font-medium">{formatResidentName(selectedResident)}</span>'s request history.
            </p>
            <button onClick={() => setFiling(f => !f)}
              className="text-xs font-medium rounded-md px-2.5 py-1 border border-amber-300 bg-white">
              {filing ? 'Close' : 'Request a day off for them'}
            </button>
          </div>

          {filing && (
            <div className="mb-3">
              <RequestForm residentId={selected} onSubmitted={() => {
                setFiling(false);
                setRefreshKey(k => k + 1);
                onRequestsChanged?.();
                onFiled?.();
              }} />
            </div>
          )}

          <RequestList residentId={selected} refreshKey={refreshKey} blocks={blocks} />
        </>
      )}
    </div>
  );
}

// blockLabelFor/groupByBlock (design spec: "List of pending requests grouped by resident/block")
// now live in residentRequests/blockLookup.js — shared with RequestList.jsx so the two can't drift
// on grouping logic. Residents are sorted by name within each group below so the admin can scan
// who's asking for what block at a glance (groupByBlock itself preserves input order per group).
function ApprovalQueue({ emRoster, setEmRoster, blocks, session, onRequestsChanged, refreshSignal, demoMode, showToast }) {
  const [requests, setRequests] = useState([]);
  const [noteDraft, setNoteDraft] = useState({});
  const [error, setError] = useState(null);

  async function loadRequests() {
    const { data } = await supabase.from('day_off_requests').select('id, resident_id, dates, reason, status, decision_note, submitted_at').order('submitted_at', { ascending: true });
    setRequests(data || []);
  }
  // Reloads on mount AND whenever the parent bumps refreshSignal — the latter fires after
  // ViewAsPanel files a request on a resident's behalf, so a newly-filed pending request shows up
  // here without the admin having to leave and re-enter the tab.
  useEffect(() => { loadRequests(); }, [refreshSignal]);

  function residentName(residentId) {
    const r = emRoster.find(x => x.id === residentId);
    return r ? formatResidentName(r) : residentId;
  }

  async function decide(req, status) {
    if (demoMode) { showToast?.('Exit the demo sandbox first.', 'red'); return; }
    const note = noteDraft[req.id] || null;
    // Check the write's own error rather than assuming success — an RLS denial, expired session,
    // or network blip must not update local approvedDatesOff/UI state while the database write
    // itself never took effect (that desync is exactly what the code review flagged).
    const { error: updateError } = await supabase.from('day_off_requests').update({
      status, decision_note: note, decided_at: new Date().toISOString(), decided_by: session.user.id,
    }).eq('id', req.id);
    if (updateError) { setError(updateError.message); return; }
    setError(null);
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
    <div className="no-print p-4 space-y-4 max-w-2xl">
      <div>
        <p className="font-display text-sm font-semibold uppercase tracking-wide text-gray-800 mb-2">Pending ({pending.length})</p>
        {error && <p className="text-xs text-red-600 mb-2">{error}</p>}
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
                      <button onClick={() => decide(req, 'approved')} disabled={demoMode} className="bg-green-600 text-white text-xs font-medium rounded-md px-3 py-1.5 disabled:opacity-40">Approve</button>
                      <button onClick={() => decide(req, 'denied')} disabled={demoMode} className="bg-red-600 text-white text-xs font-medium rounded-md px-3 py-1.5 disabled:opacity-40">Deny</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div>
        <p className="font-display text-sm font-semibold uppercase tracking-wide text-gray-800 mb-2">Decided</p>
        <div className="space-y-1">
          {decided.map(req => (
            <p key={req.id} className="text-xs text-gray-400">{residentName(req.resident_id)} · {req.dates.join(', ')} · {req.status}</p>
          ))}
        </div>
      </div>
    </div>
  );
}

// Lets an existing admin approve pending accounts (as resident or admin) and grant/revoke admin
// access for everyone else, so the FIRST admin (bootstrapped once via manual SQL, see
// day_off_requests.sql) never needs a second manual SQL edit to add more — every account after
// that is approved/promoted here instead. Relies on the profiles_admin_select_all /
// profiles_admin_update_role RLS policies (admin-only; a resident/pending session sees/changes
// nothing here even if this component somehow rendered for one).
function AdminManagement({ session, emRoster, profiles, onProfileChanged, demoMode }) {
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState(null);

  if (demoMode) {
    return (
      <div className="no-print p-4 max-w-2xl border-t border-gray-200 mt-6 pt-4">
        <p className="font-display text-sm font-semibold uppercase tracking-wide text-gray-800 mb-2">Admin access</p>
        <p className="text-xs text-gray-400">Unavailable in the demo sandbox — this panel changes real accounts. Exit the demo to use it.</p>
      </div>
    );
  }

  function residentLabel(residentId) {
    if (!residentId) return 'Not linked';
    const r = emRoster.find(x => x.id === residentId);
    return r ? formatResidentName(r) : residentId;
  }

  async function setRole(profile, newRole) {
    setBusyId(profile.id);
    const { error: updateError } = await supabase.from('profiles').update({ role: newRole }).eq('id', profile.id);
    setBusyId(null);
    if (updateError) { setError(updateError.message); return; }
    setError(null);
    onProfileChanged?.();
  }

  const pending = profiles.filter(p => p.role === ROLE.PENDING);
  const approved = profiles.filter(p => p.role !== ROLE.PENDING);

  return (
    <div className="no-print p-4 max-w-2xl border-t border-gray-200 mt-6 pt-4">
      <p className="font-display text-sm font-semibold uppercase tracking-wide text-gray-800 mb-2">Admin access</p>
      {error && <p className="text-xs text-red-600 mb-2">{error}</p>}
      {pending.length > 0 && (
        <div className="mb-4">
          <p className="text-xs font-semibold text-amber-600 uppercase tracking-wide mb-1.5">Pending approval ({pending.length})</p>
          <div className="space-y-1">
            {pending.map(p => (
              <div key={p.id} className="flex items-center justify-between flex-wrap gap-2 text-xs bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                <p className="text-gray-800 min-w-0 break-all">{p.email}</p>
                <div className="flex gap-1.5 flex-wrap">
                  <button
                    onClick={() => setRole(p, ROLE.RESIDENT)}
                    disabled={busyId === p.id}
                    className="text-xs font-medium rounded-md px-2.5 py-1 border border-gray-300 disabled:opacity-40"
                  >
                    {busyId === p.id ? 'Saving…' : 'Approve'}
                  </button>
                  <button
                    onClick={() => setRole(p, ROLE.ADMIN)}
                    disabled={busyId === p.id}
                    className="text-xs font-medium rounded-md px-2.5 py-1 border border-gray-300 disabled:opacity-40"
                  >
                    Approve as admin
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="space-y-1">
        {approved.map(p => (
          <div key={p.id} className="flex items-center justify-between flex-wrap gap-2 text-xs bg-white border border-gray-200 rounded-md px-3 py-2">
            <div className="min-w-0">
              <p className="text-gray-800 break-all">{p.email} {p.id === session.user.id && <span className="text-gray-400">(you)</span>}</p>
              <p className="text-gray-400">{p.role} · {residentLabel(p.resident_id)}</p>
            </div>
            <button
              onClick={() => setRole(p, p.role === ROLE.ADMIN ? ROLE.RESIDENT : ROLE.ADMIN)}
              disabled={p.id === session.user.id || busyId === p.id}
              className="text-xs font-medium rounded-md px-3 py-1.5 border border-gray-300 disabled:opacity-40"
            >
              {busyId === p.id ? 'Saving…' : p.role === ROLE.ADMIN ? 'Revoke admin' : 'Make admin'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
