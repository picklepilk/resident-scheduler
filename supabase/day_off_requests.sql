-- Run this once in the Supabase project's SQL editor to enable the resident day-off request
-- feature. Same "run by hand, no migration tooling" pattern as the res_state table documented
-- in src/ResidentScheduler.jsx's SUPABASE SYNC section.
--
-- Unlike res_state's wide-open RLS, these two tables carry per-resident data, so they use real
-- row-level security scoped by the authenticated user (auth.uid()).

create table profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null,
  role        text not null default 'pending' check (role in ('pending','resident','admin')),
  resident_id text,
  created_at  timestamptz not null default now()
);
alter table profiles enable row level security;

-- Every user (pending, resident, or admin) may read and create only their own profile row. The
-- insert policy pins role to 'pending' (the default) — without this, a self-registered user
-- could insert a profile row with role='resident' or role='admin' before one exists, bypassing
-- admin approval entirely. A brand-new signup gets ZERO app access until an admin explicitly
-- approves them as 'resident' or 'admin' from the in-app admin-management list.
create policy "profiles_select_own" on profiles for select
  using (auth.uid() = id);
-- The role='pending' pin here works with the allowlist promotion below: a BEFORE INSERT trigger
-- may raise the row to 'admin' before this check runs (verified: BEFORE triggers fire first, so
-- the check sees the promoted value), which is why the 'admin' branch exists. That branch is
-- gated on the same allowlist test, so self-registering straight to admin remains impossible.
create policy "profiles_insert_own" on profiles for insert
  with check (
    auth.uid() = id
    and (
      role = 'pending'
      or (role = 'admin' and public.current_user_is_allowlisted_admin())
    )
  );
-- A resident may set their own resident_id (the one-time "which resident are you" pick) once
-- already approved, but can never change their own role through the app at all — see the
-- enforce_profile_role_change_rules trigger below, which blocks any self-update from touching
-- role regardless of payload (a stricter, simpler invariant than pinning to one specific value).
--
-- `role <> 'pending'` in USING is load-bearing, not cosmetic: without it an unapproved account can
-- claim a resident_id through ResidentPicker and then submit requests as that resident (every
-- day_off_requests policy authorizes on resident_id). Since it can pick any roster resident who
-- hasn't registered yet, that is impersonation of a colleague. Confirmed exploitable before this
-- clause existed — see migrate_block_pending_account_access.sql.
--
-- Bootstrapping the FIRST admin still requires a one-time manual SQL edit (flip your own row to
-- role='admin' via the Supabase table editor after first login) — unavoidable, since nothing
-- exists yet to grant it. Every account after that is approved/promoted through the in-app
-- admin-management UI (profiles_admin_update_role below), or skips the queue via the allowlist.
create policy "profiles_update_own" on profiles for update
  using (auth.uid() = id and role <> 'pending')
  with check (auth.uid() = id);

-- ── Pre-authorization allowlist ────────────────────────────────────────────────────────────────
-- A listed email lands in role='admin' on first login instead of 'pending', so a known incoming
-- admin doesn't need a second person present to approve them. Everyone else is unaffected.
--
-- ADDRESSES ARE DATA AND LIVE ONLY IN THE DATABASE — never in this file. This repo is public; see
-- CLAUDE.md's "Data model & conventions". Populate with:
--   insert into admin_email_allowlist (email, note) values ('someone@example.edu', 'why');
--
-- RLS on with NO policies is deliberate: that makes the table unreachable from anon/authenticated
-- sessions entirely. Only postgres/service_role (which bypass RLS) can read or write it. Without
-- that, any signed-in user could enumerate — or insert into — the list of automatic admins.
create table admin_email_allowlist (
  email    text primary key,
  note     text,
  added_at timestamptz not null default now()
);
alter table admin_email_allowlist enable row level security;

-- Zero-argument on purpose. A version taking a caller-supplied email would be an enumeration
-- oracle — any authenticated user could probe whether an address is pre-authorized. This form can
-- only answer "am *I* on the list," which the caller already knows.
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

-- Promotes an allowlisted signup, and pins the stored email to the JWT's.
--
-- The pin matters: AppGate.jsx's first-login upsert sends `email` in its payload, so it is
-- client-controlled. Keying the allowlist check off new.email would let anyone insert a profile
-- claiming an allowlisted address and inherit its admin grant. auth.jwt() is signed by Supabase
-- and cannot be forged. Guarded on a non-null JWT email so postgres/service_role writes (SQL
-- editor, CLI, backfills) still work — those have no JWT and must not have their email nulled.
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

