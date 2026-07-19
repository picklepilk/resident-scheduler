-- Run this ONCE in the Supabase project's SQL editor against the production DB, AFTER
-- migrate_chief_to_admin.sql has already been applied. Adds a third role state, 'pending' — the
-- new default for any brand-new self-registered account — so a first-time signup gets ZERO
-- access (not even picking their resident identity) until an admin explicitly approves them as
-- either 'resident' or 'admin' from the in-app admin-management list.
--
-- Existing 'resident'/'admin' rows are NOT touched by this migration — only the column default
-- and the CHECK constraint change. Nobody already approved gets reset to pending.
begin;

-- 1. Widen the CHECK constraint to admit 'pending', and make it the new insert default.
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

alter table profiles add constraint profiles_role_check check (role in ('pending','resident','admin'));
alter table profiles alter column role set default 'pending';

-- 2. Self-inserts may only ever create a 'pending' row (never self-registering straight into
--    'resident' or 'admin') — same anti-self-promotion property as before, just pinned to the new
--    default value instead of 'resident'.
drop policy if exists "profiles_insert_own" on profiles;
create policy "profiles_insert_own" on profiles for insert
  with check (auth.uid() = id and role = 'pending');

-- 3. Self-updates (e.g. ResidentPicker linking resident_id once already approved) no longer need
--    to pin role to a specific value in WITH CHECK — the trigger in step 4 below now guarantees
--    role can NEVER change via a self-update at all, regardless of payload, which is a stricter
--    (and simpler) invariant than the old "role must equal 'resident'" check it replaces.
drop policy if exists "profiles_update_own" on profiles;
create policy "profiles_update_own" on profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- 4. Replace enforce_admin_role_only_update with a trigger covering BOTH directions in one place:
--    a self-update may never touch role at all (closes a previously-accepted gap where an admin
--    could self-demote via profiles_update_own, since that policy's old WITH CHECK only pinned
--    the value to 'resident' rather than blocking the change outright); a cross-account update
--    (only reachable via profiles_admin_update_role, since profiles_update_own requires
--    auth.uid() = id) may ONLY change role, nothing else — unchanged from before.
drop trigger if exists profiles_admin_role_only_update_guard on profiles;
drop function if exists public.enforce_admin_role_only_update();

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

-- is_admin(), profiles_admin_select_all, profiles_admin_update_role,
-- requests_admin_select_all/requests_admin_update_all are all unchanged — still correct as-is.

commit;

-- Post-migration sanity check (run separately, read-only):
--   select role, count(*) from profiles group by role;
--   -- your own row (and anyone already promoted) should still show 'admin'/'resident',
--   -- unchanged. Only brand-new signups after this point default to 'pending'.
