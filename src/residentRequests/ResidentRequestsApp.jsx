import { useEffect, useState } from 'react';
import { supabase, AUTH_ENABLED } from '../supabaseClient';
import LoginScreen from './LoginScreen';
import ResidentPicker from './ResidentPicker';

export default function ResidentRequestsApp() {
  const [session, setSession] = useState(undefined); // undefined = not checked yet, null = signed out
  const [profile, setProfile] = useState(undefined); // undefined = not fetched, null = no row yet

  useEffect(() => {
    if (!AUTH_ENABLED) { setSession(null); return; }
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => setSession(newSession));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) return;
    supabase.from('profiles').select('resident_id').eq('id', session.user.id).maybeSingle()
      .then(({ data }) => setProfile(data));
  }, [session]);

  if (session === undefined) return null; // brief flash before the session check resolves
  if (!session) return <LoginScreen />;
  if (profile === undefined) return null; // brief flash before the profile fetch resolves
  if (!profile || !profile.resident_id) {
    return <ResidentPicker session={session} onLinked={residentId => setProfile({ resident_id: residentId })} />;
  }

  // Task 7/8 fill this in.
  return <div className="min-h-screen bg-gray-50 p-4">Linked to resident {profile.resident_id}.</div>;
}
