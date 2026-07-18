import { useEffect, useState } from 'react';
import { supabase, AUTH_ENABLED } from '../supabaseClient';
import LoginScreen from './LoginScreen';

export default function ResidentRequestsApp() {
  const [session, setSession] = useState(undefined); // undefined = not checked yet, null = signed out

  useEffect(() => {
    if (!AUTH_ENABLED) { setSession(null); return; }
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => setSession(newSession));
    return () => sub.subscription.unsubscribe();
  }, []);

  if (session === undefined) return null; // brief flash before the session check resolves
  if (!session) return <LoginScreen />;

  // Tasks 6-8 fill this in: resident-picker (first login) then the request form + list.
  return <div className="min-h-screen bg-gray-50 p-4">Signed in.</div>;
}
