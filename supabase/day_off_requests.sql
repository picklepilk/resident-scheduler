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

-- Every user (resident or chief) may read and create only their own profile row.
create policy "profiles_select_own" on profiles for select
  using (auth.uid() = id);
create policy "profiles_insert_own" on profiles for insert
  with check (auth.uid() = id);
-- A resident may set their own resident_id (the one-time "which resident are you" pick) but can
-- never grant themselves the 'chief' role through the app — role stays 'resident' on any
-- self-update. The chief's own row is flipped to role='chief' manually via the Supabase table
-- editor after their first login (one-time bootstrap, not a feature to build).
create policy "profiles_update_own" on profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id and role = 'resident');

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
-- their own profile row, which profiles_select_own already lets them read).
create policy "requests_select_own" on day_off_requests for select
  using (resident_id = (select resident_id from profiles where id = auth.uid()));
create policy "requests_insert_own" on day_off_requests for insert
  with check (resident_id = (select resident_id from profiles where id = auth.uid()));
-- A resident may only ever flip their own still-pending request to 'cancelled' (withdrawal) —
-- never touch status/decision_note/decided_* in any other way.
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
