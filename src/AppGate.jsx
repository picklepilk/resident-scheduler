import { useEffect, useState } from 'react';
import { supabase, AUTH_ENABLED, ROLE } from './supabaseClient';
import LoginScreen from './residentRequests/LoginScreen';
import ResidentPicker from './residentRequests/ResidentPicker';
import RequestForm from './residentRequests/RequestForm';
import RequestList from './residentRequests/RequestList';
import ResidentScheduler from './ResidentScheduler';

// Dark mode is an override stylesheet keyed on a `.dark` ancestor (see index.css), and
// ResidentScheduler puts that class on its own root div. Everything AppGate renders instead of
// the scheduler — login, pending, picker, the resident request view — sits outside that div, so
// without this wrapper those screens stay permanently light for a dark-mode viewer.
// Read straight from localStorage rather than useLocalStorage: this is a read-only mirror of the
// scheduler's own `res_dark_mode` slot, and nothing here ever writes it.
function ThemedShell({ children }) {
  let dark = false;
  try {
    dark = JSON.parse(localStorage.getItem('res_dark_mode') || 'false') === true;
  } catch {
    dark = false; // hand-edited/corrupt value — fall back to light rather than throwing
  }
  return <div className={dark ? 'dark' : ''}>{children}</div>;
}

function PendingApproval() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="text-center max-w-sm">
        <p className="font-display text-2xl font-semibold uppercase tracking-wide text-gray-800 mb-1">Almost there</p>
        <p className="text-sm text-gray-500">Your account is waiting on admin approval. You'll get access once an admin approves you.</p>
        <button onClick={() => supabase.auth.signOut()} className="text-xs text-gray-400 hover:text-gray-600 mt-4">Sign out</button>
      </div>
    </div>
  );
}

// Shown instead of the app when a PRODUCTION build is missing its Supabase/domain env vars.
// Without this the gate fails OPEN: AUTH_ENABLED goes false and every visitor would get the full
// unauthenticated scheduler. Dev builds still fall through to the scheduler (see below) so local
// work needs no Supabase project.
function AuthMisconfigured() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="text-center max-w-sm">
        <p className="font-display text-2xl font-semibold uppercase tracking-wide text-gray-800 mb-1">Not configured</p>
        <p className="text-sm text-gray-500">
          This deployment is missing its authentication settings, so it can't sign anyone in.
          Set VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY and VITE_ALLOWED_EMAIL_DOMAIN, then redeploy.
        </p>
      </div>
    </div>
  );
}

// Gates the ENTIRE main app behind Supabase Auth + admin approval (unlike RequestsTab.jsx, which
// only gated its own tab). ROLE.ADMIN gets the full ResidentScheduler; ROLE.RESIDENT gets only the
// request-submission view (reusing the same components ResidentRequestsApp uses at /requests);
// ROLE.PENDING (the new-signup default) gets nothing but a waiting screen until an admin acts.
//
// This is the convenience layer. The real boundary is RLS — a pending account is denied by policy
// even if it reaches the API directly (migrate_block_pending_account_access.sql).
export default function AppGate() {
  const [session, setSession] = useState(undefined); // undefined = not checked yet, null = signed out
  const [profile, setProfile] = useState(undefined); // undefined = not fetched, null = no row yet
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!AUTH_ENABLED) { setSession(null); return; }
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => setSession(newSession));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    (async () => {
      // Upsert FIRST, then read — deliberately sequential, not concurrent. Firing both at once
      // races: the SELECT usually wins against an empty table, resolves to null, and renders
      // "waiting on admin approval" even for a pre-authorized admin whose row the upsert is about
      // to create and whose allowlist trigger promotes to admin on insert. They'd have to reload
      // to get in. ignoreDuplicates means the upsert is a no-op for everyone who already has a row.
      await supabase
        .from('profiles')
        .upsert({ id: session.user.id, email: session.user.email }, { onConflict: 'id', ignoreDuplicates: true });
      const { data } = await supabase
        .from('profiles').select('role, resident_id').eq('id', session.user.id).maybeSingle();
      if (!cancelled) setProfile(data);
    })();
    return () => { cancelled = true; };
  }, [session]);

  // Unconfigured build: fall through to the scheduler in dev (so local work needs no Supabase
  // project), but fail CLOSED in a production build rather than silently shipping an open app.
  if (!AUTH_ENABLED) {
    return import.meta.env.DEV ? <ResidentScheduler /> : <ThemedShell><AuthMisconfigured /></ThemedShell>;
  }
  if (session === undefined) return null;
  if (!session) return <ThemedShell><LoginScreen title="Sign In" /></ThemedShell>;
  if (profile === undefined) return null;

  // Admin gets the untouched scheduler, which applies `.dark` on its own root div.
  if (profile?.role === ROLE.ADMIN) return <ResidentScheduler />;

  // No row yet (upsert in flight/failed) is treated as pending — fail closed, never open.
  if (!profile || profile.role === ROLE.PENDING) return <ThemedShell><PendingApproval /></ThemedShell>;

  if (!profile.resident_id) {
    return (
      <ThemedShell>
        <ResidentPicker session={session} onLinked={residentId => setProfile(prev => ({ ...prev, resident_id: residentId }))} />
      </ThemedShell>
    );
  }

  return (
    <ThemedShell>
      <div className="min-h-screen bg-gray-50 p-4 max-w-lg mx-auto">
        <div className="flex justify-end mb-2">
          <button onClick={() => supabase.auth.signOut()} className="text-xs text-gray-400 hover:text-gray-600">Sign out</button>
        </div>
        <RequestForm residentId={profile.resident_id} onSubmitted={() => setRefreshKey(k => k + 1)} />
        <RequestList residentId={profile.resident_id} refreshKey={refreshKey} />
      </div>
    </ThemedShell>
  );
}
