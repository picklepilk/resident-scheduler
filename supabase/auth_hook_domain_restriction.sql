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

-- Supabase's Postgres Auth Hook contract invokes this with a single `event jsonb` argument — the
-- function body reads `event->'user'->>'email'` below, so the parameter must be declared or every
-- invocation errors before the domain check ever runs (a silent full bypass or a signup outage,
-- depending on how the hook runtime handles the exception — either way, unacceptable for the
-- app's sole signup security gate).
create or replace function public.restrict_signup_domain(event jsonb)
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

-- Supabase's documented pattern for Postgres-function Auth Hooks: only the auth system itself
-- should be able to invoke this — otherwise it's also reachable as an arbitrary PostgREST RPC
-- endpoint (/rest/v1/rpc/restrict_signup_domain) by any anon/authenticated caller. Not a bypass of
-- the domain check itself (calling it directly doesn't create a user), but unnecessary surface.
revoke execute on function public.restrict_signup_domain(jsonb) from public, anon, authenticated;
grant execute on function public.restrict_signup_domain(jsonb) to supabase_auth_admin;
