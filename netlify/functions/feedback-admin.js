// Password-gated read/update access to the `feedback` table, using the Supabase service-role
// key (server-only — never shipped to the client, unlike VITE_SUPABASE_ANON_KEY). This is the
// ONLY way feedback rows are ever read back; the client's sbFetch calls (submitFeedback) use
// the anon key and can only INSERT, per the table's RLS policy (see
// docs/superpowers/plans/2026-07-18-user-feedback-plan.md Task 1).
const APP_NAME = 'resident-scheduler';

export const handler = async (event) => {
  const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
  const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const ADMIN_PASSWORD = process.env.FEEDBACK_ADMIN_PASSWORD;

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !ADMIN_PASSWORD) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'feedback-admin function is not configured (missing SUPABASE_SERVICE_ROLE_KEY, FEEDBACK_ADMIN_PASSWORD, or VITE_SUPABASE_URL).' }),
    };
  }

  const suppliedPassword = event.headers['x-feedback-password'] || event.headers['X-Feedback-Password'];
  if (suppliedPassword !== ADMIN_PASSWORD) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  const sbHeaders = {
    apikey: SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
  };

  // Same 15s bound as ResidentScheduler.jsx's sbFetch, for the same reason: a stalled (not
  // failed) Supabase response would otherwise hang until Netlify's own platform timeout kills
  // the function, with no controlled error response to the client.
  const withTimeout = async (url, opts) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      return await fetch(url, { ...opts, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  };

  if (event.httpMethod === 'GET') {
    const res = await withTimeout(
      `${SUPABASE_URL}/rest/v1/feedback?app_name=eq.${APP_NAME}&select=*&order=created_at.desc`,
      { headers: sbHeaders }
    );
    if (!res.ok) {
      const msg = await res.text().catch(() => res.statusText);
      return { statusCode: 502, body: JSON.stringify({ error: `Supabase error: ${msg}` }) };
    }
    const rows = await res.json();
    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(rows) };
  }

  if (event.httpMethod === 'PATCH') {
    let payload;
    try {
      payload = JSON.parse(event.body || '{}');
    } catch {
      return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) };
    }
    const { id, status } = payload;
    if (!id || !['new', 'reviewed', 'resolved'].includes(status)) {
      return { statusCode: 400, body: JSON.stringify({ error: 'id and a valid status (new|reviewed|resolved) are required' }) };
    }
    const res = await withTimeout(
      `${SUPABASE_URL}/rest/v1/feedback?id=eq.${id}&app_name=eq.${APP_NAME}`,
      {
        method: 'PATCH',
        headers: { ...sbHeaders, Prefer: 'return=representation' },
        body: JSON.stringify({ status }),
      }
    );
    if (!res.ok) {
      const msg = await res.text().catch(() => res.statusText);
      return { statusCode: 502, body: JSON.stringify({ error: `Supabase error: ${msg}` }) };
    }
    const rows = await res.json();
    if (!rows.length) {
      return { statusCode: 404, body: JSON.stringify({ error: 'Feedback row not found for this app' }) };
    }
    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(rows[0]) };
  }

  return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
};
