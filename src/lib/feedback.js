// Pure helpers for the shared `public.feedback` table (EM Scheduling Supabase project, migration
// round11_feedback_rich_shape). Kept free of supabase/React imports so they are unit-testable;
// ResidentScheduler.jsx's submitFeedback/listMyFeedback wrap these around sbFetch.
export const FEEDBACK_APP = 'resident-scheduler';
export const FEEDBACK_MESSAGE_MAX = 4000; // table check: char_length(message) between 1 and 4000
export const FEEDBACK_TYPE_IDS = ['bug', 'crash', 'idea'];

// Row for POST /feedback. Never sets `status` (RLS insert policy requires the 'new' default).
// Returns null when there is nothing valid to send (no user, or empty message).
export function buildFeedbackRow({ type, message, page, meta, user, userAgent, appVersion }) {
  if (!user?.id) return null;
  const text = String(message || '').slice(0, FEEDBACK_MESSAGE_MAX);
  if (!text.trim()) return null;
  return {
    app: FEEDBACK_APP,
    type,
    message: text,
    page: page || null,
    user_agent: userAgent || null,
    app_version: appVersion || null,
    meta: meta || null,
    reported_by: user.id,
    reporter_name: user.email || '',
  };
}

// PostgREST path for "My reports". RLS already limits rows to reported_by = auth.uid(); the app
// filter keeps em-scheduler reports (same user, same table) out of this app's list.
export function myFeedbackPath(limit = 20) {
  const n = Math.max(1, Math.min(100, Math.floor(Number(limit)) || 20));
  return `/feedback?app=eq.${FEEDBACK_APP}&select=id,created_at,type,message,status,admin_reply,admin_reply_at&order=created_at.desc&limit=${n}`;
}
