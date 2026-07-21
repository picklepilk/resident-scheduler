import { useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { supabase, AUTH_ENABLED, ALLOWED_EMAIL_DOMAIN } from '../supabaseClient';

// embedded=true drops the full-page centered layout in favor of a plain inline block, so this
// same component can be reused inside a tab panel (the admin-facing Requests tab) without a
// second copy of the auth logic.
function PageWrapper({ embedded, children }) {
  if (embedded) return <div className="max-w-sm">{children}</div>;
  return <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">{children}</div>;
}

// No decorative icon inside the inputs. `.input-field` (index.css) is declared outside any
// @layer, so it lands after @tailwind utilities in the cascade and its px-3 beats a pl-8 utility
// on the same element — an absolutely-positioned icon therefore rendered on top of the text
// instead of beside it. Labels carry the meaning; the icon was decoration that cost legibility.
function Field({ label, type, value, onChange, placeholder, autoComplete, hint }) {
  return (
    <div className="mb-3">
      <label className="block text-xs font-medium text-gray-700 mb-1">{label}</label>
      <input
        type={type} required value={value} onChange={e => onChange(e.target.value)}
        className="input-field w-full" placeholder={placeholder} autoComplete={autoComplete}
      />
      {hint && <p className="text-[11px] text-gray-400 mt-1">{hint}</p>}
    </div>
  );
}

const MODES = {
  signin: { heading: 'Sign In',        cta: 'Sign in',            busy: 'Signing in…' },
  signup: { heading: 'Create Account', cta: 'Create account',     busy: 'Creating…' },
  forgot: { heading: 'Reset Password', cta: 'Send reset link',    busy: 'Sending…' },
  magic:  { heading: 'Email Sign-In',  cta: 'Send sign-in link',  busy: 'Sending…' },
};

export default function LoginScreen({ embedded = false, title, subtitle }) {
  const [mode, setMode] = useState('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [notice, setNotice] = useState(null); // { heading, body } — terminal "check your email" state
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (!AUTH_ENABLED) {
    return (
      <PageWrapper embedded={embedded}>
        <p className="text-sm text-gray-500 max-w-sm text-center">
          Sign-in isn't configured yet. {embedded ? 'Set VITE_ALLOWED_EMAIL_DOMAIN.' : 'Ask an admin to finish setup.'}
        </p>
      </PageWrapper>
    );
  }

  function switchMode(next) {
    setMode(next);
    setError('');
    setPassword('');
  }

  async function submit(e) {
    e.preventDefault();
    setError('');
    const trimmed = email.trim().toLowerCase();

    // Client-side domain check for a fast, clear message. NOT the enforcement point — the
    // restrict_signup_domain Auth Hook rejects out-of-domain signups server-side regardless,
    // since anyone can call the auth API directly with the public anon key.
    if (!trimmed.endsWith(`@${ALLOWED_EMAIL_DOMAIN.toLowerCase()}`)) {
      setError(`Please use your @${ALLOWED_EMAIL_DOMAIN} email address.`);
      return;
    }

    setBusy(true);
    try {
      if (mode === 'signin') {
        const { error: err } = await supabase.auth.signInWithPassword({ email: trimmed, password });
        if (err) {
          // Supabase returns the same generic message whether the address is unknown or the
          // password is wrong — deliberate, so the form can't be used to enumerate accounts.
          // Add the one hint that's actually actionable here.
          setError(
            /invalid login credentials/i.test(err.message)
              ? "Email or password is incorrect. If you've only ever used an emailed link, set a password via \"Forgot password\"."
              : err.message
          );
          return;
        }
        return; // onAuthStateChange in AppGate takes over from here
      }

      if (mode === 'signup') {
        if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }
        const { error: err } = await supabase.auth.signUp({
          email: trimmed,
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (err) { setError(err.message); return; }
        setNotice({
          heading: 'Confirm your email',
          body: `We sent a confirmation link to ${trimmed}. Click it once, then you can sign in with your password from then on.`,
        });
        return;
      }

      if (mode === 'forgot') {
        const { error: err } = await supabase.auth.resetPasswordForEmail(trimmed, {
          redirectTo: window.location.origin,
        });
        if (err) { setError(err.message); return; }
        setNotice({
          heading: 'Check your email',
          body: `If an account exists for ${trimmed}, we sent it a link to choose a new password.`,
        });
        return;
      }

      // mode === 'magic'
      const { error: err } = await supabase.auth.signInWithOtp({
        email: trimmed,
        options: { emailRedirectTo: window.location.origin },
      });
      if (err) { setError(err.message); return; }
      setNotice({ heading: 'Check your email', body: `We sent a sign-in link to ${trimmed}.` });
    } finally {
      setBusy(false);
    }
  }

  if (notice) {
    return (
      <PageWrapper embedded={embedded}>
        <div className="text-center max-w-sm">
          <CheckCircle2 className="mx-auto text-primary mb-3" size={32} />
          <p className="font-display text-2xl font-semibold uppercase tracking-wide text-gray-800 mb-1">{notice.heading}</p>
          <p className="text-sm text-gray-500">{notice.body}</p>
          <button onClick={() => { setNotice(null); switchMode('signin'); }}
            className="text-xs text-primary font-medium mt-4">Back to sign in</button>
        </div>
      </PageWrapper>
    );
  }

  const m = MODES[mode];

  return (
    <PageWrapper embedded={embedded}>
      <form onSubmit={submit} className={embedded ? '' : 'bg-white border border-gray-200 rounded-lg p-6 w-full max-w-sm'}>
        <p className="font-display text-2xl font-semibold uppercase tracking-wide text-gray-800 mb-1">{title || m.heading}</p>
        <p className="text-sm text-gray-500 mb-4">
          {subtitle || (mode === 'forgot'
            ? `We'll email a reset link to your @${ALLOWED_EMAIL_DOMAIN} address.`
            : `Use your @${ALLOWED_EMAIL_DOMAIN} email.`)}
        </p>

        <Field label="Email" type="email" value={email} onChange={setEmail}
          placeholder={`you@${ALLOWED_EMAIL_DOMAIN}`} autoComplete="username" />

        {(mode === 'signin' || mode === 'signup') && (
          <Field
            label="Password" type="password" value={password} onChange={setPassword}
            placeholder={mode === 'signup' ? 'At least 8 characters' : ''}
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            hint={mode === 'signup' ? 'You’ll confirm your email once, then sign in with this password.' : undefined}
          />
        )}

        {error && <p className="text-xs text-red-500 mb-3">{error}</p>}

        <button type="submit" disabled={busy}
          className="w-full bg-primary text-white text-sm font-medium rounded-md py-2 disabled:opacity-50">
          {busy ? m.busy : m.cta}
        </button>

        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 mt-3 text-xs">
          {mode !== 'signin' && (
            <button type="button" onClick={() => switchMode('signin')} className="text-primary font-medium">Sign in</button>
          )}
          {mode === 'signin' && (
            <>
              <button type="button" onClick={() => switchMode('forgot')} className="text-gray-500 hover:text-gray-700">Forgot password?</button>
              <button type="button" onClick={() => switchMode('signup')} className="text-primary font-medium">Create account</button>
            </>
          )}
          {mode !== 'magic' && (
            <button type="button" onClick={() => switchMode('magic')} className="text-gray-400 hover:text-gray-600">Email me a link instead</button>
          )}
        </div>
      </form>
    </PageWrapper>
  );
}
