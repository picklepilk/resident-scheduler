-- Manual verification script for migrate_res_state_admin_only.sql — NOT run automatically by
-- anything (no test runner wires this up; CODE ONLY per this task's constraints). Run it BY HAND
-- in the Supabase SQL editor, AFTER migrate_res_state_admin_only.sql, against a project you can
-- afford to test against (it inserts throwaway auth.users/profiles/res_state rows, but everything
-- is inside one transaction rolled back at the end — nothing here is left behind either way).
--
-- What it checks, one role at a time (anon, pending, resident, admin):
--   1. Can that role SELECT the res_state 'main' row directly?
--   2. Can that role call public.resident_block_lookup()?
-- Expected results:
--   anon      — res_state: no.  RPC: no (not authenticated at all, not even a pending profile).
--   pending   — res_state: no.  RPC: no (role = 'pending' — same gate day_off_requests uses).
--   resident  — res_state: no.  RPC: yes, narrowed shape (blocks/ayData/roster only).
--   admin     — res_state: yes. RPC: yes.
--
-- Each `\echo` is just a marker in the SQL editor's output so you can see which block a result
-- belongs to — delete the `\echo` lines if running somewhere that doesn't support psql
-- backslash-commands (the Supabase SQL editor does; a plain psql session does too).

begin;

-- ── Fixtures ───────────────────────────────────────────────────────────────────────────────────
-- Four throwaway identities, one per role under test. Inserted directly as postgres (the SQL
-- editor's role, which bypasses RLS) — auth.users first (profiles.id references it), then
-- profiles. All in-transaction; the final ROLLBACK removes every trace.
do $$
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
  values
    ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rls-test-pending@example.test',  'x', now(), now(), now()),
    ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rls-test-resident@example.test', 'x', now(), now(), now()),
    ('00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rls-test-admin@example.test',    'x', now(), now(), now());
exception when unique_violation then
  raise notice 'Fixture auth.users rows already exist — re-run against a clean DB or adjust the ids below.';
end $$;

insert into public.profiles (id, email, role)
values
  ('00000000-0000-0000-0000-000000000001', 'rls-test-pending@example.test',  'pending'),
  ('00000000-0000-0000-0000-000000000002', 'rls-test-resident@example.test', 'resident'),
  ('00000000-0000-0000-0000-000000000003', 'rls-test-admin@example.test',    'admin')
on conflict (id) do update set role = excluded.role;

-- A minimal res_state row so SELECT/RPC have something to (not) see.
insert into public.res_state (id, data)
values ('main', jsonb_build_object(
  'res_em_roster', jsonb_build_array(jsonb_build_object('id','r1','firstName','Test','lastName','Resident')),
  'res_current_block', jsonb_build_object('id','b1','name','Block 1','startDate','2026-01-01','endDate','2026-01-28'),
  'res_blocks_history', '[]'::jsonb,
  'res_ay_data', jsonb_build_object('2026', jsonb_build_object('holidays', '[]'::jsonb))
))
on conflict (id) do update set data = excluded.data;

-- ── anon ───────────────────────────────────────────────────────────────────────────────────────
\echo '--- anon: res_state select (expect 0 rows) ---'
set local role anon;
select * from public.res_state where id = 'main';
reset role;

\echo '--- anon: resident_block_lookup() (expect error: not authorized, or permission denied) ---'
set local role anon;
select public.resident_block_lookup();
reset role;

-- ── pending ────────────────────────────────────────────────────────────────────────────────────
\echo '--- pending: res_state select (expect 0 rows) ---'
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000001","email":"rls-test-pending@example.test","role":"authenticated"}';
select * from public.res_state where id = 'main';
reset role;

\echo '--- pending: resident_block_lookup() (expect error: not authorized) ---'
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000001","email":"rls-test-pending@example.test","role":"authenticated"}';
select public.resident_block_lookup();
reset role;

-- ── resident ───────────────────────────────────────────────────────────────────────────────────
\echo '--- resident: res_state select (expect 0 rows) ---'
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000002","email":"rls-test-resident@example.test","role":"authenticated"}';
select * from public.res_state where id = 'main';
reset role;

\echo '--- resident: resident_block_lookup() (expect blocks/ayData/roster jsonb, NOT the full res_state row) ---'
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000002","email":"rls-test-resident@example.test","role":"authenticated"}';
select public.resident_block_lookup();
reset role;

-- ── admin ──────────────────────────────────────────────────────────────────────────────────────
\echo '--- admin: res_state select (expect 1 row) ---'
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000003","email":"rls-test-admin@example.test","role":"authenticated"}';
select * from public.res_state where id = 'main';
reset role;

\echo '--- admin: resident_block_lookup() (expect the same narrowed jsonb as resident) ---'
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000003","email":"rls-test-admin@example.test","role":"authenticated"}';
select public.resident_block_lookup();
reset role;

-- Nothing persists — fixtures AND any writes the checks above happened to make (none expected;
-- every statement here is a SELECT) are all undone.
rollback;
