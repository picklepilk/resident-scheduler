-- Run this once in the Supabase project's SQL editor to enable the resident day-off request
-- feature. Same "run by hand, no migration tooling" pattern as the res_state table documented
-- in src/ResidentScheduler.jsx's SUPABASE SYNC section.
--
-- Unlike res_state's wide-open RLS, these two tables carry per-resident data, so they use real
-- row-level security scoped by the authenticated user (auth.uid()).

create table profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null,
  role        text not null default 'resident' check (role in ('resident','chief')),
  resident_id text,
  created_at  timestamptz not null default now()
);
alter table profiles enable row level security;

-- Every user (resident or chief) may read and create only their own profile row. The insert
-- policy pins role to 'resident' (like the update policy below) — without this, a resident could
-- self-insert a profile row with role='chief' before one exists, self-promoting to admin.
create policy "profiles_select_own" on profiles for select
  using (auth.uid() = id);
create policy "profiles_insert_own" on profiles for insert
  with check (auth.uid() = id and role = 'resident');
-- A resident may set their own resident_id (the one-time "which resident are you" pick) but can
-- never grant themselves the 'chief' role through the app — role stays 'resident' on any
-- self-update. The chief's own row is flipped to role='chief' manually via the Supabase table
-- editor after their first login (one-time bootstrap, not a feature to build).
create policy "profiles_update_own" on profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id and role = 'resident');

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
create policy "requests_select_own" on day_off_requests for select
  using (resident_id = (select resident_id from profiles where id = auth.uid()));
create policy "requests_insert_own" on day_off_requests for insert
  with check (
    resident_id = (select resident_id from profiles where id = auth.uid())
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
    resident_id = (select resident_id from profiles where id = auth.uid())
    and status = 'pending'
  )
  with check (status = 'cancelled');

-- The chief (role='chief' on their own profile row) may read and decide on every request.
create policy "requests_chief_select_all" on day_off_requests for select
  using (exists (select 1 from profiles where id = auth.uid() and role = 'chief'));
create policy "requests_chief_update_all" on day_off_requests for update
  using (exists (select 1 from profiles where id = auth.uid() and role = 'chief'));

-- Guards requests_cancel_own above: when a resident's update transitions pending -> cancelled,
-- every column except status must stay unchanged. Uses IS DISTINCT FROM (not =/!=) because a
-- pending request's decided_at/decided_by/decision_note/reason are normally NULL, and plain SQL
-- equality against NULL evaluates to NULL (neither true nor false) rather than a usable boolean —
-- with plain =/!=, a resident could smuggle a fabricated decided_by into the same cancel-update
-- undetected, since `NULL = NULL` never trips the guard. Does not affect the chief's approve/deny
-- path (that transitions to 'approved'/'denied', never 'cancelled', so this condition never fires
-- for it — verified: requests_chief_update_all's own USING clause is what authorizes that path,
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
