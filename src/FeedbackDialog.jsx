import React, { useState, useEffect, useRef, useId } from 'react';
import { X } from 'lucide-react';
import { supabase } from './supabaseClient';
import { FEEDBACK_KINDS, FEEDBACK_MAX, submitFeedback } from './lib/feedback.js';

// Modal for sending bug/crash/idea feedback to public.feedback. Mirrors ResidentScheduler's Modal
// markup (kept local so this file stays independent of that 26k-line module).
export default function FeedbackDialog({ onClose }) {
  const [kind, setKind] = useState('bug');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const [sent, setSent] = useState(false);
  const areaRef = useRef(null);
  const closeRef = useRef(null);
  const opener = useRef(typeof document !== 'undefined' ? document.activeElement : null);
  const uid = useId();

  useEffect(() => { areaRef.current?.focus(); }, []);
  useEffect(() => () => { try { opener.current?.focus?.(); } catch { /* element gone */ } }, []);
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [onClose]);
  useEffect(() => { if (sent) closeRef.current?.focus(); }, [sent]);

  async function send(e) {
    e.preventDefault();
    if (sending) return;
    setSending(true); setError(null);
    const page = typeof window !== 'undefined' ? window.location.pathname : undefined;
    const res = await submitFeedback(supabase, { kind, message, page });
    setSending(false);
    if (res.ok) setSent(true); else setError(res.error);
  }

  const tooLong = message.length > FEEDBACK_MAX;
  const field = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm';
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center sm:p-4 z-50"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby={`${uid}-title`}
        className="bg-white shadow-2xl flex flex-col w-full h-full max-h-[100dvh] rounded-none sm:h-auto sm:max-h-[90vh] sm:rounded-xl sm:max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 shrink-0">
          <h2 id={`${uid}-title`} className="text-base font-semibold text-gray-800">Send feedback</h2>
          <button ref={closeRef} onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-gray-600"><X size={18}/></button>
        </div>
        <div className="overflow-y-auto flex-1 px-5 py-4">
          {sent ? (
            <div role="status" className="text-sm text-gray-700">
              <p className="font-medium">Thanks — sent</p>
              <button onClick={onClose} className="mt-4 px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-sm">Close</button>
            </div>
          ) : (
            <form onSubmit={send} className="space-y-4">
              <div>
                <label htmlFor={`${uid}-kind`} className="block text-xs font-medium text-gray-600 mb-1">Kind</label>
                <select id={`${uid}-kind`} value={kind} onChange={e => setKind(e.target.value)} className={field}>
                  {FEEDBACK_KINDS.map(k => <option key={k.value} value={k.value}>{k.label}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor={`${uid}-msg`} className="block text-xs font-medium text-gray-600 mb-1">Message</label>
                <textarea id={`${uid}-msg`} ref={areaRef} value={message} rows={6} required
                  onChange={e => setMessage(e.target.value)} aria-describedby={`${uid}-count`}
                  className={field}/>
                <div id={`${uid}-count`} className={`text-xs mt-1 text-right ${tooLong ? 'text-red-600' : 'text-gray-400'}`}>
                  {message.length} / {FEEDBACK_MAX}
                </div>
              </div>
              {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
              <div className="flex justify-end gap-2">
                <button type="button" onClick={onClose} className="px-3 py-1.5 rounded-lg text-sm text-gray-600 hover:bg-gray-100">Cancel</button>
                <button type="submit" disabled={sending || !message.trim() || tooLong}
                  className="px-3 py-1.5 rounded-lg text-sm bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
                  {sending ? 'Sending…' : 'Send'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
