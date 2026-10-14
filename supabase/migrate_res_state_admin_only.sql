-- Run this ONCE in the Supabase project's SQL editor against production.
--
-- *** DEPLOY ORDER (load-bearing) ***
--   1. Ship the CLIENT first — the build that sends `Authorization: Bearer <session JWT>` instead
--      of the anon key on every request to res_state (src/supabaseClient.js's getAccessToken(),
--      ResidentScheduler.jsx's sbFetch, SUPABASE SYNC section) AND the resident-facing build that
--      calls public.resident_block_lookup() instead of reading res_state directly
--      (src/residentRequests/blockLookup.js).
--   2. THEN run this migration.
-- Running this migration first (or deploying an old client bundle afterwards) locks every admin
-- out of the scheduler: the old client sends the anon key as Authorization, which this migration
-- makes unable to see res_state at all, and res_state's own mount-time load fails CLOSED on an
-- unauthorized empty result (dbReady never becomes true — see ResidentScheduler.jsx's mount
-- effect) rather than silently treating it as "no cloud row yet, safe to use the app anyway".
--
-- SECURITY GAP THIS CLOSES: res_state (one row per department: id='main' for real data, id='demo'
-- for the Demo Sandbox) has held EVERY resident's name and the full generated schedule since this
-- feature shipped, under `create policy "public_read_write" on res_state for all using (true) with
-- check (true)` — deliberately wide-open at the time, on the theory that the anon key is "safe to
-- expose client-side" by Supabase's own design. That theory holds for a key that's only ever used
-- to IDENTIFY a request to Supabase; it does NOT hold here, because this was also the only
-- credential sbFetch (ResidentScheduler.jsx) and the resident-facing blockLookup.js ever sent as
-- Authorization. Anyone who extracted the anon key from the deployed bundle's network requests —
-- trivial; it's sent on every request, including from the fully unauthenticated main `/` route
-- before AppGate/AUTH_ENABLED existed — had full read/write on every resident's name and schedule,
-- with no login required at all. Decision (2026-10-14): residents must NOT see schedules;
-- schedule data is admin-only. Residents still need a few non-schedule fields read-only
-- (scheduling-block dates for "which block is this date in", roster first/last names for the
-- self-identification picker) — that's what public.resident_block_lookup() below serves, scoped
-- to exactly those fields and gated the same way day_off_requests already is (approved accounts
-- only, via migrate_block_pending_account_access.sql's `role <> 'pending'` pattern).
--
-- Take a DB backup/snapshot before running, same as migrate_chief_to_admin.sql.

begin;

-- Fresh-install safety net — a DB that somehow never ran the original by-hand `create table`
-- (see ResidentScheduler.jsx's SUPABASE SYNC section header comment, now updated to describe this
-- end state) gets the table created here instead of failing on the ALTER/POLICY statements below.
create table if not exists res_state (
  id       text primary key,
  data     jsonb not null,
  saved_at timestamptz default now()
);
alter table res_state enable row level security;

-- Drop the wide-open policy this migration exists to close.
drop policy if exists "public_read_write" on res_state;

-- Belt-and-suspenders: Supabase's default project template grants table-level privileges to anon
-- directly (separate from RLS policies) — revoke them so even a future RLS misconfiguration can't
-- hand anon anything. authenticated keeps its default table-level grants; the policy below is what
-- actually restricts rows for it.
revoke all on res_state from anon;

-- Every operation gated on is_admin() (day_off_requests.sql) — same helper the day_off_requests
-- admin policies already use, so there's exactly one definition of "is the caller an admin"
-- in this schema. A pending or resident-role caller gets zero rows from res_state entirely, not
-- even their own; there is no "own row" concept here, it's one shared department document.
create policy "res_state_admin_all" on res_state for all
  to authenticated
  using (is_admin())
  with check (is_admin());

-- ── Resident read path ─────────────────────────────────────────────────────────────────────────
-- SECURITY DEFINER so it can read res_state despite the admin-only policy above — bypassing RLS
-- is exactly what's needed here, same reasoning as is_admin() itself (CLAUDE.md: "is_admin()
-- SECURITY DEFINER helper exists because an inline profiles subquery ... recurses"). The function
-- body is the ONLY place that bypass applies; it returns a narrow, hand-picked jsonb projection —
-- never the row itself — so there is no way to widen this into a general res_state read.
--
-- `set search_path = ''` (stricter than is_admin()'s `public, pg_temp`) means every reference
-- below must be schema-qualified, including auth.uid() — deliberately the most locked-down
-- search_path available to a SECURITY DEFINER function, since this one (unlike is_admin()) returns
-- actual department data, not just a boolean.
create or replace function public.resident_block_lookup()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  doc jsonb;
begin
  -- Same gate as every day_off_requests policy (migrate_block_pending_account_access.sql): an
  -- unapproved signup gets nothing. Unlike res_state's own policies above, this is deliberately
  -- NOT admin-only — residents (role = 'resident') are exactly who this function serves, scoped
  -- down to the few fields below. Admins may also call it (harmless — it's a subset of what they
  -- can already read directly), though the app only ever calls this from the resident-facing
  -- surface (src/residentRequests/blockLookup.js).
  if not exists (
    select 1 from public.profiles
    where id = auth.uid() and role <> 'pending'
  ) then
    raise exception 'not authorized';
  end if;

  select data into doc from public.res_state where id = 'main';
  if doc is null then
    return jsonb_build_object('blocks', '[]'::jsonb, 'ayData', '{}'::jsonb, 'roster', '[]'::jsonb);
  end if;

  return jsonb_build_object(
    -- Mirrors blockLookup.js's old fetchBlocksForLookup combination of res_current_block +
    -- res_blocks_history: id/name/startDate/endDate only — never the per-block `schedule` payload
    -- (every resident's actual shifts), which is the whole point of this function existing.
    'blocks', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', b->>'id',
        'name', coalesce(b->>'name', b->>'startDate'),
        'startDate', b->>'startDate',
        'endDate', b->>'endDate'
      ))
      from jsonb_array_elements(
        coalesce(doc->'res_blocks_history', '[]'::jsonb)
        || case
             when doc->'res_current_block' is not null and doc->'res_current_block' <> 'null'::jsonb
             then jsonb_build_array(doc->'res_current_block')
             else '[]'::jsonb
           end
      ) as b
      where b->>'startDate' is not null and b->>'endDate' is not null
    ), '[]'::jsonb),
    -- Per-AY config (holidays/JC/12h-window settings) — no resident names or shifts live here,
    -- returned whole, same as the old res_ay_data read.
    'ayData', coalesce(doc->'res_ay_data', '{}'::jsonb),
    -- Roster narrowed to exactly what ResidentPicker renders: id + display name, nothing else
    -- (PGY level, eligibility, buy-downs, etc. never leave the server).
    'roster', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r->>'id', 'firstName', r->>'firstName', 'lastName', r->>'lastName'
      ))
      from jsonb_array_elements(coalesce(doc->'res_em_roster', '[]'::jsonb)) as r
    ), '[]'::jsonb)
  );
end;
$$;

revoke execute on function public.resident_block_lookup() from public, anon;
grant execute on function public.resident_block_lookup() to authenticated;

commit;
