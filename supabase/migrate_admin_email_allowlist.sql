-- Run this ONCE in the Supabase project's SQL editor against production, after
-- migrate_add_pending_approval.sql. Adds a pre-authorization allowlist: a listed email lands
-- straight in role='admin' on first login instead of role='pending', so a known incoming admin
-- doesn't need a second person to approve them. Everyone NOT on the list is unaffected and still
-- defaults to 'pending' awaiting approval.
--
-- This file contains the MECHANISM ONLY. The actual email addresses are data, inserted by hand
-- (see the commented example at the bottom) and deliberately never committed — this repo is
-- public, and real addresses are PII. See CLAUDE.md's "Data model & conventions".

begin;

-- Who may skip the pending queue. RLS is enabled with NO policies, deliberately: that makes the
-- table unreachable from anon/authenticated sessions entirely. Only postgres/service_role — which
-- bypass RLS — can read or write it, i.e. the SQL editor and the CLI. Without this, any signed-in
-- user could enumerate (or worse, insert into) the list of people who get automatic admin.
create table if not exists admin_email_allowlist (
  email    text primary key,
  note     text,
  added_at timestamptz not null default now()
);
alter table admin_email_allowlist enable row level security;

-- Zero-argument on purpose. An is_allowlisted_admin(email text) taking caller-supplied input
-- would be an enumeration oracle — any authenticated user could probe whether a given address is
-- pre-authorized. This form can only ever answer "am *I* on the list," which the caller already
-- knows. SECURITY DEFINER so it can read the RLS-locked table above.
create or replace function public.current_user_is_allowlisted_admin()
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from admin_email_allowlist
    where email = lower(nullif(auth.jwt() ->> 'email', ''))
  );
$$;
revoke execute on function public.current_user_is_allowlisted_admin() from public, anon;
grant execute on function public.current_user_is_allowlisted_admin() to authenticated;

-- Promotes an allowlisted signup at insert time, and pins the stored email to the JWT's.
--
-- The email pin matters: AppGate.jsx's first-login upsert sends `email` in its payload, so it is
-- client-controlled. Keying the allowlist check off new.email would let anyone insert a profile
-- claiming an allowlisted address and inherit its admin grant. auth.jwt() is signed by Supabase
-- and cannot be forged by the client, so it is the only trustworthy source here.
--
-- Guarded on a non-null JWT email so postgres/service_role writes (SQL editor, CLI, backfills)
-- still work — those have no JWT and must not have their email column nulled out.
create or replace function public.apply_admin_allowlist()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  jwt_email text := lower(nullif(auth.jwt() ->> 'email', ''));
begin
  if jwt_email is not null then
    new.email := jwt_email;
    if exists (select 1 from admin_email_allowlist where email = jwt_email) then
      new.role := 'admin';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_admin_allowlist_promote on profiles;
create trigger profiles_admin_allowlist_promote
  before insert on profiles
  for each row execute function public.apply_admin_allowlist();

-- The insert policy has to admit the promoted value. Verified empirically: a BEFORE INSERT
-- trigger runs before RLS's WITH CHECK is evaluated, so the check sees role='admin' (not the
-- 'pending' default the client sent) and would otherwise reject the very row we just promoted.
-- The role='admin' branch is gated on the same allowlist check, so this widens nothing for a
-- caller who isn't on the list — self-registering straight to admin remains impossible.
drop policy if exists "profiles_insert_own" on profiles;
create policy "profiles_insert_own" on profiles for insert
  with check (
    auth.uid() = id
    and (
      role = 'pending'
      or (role = 'admin' and public.current_user_is_allowlisted_admin())
    )
  );

commit;

-- Add pre-authorized admins as DATA, never in this committed file:
--   insert into admin_email_allowlist (email, note)
--   values ('someone@example.edu', 'why they are pre-authorized')
--   on conflict (email) do nothing;
--
-- The allowlist only affects a profile row's FIRST creation. Removing an address later does not
-- demote an existing admin — revoke that from the in-app admin list instead.
