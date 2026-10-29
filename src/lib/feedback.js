// Pure logic for the "Send feedback" dialog. Writes to public.feedback (RLS: signed-in users may
// INSERT only, created_by = auth.uid(); no SELECT), so the insert must NOT chain .select().
export const FEEDBACK_APP = 'residentscheduling';
export const FEEDBACK_MAX = 4000;
export const FEEDBACK_KINDS = [
  { value: 'bug', label: 'Bug' },
  { value: 'crash', label: 'Crash' },
  { value: 'idea', label: 'Idea' },
];

// Returns an error string, or null when sendable.
export function validateFeedback({ kind, message }) {
  if (!FEEDBACK_KINDS.some(k => k.value === kind)) return 'Pick a kind.';
  const text = (message ?? '').trim();
  if (!text) return 'Write a message first.';
  if (text.length > FEEDBACK_MAX) return `Message is too long (max ${FEEDBACK_MAX} characters).`;
  return null;
}

// Body = trimmed message prefixed with "[page: /x]" when it still fits in FEEDBACK_MAX.
export function buildFeedbackBody(message, page) {
  const text = (message ?? '').trim();
  if (!page) return text;
  const prefix = `[page: ${page}] `;
  return prefix.length + text.length <= FEEDBACK_MAX ? prefix + text : text;
}

export function buildFeedbackPayload({ kind, message, page }) {
  return { app: FEEDBACK_APP, kind, body: buildFeedbackBody(message, page) };
}

// Never throws. { ok: true } or { ok: false, error } so the caller can keep the user's text.
export async function submitFeedback(client, { kind, message, page }) {
  const invalid = validateFeedback({ kind, message });
  if (invalid) return { ok: false, error: invalid };
  if (!client) return { ok: false, error: 'Feedback is unavailable (not signed in to the cloud).' };
  try {
    const { error } = await client.from('feedback').insert(buildFeedbackPayload({ kind, message, page }));
    if (error) return { ok: false, error: error.message || 'Could not send feedback.' };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e?.message || 'Could not send feedback.' };
  }
}
