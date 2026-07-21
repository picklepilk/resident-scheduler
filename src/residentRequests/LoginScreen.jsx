import { useState } from 'react';
import { Mail, CheckCircle2 } from 'lucide-react';
import { supabase, AUTH_ENABLED, ALLOWED_EMAIL_DOMAIN } from '../supabaseClient';

// embedded=true drops the full-page centered layout in favor of a plain inline block, so this
// same component can be reused inside a tab panel (Task 9's chief-facing Requests tab) without a
// second copy of the magic-link-send form/logic.
function PageWrapper({ embedded, children }) {
  if (embedded) return <div className="max-w-sm">{children}</div>;
  return <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">{children}</div>;
}

export default function LoginScreen({ embedded = false, title = 'Day-Off Requests', subtitle }) {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (!AUTH_ENABLED) {
    return (
      <PageWrapper embedded={embedded}>
        <p className="text-sm text-gray-500 max-w-sm text-center">
          Day-off requests aren't configured yet. {embedded ? 'Set VITE_ALLOWED_EMAIL_DOMAIN.' : 'Ask the chief resident to finish setup.'}
        </p>
      </PageWrapper>
    );
  }

  async function submit(e) {
    e.preventDefault();
    setError('');
    const trimmed = email.trim().toLowerCase();
    if (!trimmed.endsWith(`@${ALLOWED_EMAIL_DOMAIN.toLowerCase()}`)) {
      setError(`Please use your @${ALLOWED_EMAIL_DOMAIN} email address.`);
      return;
    }
    setBusy(true);
    const { error: sendError } = await supabase.auth.signInWithOtp({ email: trimmed });
    setBusy(false);
    if (sendError) { setError(sendError.message); return; }
    setSent(true);
  }

  if (sent) {
    return (
      <PageWrapper embedded={embedded}>
        <div className="text-center max-w-sm">
          <CheckCircle2 className="mx-auto text-primary mb-3" size={32} />
          <p className="font-display text-2xl font-semibold uppercase tracking-wide text-gray-800 mb-1">Check your email</p>
          <p className="text-sm text-gray-500">We sent a sign-in link to {email}.</p>
        </div>
      </PageWrapper>
    );
  }

  return (
    <PageWrapper embedded={embedded}>
      <form onSubmit={submit} className={embedded ? '' : 'bg-white border border-gray-200 rounded-lg p-6 w-full max-w-sm'}>
        <p className="font-display text-2xl font-semibold uppercase tracking-wide text-gray-800 mb-1">{title}</p>
        <p className="text-sm text-gray-500 mb-4">{subtitle || `Sign in with your @${ALLOWED_EMAIL_DOMAIN} email.`}</p>
        <label className="block text-xs font-medium text-gray-700 mb-1">Email</label>
        <div className="relative mb-3">
          <Mail size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="email" required value={email} onChange={e => setEmail(e.target.value)}
            className="input-field pl-8 w-full" placeholder={`you@${ALLOWED_EMAIL_DOMAIN}`} />
        </div>
        {error && <p className="text-xs text-red-500 mb-3">{error}</p>}
        <button type="submit" disabled={busy}
          className="w-full bg-primary text-white text-sm font-medium rounded-md py-2 disabled:opacity-50">
          {busy ? 'Sending…' : 'Send sign-in link'}
        </button>
      </form>
    </PageWrapper>
  );
}
