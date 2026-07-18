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
import ResidentScheduler, { submitFeedback, SUPABASE_ENABLED } from './ResidentScheduler';

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

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ResidentScheduler />
  </React.StrictMode>
);