create trigger profiles_admin_allowlist_promote
  before insert on profiles
  for each row execute function public.apply_admin_allowlist();

-- SECURITY DEFINER helper so RLS policies can check "is the caller an admin" without a naive
-- self-referential subquery on profiles (a policy on profiles whose USING clause queries profiles
-- again is a well-known Postgres/Supabase footgun — "infinite recursion detected in policy for
-- relation profiles" — since the inner query is itself subject to profiles' own RLS). A SECURITY
-- DEFINER function bypasses RLS for just this internal lookup, sidestepping it.
create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin');
$$;
grant execute on function public.is_admin() to authenticated;

-- Lets an admin SELECT every profiles row (needed for the in-app admin-management list: who has
-- signed up, what's their role, are they linked to a resident). ORs with profiles_select_own
-- above: for a non-admin caller is_admin() is false, so this contributes nothing and
-- profiles_select_own alone still governs (own row only) — residents get no new visibility.
create policy "profiles_admin_select_all" on profiles for select
  using (is_admin());

-- Lets an admin UPDATE a DIFFERENT user's row (to approve a pending account as resident/admin, or
-- to promote/revoke admin access later). Deliberately scoped to id <> auth.uid() so it never
-- applies to a self-update — self-updates stay governed exclusively by profiles_update_own above.
-- Column-level scoping (role only, nothing else) isn't expressible in WITH CHECK — that's
-- enforced by the enforce_profile_role_change_rules trigger below.
create policy "profiles_admin_update_role" on profiles for update
  using (is_admin() and id <> auth.uid())
  with check (is_admin() and id <> auth.uid());

-- Guards role changes on profiles in both directions, in one place:
--  - Self-update (auth.uid() = old.id, i.e. NOT reached via profiles_admin_update_role above,
--    since that policy excludes id = auth.uid()): role may never change at all, regardless of
--    payload — nobody can promote OR demote themselves through the app.
--  - Cross-account update (the only way to reach this branch — via profiles_admin_update_role):
--    role is the ONLY column allowed to change. Without this, that policy's broad WITH CHECK
--    would let an admin rewrite another user's email or resident_id in the same call that
--    changes their role.
create or replace function public.enforce_profile_role_change_rules()
returns trigger
language plpgsql
as $$
begin
  if auth.uid() = old.id then
    if new.role is distinct from old.role then
      raise exception 'You cannot change your own role';
    end if;
  else
    if new.email is distinct from old.email
       or new.resident_id is distinct from old.resident_id
       or new.created_at is distinct from old.created_at
       or new.id is distinct from old.id
    then
      raise exception 'Admins may only change the role column on another user''s profile';
    end if;
  end if;
  return new;
end;
$$;

create trigger profiles_role_change_guard
  before update on profiles
  for each row execute function public.enforce_profile_role_change_rules();

-- Every request table below (requests_select_own/insert_own/cancel_own) authorizes a resident
-- purely by matching their profile's resident_id — so an UPDATE that re-links resident_id to a
-- different value is a full impersonation path (read/submit/cancel requests as someone else), not
-- just a data-integrity nicety. RLS's plain WITH CHECK can't express "this column may only change
-- from NULL," so (same reasoning as the day_off_requests cancel-only-status trigger) this needs a
-- BEFORE UPDATE trigger with real OLD/NEW access.
create or replace function public.enforce_resident_id_immutable()
returns trigger
language plpgsql
as $$
begin
  if old.resident_id is not null and new.resident_id is distinct from old.resident_id then
    raise exception 'resident_id cannot be changed once set';
  end if;
  return new;
end;
$$;

create trigger profiles_resident_id_immutable
  before update on profiles
  for each row execute function public.enforce_resident_id_immutable();

-- The immutability trigger above only protects a resident_id AFTER it's first set — it does
-- nothing to stop two different accounts from both claiming the SAME resident_id on their
-- (independent) first link, since ResidentPicker's roster list has no identity verification
-- beyond "authenticated, in-domain user." Without this constraint, whoever links second would
-- silently share read/write access to the first claimant's requests. This index makes that a
-- hard database-level conflict instead.
create unique index profiles_resident_id_unique on profiles(resident_id) where resident_id is not null;

create table day_off_requests (
  id            uuid primary key default gen_random_uuid(),
  resident_id   text not null,
  dates         text[] not null,
  reason        text,
  status        text not null default 'pending' check (status in ('pending','approved','denied','cancelled')),
  decision_note text,
  submitted_at  timestamptz not null default now(),
  decided_at    timestamptz,
  decided_by    uuid references profiles(id)
);
alter table day_off_requests enable row level security;

-- A resident may see and create only rows tagged with their own resident_id (looked up from
-- their own profile row, which profiles_select_own already lets them read). The insert policy
-- also pins status/decided_*/decision_note to their unset defaults — without this, a resident
-- could insert a request already marked 'approved' with a fabricated decided_by, bypassing the
-- chief's decision entirely.
-- `role <> 'pending'` folded into each subquery is what makes admin approval actually binding: a
-- pending caller yields no row, so `resident_id = NULL` evaluates to NULL — neither true nor
-- false — and the policy denies. Without it, approval was enforced only by the client, on one
-- route, and an unapproved account could submit requests under a claimed identity.
--
-- NOTE: `status = 'pending'` below is day_off_requests.status (a request awaiting a decision), NOT
-- profiles.role = 'pending' (an account awaiting approval). Same word, unrelated state machines.
create policy "requests_select_own" on day_off_requests for select
  using (
    resident_id = (select resident_id from profiles where id = auth.uid() and role <> 'pending')
  );
create policy "requests_insert_own" on day_off_requests for insert
  with check (
    resident_id = (select resident_id from profiles where id = auth.uid() and role <> 'pending')
    and status = 'pending'
    and decision_note is null
    and decided_at is null
    and decided_by is null
  );
-- A resident may only ever flip their own still-pending request to 'cancelled' (withdrawal).
-- WITH CHECK alone can only pin the new value of individual columns (status='cancelled') — it
-- cannot express "no other column changed," so a resident could otherwise rewrite decision_note/
-- decided_*/dates/reason in the same update. The trigger below closes that gap.
create policy "requests_cancel_own" on day_off_requests for update
  using (
    resident_id = (select resident_id from profiles where id = auth.uid() and role <> 'pending')
    and status = 'pending'
  )
  with check (status = 'cancelled');

-- An admin (role='admin' on their own profile row) may read and decide on every request.
create policy "requests_admin_select_all" on day_off_requests for select
  using (is_admin());
create policy "requests_admin_update_all" on day_off_requests for update
  using (is_admin());

-- Guards requests_cancel_own above: when a resident's update transitions pending -> cancelled,
-- every column except status must stay unchanged. Uses IS DISTINCT FROM (not =/!=) because a
-- pending request's decided_at/decided_by/decision_note/reason are normally NULL, and plain SQL
-- equality against NULL evaluates to NULL (neither true nor false) rather than a usable boolean —
-- with plain =/!=, a resident could smuggle a fabricated decided_by into the same cancel-update
-- undetected, since `NULL = NULL` never trips the guard. Does not affect the admin's approve/deny
-- path (that transitions to 'approved'/'denied', never 'cancelled', so this condition never fires
-- for it — verified: requests_admin_update_all's own USING clause is what authorizes that path,
-- and this trigger only inspects OLD/NEW status, not which policy allowed the write).
create or replace function public.enforce_cancel_only_status()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'cancelled' and old.status = 'pending' then
    if new.resident_id is distinct from old.resident_id
       or new.dates is distinct from old.dates
       or new.reason is distinct from old.reason
       or new.decision_note is distinct from old.decision_note
       or new.submitted_at is distinct from old.submitted_at
       or new.decided_at is distinct from old.decided_at
       or new.decided_by is distinct from old.decided_by
    then
      raise exception 'Cancelling a request may only change status';
    end if;
  end if;
  return new;
end;
$$;

create trigger day_off_requests_cancel_guard
  before update on day_off_requests
  for each row execute function public.enforce_cancel_only_status();

-- requests_admin_update_all above authorizes an admin to update ANY row, but its USING/implicit
-- WITH CHECK only verify the CALLER is an admin — RLS can't express "only these columns changed"
-- at the policy level, so without this trigger an admin update could also rewrite resident_id
-- (impersonation), dates, reason, or submitted_at in the same call that approves/denies a
-- request. Applies to every update regardless of which policy authorized it (resident cancel
-- never touches these columns either, so it's a no-op there) — the only columns any legitimate
-- UPDATE path ever needs to change are status/decision_note/decided_at/decided_by.
create or replace function public.enforce_request_identity_immutable()
returns trigger
language plpgsql
as $$
begin
  if new.resident_id is distinct from old.resident_id
     or new.dates is distinct from old.dates
     or new.reason is distinct from old.reason
     or new.submitted_at is distinct from old.submitted_at
  then
    raise exception 'resident_id, dates, reason, and submitted_at cannot be changed after a request is created';
  end if;
  return new;
end;
$$;

create trigger day_off_requests_identity_guard
  before update on day_off_requests
  for each row execute function public.enforce_request_identity_immutable();
