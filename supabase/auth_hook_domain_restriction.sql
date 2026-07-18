-- Run once, after day_off_requests.sql. Wires a "Before User Created" Auth Hook so email-domain
-- restriction is enforced server-side — a client-side-only check can be bypassed by calling
-- Supabase's auth API directly with the public anon key, which is unavoidably visible in this
-- public repo's deployed bundle.
--
-- After running this script, finish the wiring in the Supabase dashboard: Authentication → Hooks
-- → "Before User Created" → select the Postgres function `public.restrict_signup_domain`.
--
-- IMPORTANT: replace 'youruh.edu' below with the actual institutional domain — this must match
-- VITE_ALLOWED_EMAIL_DOMAIN exactly, or legitimate signups will be rejected.

create or replace function public.restrict_signup_domain()
returns jsonb
language plpgsql
as $$
declare
  user_email text := (event->'user'->>'email');
begin
  if user_email is null or right(lower(user_email), length('@youruh.edu')) <> '@youruh.edu' then
    return jsonb_build_object(
      'error', jsonb_build_object(
        'http_code', 403,
        'message', 'Sign-up is restricted to youruh.edu email addresses.'
      )
    );
  end if;
  return jsonb_build_object();
end;
$$;
