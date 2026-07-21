import { useEffect, useState } from 'react';
import { supabase, AUTH_ENABLED, ROLE } from '../supabaseClient';
import LoginScreen from './LoginScreen';
import ResidentPicker from './ResidentPicker';
import RequestForm from './RequestForm';
import RequestList from './RequestList';

export default function ResidentRequestsApp() {
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
      // Sequential upsert-then-read, same reasoning as AppGate: firing both at once lets the
      // SELECT win against an empty table and mis-render a brand-new account.
      await supabase
        .from('profiles')
        .upsert({ id: session.user.id, email: session.user.email }, { onConflict: 'id', ignoreDuplicates: true });
      const { data } = await supabase
        .from('profiles').select('role, resident_id').eq('id', session.user.id).maybeSingle();
      if (!cancelled) setProfile(data);
    })();
    return () => { cancelled = true; };
  }, [session]);

  if (session === undefined) return null; // brief flash before the session check resolves
  if (!session) return <LoginScreen />;
  if (profile === undefined) return null; // brief flash before the profile fetch resolves

  // This route previously read only resident_id and never role, which made it a full bypass of
  // the approval requirement: a brand-new pending account could open /requests, claim any
  // not-yet-registered roster resident via the picker below, and submit requests under that
  // identity. RLS now denies that regardless (migrate_block_pending_account_access.sql) — without
  // this branch the UI would just fail confusingly instead of explaining why.
  if (!profile || profile.role === ROLE.PENDING) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="text-center max-w-sm">
          <p className="font-display text-2xl font-semibold uppercase tracking-wide text-gray-800 mb-1">Almost there</p>
          <p className="text-sm text-gray-500">Your account is waiting on admin approval. You'll be able to submit requests once an admin approves you.</p>
          <button onClick={() => supabase.auth.signOut()} className="text-xs text-gray-400 hover:text-gray-600 mt-4">Sign out</button>
        </div>
      </div>
    );
  }

  // Admins must not be offered the "which resident are you?" picker. Linking is IRREVERSIBLE —
  // enforce_resident_id_immutable blocks any later change once resident_id is non-null — so an
  // admin who opened /requests out of curiosity could permanently bind their account to a roster
  // resident with one mis-tap. Admins belong in the main app; send them there.
  if (profile.role === ROLE.ADMIN) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="text-center max-w-sm">
          <p className="font-display text-2xl font-semibold uppercase tracking-wide text-gray-800 mb-1">Admin account</p>
          <p className="text-sm text-gray-500">
            This page is for residents submitting their own requests. Open the main app to review
            and decide on requests.
          </p>
          <a href="/" className="inline-block text-xs text-primary font-medium mt-4">Go to the scheduler</a>
        </div>
      </div>
    );
  }

  if (!profile.resident_id) {
    return <ResidentPicker session={session} onLinked={residentId => setProfile(prev => ({ ...prev, resident_id: residentId }))} />;
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 max-w-lg mx-auto">
      <RequestForm residentId={profile.resident_id} onSubmitted={() => setRefreshKey(k => k + 1)} />
      <RequestList residentId={profile.resident_id} refreshKey={refreshKey} />
    </div>
  );
}
