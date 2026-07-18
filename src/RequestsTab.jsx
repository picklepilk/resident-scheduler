import { useEffect, useState } from 'react';
import { supabase, AUTH_ENABLED } from './supabaseClient';
import LoginScreen from './residentRequests/LoginScreen';

export default function RequestsTab({ emRoster, setEmRoster }) {
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

  // Task 10 fills this in: the actual approval queue.
  return <div className="p-4">Signed in as chief.</div>;
}
