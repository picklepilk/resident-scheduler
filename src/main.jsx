import React from 'react';
import ReactDOM from 'react-dom/client';
import '@fontsource/barlow/400.css';
import '@fontsource/barlow/500.css';
import '@fontsource/barlow/600.css';
import '@fontsource/barlow/700.css';
import '@fontsource/barlow-condensed/600.css';
import '@fontsource/barlow-condensed/700.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/600.css';
import '@fontsource/jetbrains-mono/700.css';
import './index.css';
import { submitFeedback, SUPABASE_ENABLED } from './ResidentScheduler';
import ResidentRequestsApp from './residentRequests/ResidentRequestsApp';
import AppGate from './AppGate';

// ─── ERROR BOUNDARY ─────────────────────────────────────────────────────────
// Without this, any render-time throw (e.g. opening a block with an edge-case date/rule
// combination) unmounts the whole tree, leaving a blank #root with no way to recover except
// a hard reload. Local data is untouched by a render crash — only in-memory React state is
// lost — so the recovery screen just needs to get the user back to a working tab.
class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { reportCrash(error?.message, error?.stack || info?.componentStack); }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f3f4f6', fontFamily: 'sans-serif', padding: 24 }}>
        <div style={{ maxWidth: 480, background: '#fff', borderRadius: 12, padding: 32, boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
          <h1 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Something went wrong</h1>
          <p style={{ fontSize: 14, color: '#4b5563', marginBottom: 16 }}>
            The app hit an unexpected error and couldn't finish rendering this screen. Your saved
            data hasn't been touched — it's still in local storage (and synced to the cloud, if
            configured). Reloading usually gets you back to a working tab.
          </p>
          <p style={{ fontSize: 12, color: '#9ca3af', marginBottom: 16, fontFamily: 'monospace' }}>{String(this.state.error?.message || this.state.error)}</p>
          <button onClick={() => window.location.reload()} style={{ background: '#0057B8', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 14, fontWeight: 500, cursor: 'pointer' }}>
            Reload
          </button>
        </div>
      </div>
    );
  }
}

// ─── CRASH AUTO-CAPTURE ─────────────────────────────────────────────────────
// Installed once here (main.jsx runs exactly once per page load). No-ops entirely when
// SUPABASE_ENABLED is false. Deduped per session (same message + first stack line only ever
// reported once) and capped at 5 auto-reports per session so a tight error loop can't flood
// the feedback table.
const CRASH_SEEN_KEY = 'res_feedback_crash_seen';
const CRASH_COUNT_KEY = 'res_feedback_crash_count';
const CRASH_CAP = 5;

function crashKey(message, stack) {
  const firstStackLine = (stack || '').split('\n')[1]?.trim() || '';
  return `${message}::${firstStackLine}`;
}

function reportCrash(message, stack) {
  if (!SUPABASE_ENABLED) return;
  try {
    const seen = JSON.parse(sessionStorage.getItem(CRASH_SEEN_KEY) || '[]');
    const count = Number(sessionStorage.getItem(CRASH_COUNT_KEY) || '0');
    const key = crashKey(message, stack);
    if (seen.includes(key) || count >= CRASH_CAP) return;
    sessionStorage.setItem(CRASH_SEEN_KEY, JSON.stringify([...seen, key]));
    sessionStorage.setItem(CRASH_COUNT_KEY, String(count + 1));
    submitFeedback({
      type: 'crash',
      message: String(message || 'Unknown error').slice(0, 500),
      meta: { stack: stack || null },
    }).catch(() => {}); // a failed report must never itself throw an unhandledrejection
  } catch {
    // sessionStorage unavailable (e.g. private browsing) — skip crash capture entirely
  }
}

window.addEventListener('error', (e) => {
  reportCrash(e.message, e.error && e.error.stack);
});
window.addEventListener('unhandledrejection', (e) => {
  const reason = e.reason;
  const message = reason && reason.message ? reason.message : String(reason);
  const stack = reason && reason.stack ? reason.stack : '';
  reportCrash(message, stack);
});

const isRequestsRoute = window.location.pathname.replace(/\/+$/, '') === '/requests';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      {isRequestsRoute ? <ResidentRequestsApp /> : <AppGate />}
    </ErrorBoundary>
  </React.StrictMode>
);
