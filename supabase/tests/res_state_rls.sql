-- Manual verification script for migrate_res_state_admin_only.sql — NOT run automatically by
-- anything (no test runner wires this up; CODE ONLY per this task's constraints). Run it BY HAND
-- in the Supabase SQL editor, AFTER migrate_res_state_admin_only.sql, against a project you can
-- afford to test against (it inserts throwaway auth.users/profiles/res_state rows, but everything
-- is inside one transaction rolled back at the end — nothing here is left behind either way).
--
-- Every check prints a PASS/FAIL line via RAISE NOTICE (visible in the SQL editor's "Results" /
-- "Messages" output) — read those lines for the verdict, not the (mostly empty/void) query output.
--
-- Each of the four role blocks (anon, pending, resident, admin) runs inside its own SAVEPOINT,
-- released with ROLLBACK TO SAVEPOINT immediately after — this is what makes the later blocks run
-- at all: anon's checks are EXPECTED to raise a real Postgres error (`permission denied`, since
-- migrate_res_state_admin_only.sql revokes table/function grants from anon outright, not just row
-- visibility), and an uncaught error anywhere in a transaction aborts the WHOLE transaction, not
-- just the statement that raised it — every statement after it, pending/resident/admin included,
-- would otherwise silently no-op until the next ROLLBACK. Each check is ALSO wrapped in its own DO
-- block with an EXCEPTION handler, so the expected-vs-actual comparison happens and prints
-- PASS/FAIL even for the anon case where the bare SQL underneath it would itself abort.
--
-- Expected results:
--   anon      — res_state select: permission denied.      RPC: permission denied.
--   pending   — res_state select: 0 rows (RLS, no error).  RPC: denied ("not authorized" exception).
--   resident  — res_state select: 0 rows (RLS, no error).  RPC: succeeds, narrowed shape.
--   admin     — res_state select: 1 row.                  RPC: succeeds, narrowed shape.

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
savepoint sp_anon;
set local role anon;

do $$
begin
  perform 1 from public.res_state where id = 'main';
  raise notice 'anon / res_state select: FAIL (expected permission denied, the query succeeded)';
exception when insufficient_privilege then
  raise notice 'anon / res_state select: PASS (permission denied, as expected — %)', sqlerrm;
end $$;

do $$
begin
  perform public.resident_block_lookup();
  raise notice 'anon / resident_block_lookup(): FAIL (expected permission denied, the call succeeded)';
exception when insufficient_privilege then
  raise notice 'anon / resident_block_lookup(): PASS (permission denied, as expected — %)', sqlerrm;
end $$;

rollback to savepoint sp_anon;

-- ── pending ────────────────────────────────────────────────────────────────────────────────────
savepoint sp_pending;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000001","email":"rls-test-pending@example.test","role":"authenticated"}';

do $$
declare cnt int;
begin
  select count(*) into cnt from public.res_state where id = 'main';
  if cnt = 0 then
    raise notice 'pending / res_state select: PASS (0 rows, RLS denied as expected)';
  else
    raise notice 'pending / res_state select: FAIL (expected 0 rows, got %)', cnt;
  end if;
exception when insufficient_privilege then
  raise notice 'pending / res_state select: FAIL (got permission denied — expected a silent 0-row result, not an error)';
end $$;

do $$
begin
  perform public.resident_block_lookup();
  raise notice 'pending / resident_block_lookup(): FAIL (expected "not authorized" denial, the call succeeded)';
exception when others then
  if sqlerrm = 'not authorized' then
    raise notice 'pending / resident_block_lookup(): PASS (denied as expected — %)', sqlerrm;
  else
    raise notice 'pending / resident_block_lookup(): FAIL (unexpected error: %)', sqlerrm;
  end if;
end $$;

rollback to savepoint sp_pending;

-- ── resident ───────────────────────────────────────────────────────────────────────────────────
savepoint sp_resident;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000002","email":"rls-test-resident@example.test","role":"authenticated"}';

do $$
declare cnt int;
begin
  select count(*) into cnt from public.res_state where id = 'main';
  if cnt = 0 then
    raise notice 'resident / res_state select: PASS (0 rows, RLS denied as expected — residents never see res_state directly)';
  else
    raise notice 'resident / res_state select: FAIL (expected 0 rows, got %)', cnt;
  end if;
exception when insufficient_privilege then
  raise notice 'resident / res_state select: FAIL (got permission denied — expected a silent 0-row result, not an error)';
end $$;

do $$
declare result jsonb;
begin
  select public.resident_block_lookup() into result;
  if (result ? 'blocks') and (result ? 'ayData') and (result ? 'roster') then
    raise notice 'resident / resident_block_lookup(): PASS (got the narrowed {blocks, ayData, roster} shape: %)', result;
  else
    raise notice 'resident / resident_block_lookup(): FAIL (missing an expected key: %)', result;
  end if;
exception when others then
  raise notice 'resident / resident_block_lookup(): FAIL (expected success, got error: %)', sqlerrm;
end $$;

rollback to savepoint sp_resident;

-- ── admin ──────────────────────────────────────────────────────────────────────────────────────
savepoint sp_admin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000003","email":"rls-test-admin@example.test","role":"authenticated"}';

do $$
declare cnt int;
begin
  select count(*) into cnt from public.res_state where id = 'main';
  if cnt = 1 then
    raise notice 'admin / res_state select: PASS (1 row visible)';
  else
    raise notice 'admin / res_state select: FAIL (expected 1 row, got %)', cnt;
  end if;
exception when others then
  raise notice 'admin / res_state select: FAIL (expected success, got error: %)', sqlerrm;
end $$;

do $$
declare result jsonb;
begin
  select public.resident_block_lookup() into result;
  if (result ? 'blocks') and (result ? 'ayData') and (result ? 'roster') then
    raise notice 'admin / resident_block_lookup(): PASS (got the narrowed {blocks, ayData, roster} shape: %)', result;
  else
    raise notice 'admin / resident_block_lookup(): FAIL (missing an expected key: %)', result;
  end if;
exception when others then
  raise notice 'admin / resident_block_lookup(): FAIL (expected success, got error: %)', sqlerrm;
end $$;

rollback to savepoint sp_admin;

-- Nothing persists — fixtures AND any writes the checks above happened to make (none expected;
-- every statement here is a SELECT/RPC call) are all undone.
rollback;
