-- Run this ONCE in the Supabase project's SQL editor against the production DB to move the
-- 'chief' role concept to 'admin' and add in-app admin-promotion support. Companion to
-- day_off_requests.sql, which has been updated to reflect this same end state for future fresh
-- installs — running that file again does NOT re-apply these changes to an already-provisioned
-- database, hence this separate migration.
--
-- Take a DB backup/snapshot before running. See docs/ or the plan that produced this file for the
-- full risk/verification checklist.
begin;

-- 1. Data first: flip any existing 'chief' row(s) to 'admin'. The old CHECK constraint (which
--    permits only 'resident'/'chief') must be dropped before 'admin' can be written, so: drop the
--    constraint (looked up dynamically, not by a hardcoded name, since Postgres auto-generates
--    it), update the data, then add the new constraint back.
do $$
declare
  conname text;
begin
  select c.conname into conname
  from pg_constraint c
  join pg_class t on t.oid = c.conrelid
  where t.relname = 'profiles' and c.contype = 'c'
    and pg_get_constraintdef(c.oid) ilike '%role%';
  if conname is not null then
    execute format('alter table profiles drop constraint %I', conname);
  end if;
end $$;

update profiles set role = 'admin' where role = 'chief';

alter table profiles add constraint profiles_role_check check (role in ('resident','admin'));

-- 2. SECURITY DEFINER helper so RLS policies can check "is the caller an admin" without a naive
--    self-referential subquery on profiles (a policy on profiles whose USING clause queries
--    profiles again is a well-known Postgres/Supabase footgun — "infinite recursion detected in
--    policy for relation profiles" — because the inner query is itself subject to profiles' RLS).
--    A SECURITY DEFINER function bypasses RLS for just this internal lookup, sidestepping it.
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

-- 3. Rename the chief-named day_off_requests policies to admin, using is_admin() instead of the
--    old inline exists(...) so there's a single source of truth for "is caller an admin."
drop policy if exists "requests_chief_select_all" on day_off_requests;
drop policy if exists "requests_chief_update_all" on day_off_requests;
create policy "requests_admin_select_all" on day_off_requests for select
  using (is_admin());
create policy "requests_admin_update_all" on day_off_requests for update
  using (is_admin());

-- 4. New profiles policies for the in-app admin-management UI.
--    (a) Lets an admin SELECT every profiles row (needed to list "who has signed up / what's
--        their role / are they linked to a resident"). ORs with the existing profiles_select_own
--        permissive policy: for a non-admin caller, is_admin() is false, so this policy
--        contributes nothing and profiles_select_own alone still governs (own row only) — a
--        resident session gets NO new visibility from this change.
drop policy if exists "profiles_admin_select_all" on profiles;
create policy "profiles_admin_select_all" on profiles for select
  using (is_admin());

--    (b) Lets an admin UPDATE a DIFFERENT user's row. Deliberately scoped to id <> auth.uid() so
--        it never applies to a self-update — self-updates remain governed exclusively by the
--        existing profiles_update_own policy (unchanged). Column-level scoping (role only,
--        nothing else) is NOT expressible in WITH CHECK — that's enforced by the trigger below.
drop policy if exists "profiles_admin_update_role" on profiles;
create policy "profiles_admin_update_role" on profiles for update
  using (is_admin() and id <> auth.uid())
  with check (is_admin() and id <> auth.uid());

-- 5. Column-scoping trigger for profiles_admin_update_role above: when a caller updates a
--    DIFFERENT user's profile row (old.id <> auth.uid() — the only way to reach this branch is
--    via profiles_admin_update_role, since profiles_update_own requires auth.uid() = id), only
--    the role column may change. Mirrors enforce_cancel_only_status's pattern below. Without
--    this, profiles_admin_update_role's broad WITH CHECK would let an admin rewrite another
--    user's email or resident_id in the same call that changes their role.
create or replace function public.enforce_admin_role_only_update()
returns trigger
language plpgsql
as $$
begin
  if old.id is distinct from auth.uid() then
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

drop trigger if exists profiles_admin_role_only_update_guard on profiles;
create trigger profiles_admin_role_only_update_guard
  before update on profiles
  for each row execute function public.enforce_admin_role_only_update();

commit;

-- 6. Bootstrap YOUR OWN account straight to 'admin' — you go directly from 'resident' (or no row
--    yet) to 'admin', never through 'chief' at any point. This is the one irreducible manual step
--    (see day_off_requests.sql's profiles_update_own comment: an RLS-blocked self-promotion is by
--    design) — everyone after you is promoted from the in-app "Admin access" list instead.
--
--    Sign in at least once first (so your profiles row exists), then EDIT THE EMAIL BELOW to your
--    real @uthscsa.edu address and run just this one statement (left as a placeholder rather than
--    committed with a real address, since this file lives in a public repo):
--
-- update profiles set role = 'admin' where email = 'YOUR_EMAIL@uthscsa.edu';

-- Post-migration sanity check (run separately, read-only):
--   select role, count(*) from profiles group by role;
--   -- expect zero 'chief' rows, at least one 'admin' row (yours, once step 6 above is run).
--   select forcerowsecurity from pg_class where relname = 'profiles';
--   -- expect false, or is_admin()'s SECURITY DEFINER lookup could itself get RLS-filtered.
