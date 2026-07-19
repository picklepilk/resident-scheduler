// Deploy with: supabase functions deploy notify-request
// Then set the secret once: supabase secrets set RESEND_API_KEY=re_xxx CHIEF_EMAIL=chief@youruh.edu
//
// Receives a Supabase Database Webhook payload (see webhooks.sql) on day_off_requests INSERT and
// UPDATE, and emails the relevant person via Resend. Fails soft — a Resend error is logged, not
// thrown, so a flaky email provider never blocks the underlying database write that triggered it
// (the webhook fires after the write commits).

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!;
const CHIEF_EMAIL = Deno.env.get('CHIEF_EMAIL')!;
const FROM_EMAIL = 'requests@resend.dev'; // replace with a verified sending domain once set up in Resend

async function sendEmail(to: string, subject: string, text: string) {
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM_EMAIL, to, subject, text }),
    });
  } catch (err) {
    console.error('Resend send failed:', err);
  }
}

Deno.serve(async (req) => {
  const payload = await req.json();
  const { type, table, record, old_record } = payload;
  if (table !== 'day_off_requests') return new Response('ignored', { status: 200 });

  if (type === 'INSERT' && record.status === 'pending') {
    await sendEmail(
      CHIEF_EMAIL,
      'New day-off request submitted',
      `A new day-off request needs review.\nDates: ${record.dates.join(', ')}\nReason: ${record.reason || '(none given)'}`
    );
  }

  if (type === 'UPDATE' && old_record.status === 'pending' && (record.status === 'approved' || record.status === 'denied')) {
    // The Edge Function doesn't have the resident's email directly on this row — look it up via
    // the profiles table (service-role key, bypasses RLS, since this runs server-side).
    const profileRes = await fetch(
      `${Deno.env.get('SUPABASE_URL')}/rest/v1/profiles?resident_id=eq.${record.resident_id}&select=email`,
      { headers: { apikey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}` } }
    );
    const profiles = await profileRes.json();
    const residentEmail = profiles?.[0]?.email;
    if (residentEmail) {
      await sendEmail(
        residentEmail,
        `Your day-off request was ${record.status}`,
        `Dates: ${record.dates.join(', ')}\n${record.decision_note ? `Note from the chief: ${record.decision_note}` : ''}`
      );
    }
  }

  return new Response('ok', { status: 200 });
});
