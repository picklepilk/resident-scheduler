import { useEffect, useState } from 'react';
import { supabase, AUTH_ENABLED } from './supabaseClient';
import LoginScreen from './residentRequests/LoginScreen';
import ResidentPicker from './residentRequests/ResidentPicker';
import RequestForm from './residentRequests/RequestForm';
import RequestList from './residentRequests/RequestList';
import ResidentScheduler from './ResidentScheduler';

function PendingApproval() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="text-center max-w-sm">
        <p className="font-display text-lg font-semibold text-gray-800 mb-1">Almost there</p>
        <p className="text-sm text-gray-500">Your account is waiting on admin approval. You'll get access once an admin approves you.</p>
        <button onClick={() => supabase.auth.signOut()} className="text-xs text-gray-400 hover:text-gray-600 mt-4">Sign out</button>
      </div>
    </div>
  );
}

// Gates the ENTIRE main app behind Supabase Auth + admin approval (unlike RequestsTab.jsx, which
// only gated its own tab). role='admin' gets the full ResidentScheduler; role='resident' gets only
// the request-submission view (reusing the same components ResidentRequestsApp uses at /requests);
// role='pending' (the new-signup default) gets nothing but a waiting screen until an admin acts.
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
    supabase.from('profiles').select('role, resident_id').eq('id', session.user.id).maybeSingle()
      .then(({ data }) => setProfile(data));
    // First-time login for a brand-new account: create its row (role defaults to 'pending') so it
    // immediately shows up in an admin's approval list — same ignoreDuplicates pattern
    // RequestsTab.jsx already uses for its own first-login upsert.
    supabase.from('profiles').upsert({ id: session.user.id, email: session.user.email }, { onConflict: 'id', ignoreDuplicates: true }).then(() => {});
  }, [session]);

  if (!AUTH_ENABLED) return <ResidentScheduler />; // unconfigured build: no gate, unchanged behavior
  if (session === undefined) return null;
  if (!session) return <LoginScreen title="Sign In" />;
  if (profile === undefined) return null;
  if (profile?.role === 'admin') return <ResidentScheduler />;
  if (!profile || profile.role === 'pending') return <PendingApproval />;
  if (!profile.resident_id) {
    return <ResidentPicker session={session} onLinked={residentId => setProfile(prev => ({ ...prev, resident_id: residentId }))} />;
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 max-w-lg mx-auto">
      <div className="flex justify-end mb-2">
        <button onClick={() => supabase.auth.signOut()} className="text-xs text-gray-400 hover:text-gray-600">Sign out</button>
      </div>
      <RequestForm residentId={profile.resident_id} onSubmitted={() => setRefreshKey(k => k + 1)} />
      <RequestList residentId={profile.resident_id} refreshKey={refreshKey} />
    </div>
  );
}
