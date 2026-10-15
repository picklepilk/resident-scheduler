-- Manual verification script for migrate_res_state_history.sql — NOT run automatically by
-- anything (no test runner wires this up; CODE ONLY per this task's constraints). Run it BY HAND
-- in the Supabase SQL editor, AFTER migrate_res_state_history.sql, against a project you can
-- afford to test against. Same pattern as supabase/tests/res_state_rls.sql: everything happens
-- inside one transaction rolled back at the very end, and each role/scenario block runs inside its
-- own SAVEPOINT so an expected error in one block can't abort the ones after it.
--
-- Every check prints a PASS/FAIL line via RAISE NOTICE — read those, not the (mostly empty/void)
-- query output, in the SQL editor's "Messages" panel.
--
-- Expected results:
--   insert (admin1)                    — version=0, updated_by=admin1, updated_at≈now.
--   update (admin2)                    — version=1, updated_by=admin2; history gets ONE row:
--                                         (version=0, saved_by=admin1, data=the pre-update data).
--   stale-version update (admin1)      — 0 rows affected (optimistic-concurrency conflict).
--   correct-version update (admin2)    — succeeds; history gets a SECOND row (version=1,
--                                         saved_by=admin2).
--   retention                          — after 205 more successful updates, history for this
--                                         row_id is capped at exactly 200 rows, newest kept.
--   upsert shape (on conflict do update) — sbSeedState's merge-duplicates predecessor and
--                                         sbSaveStateExplicit's fallback path: version still
--                                         increments, OLD still gets archived, same as a plain UPDATE.
--   seed shape (on conflict do nothing)  — sbSeedState itself: creates a fresh row normally;
--                                         against an EXISTING row it's a true no-op (0 rows
--                                         affected, no version bump, no history row) — never an
--                                         upsert in disguise.
--   RLS on res_state_history           — anon: permission denied. resident: 0 rows (not an
--                                         error). admin: sees every row for this row_id. No role
--                                         (including admin) can INSERT into it directly.

begin;

-- ── Fixtures ───────────────────────────────────────────────────────────────────────────────────
do $$
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
  values
    ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rsh-test-admin1@example.test',   'x', now(), now(), now()),
    ('00000000-0000-0000-0000-000000000102', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rsh-test-admin2@example.test',   'x', now(), now(), now()),
    ('00000000-0000-0000-0000-000000000103', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rsh-test-resident@example.test', 'x', now(), now(), now());
exception when unique_violation then
  raise notice 'Fixture auth.users rows already exist — re-run against a clean DB or adjust the ids below.';
end $$;

insert into public.profiles (id, email, role)
values
  ('00000000-0000-0000-0000-000000000101', 'rsh-test-admin1@example.test',   'admin'),
  ('00000000-0000-0000-0000-000000000102', 'rsh-test-admin2@example.test',   'admin'),
  ('00000000-0000-0000-0000-000000000103', 'rsh-test-resident@example.test', 'resident')
on conflict (id) do update set role = excluded.role;

-- Clean slate for the throwaway row_id this script uses, in case a previous aborted run left one.
delete from public.res_state_history where row_id = 'histtest';
delete from public.res_state where id = 'histtest';

-- ── Setup: admin1 creates the row (through RLS, like a real PostgREST POST upsert would) ───────
savepoint sp_setup;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000101","email":"rsh-test-admin1@example.test","role":"authenticated"}';

insert into public.res_state (id, data) values ('histtest', jsonb_build_object('n', 1));

do $$
declare v_version bigint; v_updated_by uuid;
begin
  select version, updated_by into v_version, v_updated_by from public.res_state where id = 'histtest';
  if v_version = 0 and v_updated_by = '00000000-0000-0000-0000-000000000101' then
    raise notice 'insert (admin1) / audit fields: PASS (version=0, updated_by=admin1)';
  else
    raise notice 'insert (admin1) / audit fields: FAIL (version=%, updated_by=%)', v_version, v_updated_by;
  end if;
end $$;

-- A client-supplied version/updated_by is ignored, not honored — confirms "never client-supplied"
-- even for a row that already exists via a second insert attempt is irrelevant here; the real
-- proof is the UPDATE case right below, where a client could try to send its own version in the
-- body. Simulate that: an UPDATE whose SET list includes a bogus version/updated_by must still end
-- up with the server-computed ones, not the client's.
update public.res_state set data = jsonb_build_object('n', 2), version = 999, updated_by = '00000000-0000-0000-0000-000000000103'
where id = 'histtest';

do $$
declare v_version bigint; v_updated_by uuid;
begin
  select version, updated_by into v_version, v_updated_by from public.res_state where id = 'histtest';
  if v_version = 1 and v_updated_by = '00000000-0000-0000-0000-000000000101' then
    raise notice 'update (admin1, spoofed version/updated_by in payload) / audit fields: PASS (version forced to 1, updated_by forced to the actual caller, admin1 — client values ignored)';
  else
    raise notice 'update (admin1, spoofed version/updated_by in payload) / audit fields: FAIL (version=%, updated_by=%, expected version=1 updated_by=admin1)', v_version, v_updated_by;
  end if;
end $$;

do $$
declare cnt int; v_version bigint; v_saved_by uuid; v_data jsonb;
begin
  select count(*) into cnt from public.res_state_history where row_id = 'histtest';
  select version, saved_by, data into v_version, v_saved_by, v_data
    from public.res_state_history where row_id = 'histtest' order by id desc limit 1;
  if cnt = 1 and v_version = 0 and v_saved_by = '00000000-0000-0000-0000-000000000101' and v_data = jsonb_build_object('n', 1) then
    raise notice 'history after first update: PASS (1 row archived — version=0, saved_by=admin1 (who wrote it), data={"n":1})';
  else
    raise notice 'history after first update: FAIL (cnt=%, version=%, saved_by=%, data=%)', cnt, v_version, v_saved_by, v_data;
  end if;
end $$;

-- ── Optimistic concurrency: a stale `?version=eq.N` filter matches 0 rows ───────────────────────
-- Simulates the client's real conflict check: PATCH .../res_state?id=eq.histtest&version=eq.0 —
-- the actual current version is now 1, so this WHERE clause must match nothing.
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000102","email":"rsh-test-admin2@example.test","role":"authenticated"}';
do $$
declare affected int;
begin
  update public.res_state set data = jsonb_build_object('n', 'conflict') where id = 'histtest' and version = 0;
  get diagnostics affected = row_count;
  if affected = 0 then
    raise notice 'conflict / stale-version update (admin2, version=0 when actual is 1): PASS (0 rows updated)';
  else
    raise notice 'conflict / stale-version update (admin2, version=0 when actual is 1): FAIL (expected 0 rows updated, got %)', affected;
  end if;
end $$;

do $$
declare v_version bigint; cnt int;
begin
  select version into v_version from public.res_state where id = 'histtest';
  select count(*) into cnt from public.res_state_history where row_id = 'histtest';
  if v_version = 1 and cnt = 1 then
    raise notice 'conflict / no side effects: PASS (version still 1, history still 1 row — the failed conflict update changed nothing)';
  else
    raise notice 'conflict / no side effects: FAIL (version=%, history count=%, expected 1 and 1)', v_version, cnt;
  end if;
end $$;

-- Correct version (1) succeeds, producing a second history row attributed to admin1 (who wrote
-- the version=1 row this update is now overwriting).
update public.res_state set data = jsonb_build_object('n', 3) where id = 'histtest' and version = 1;

do $$
declare v_version bigint; cnt int; v2_saved_by uuid; v2_version bigint;
begin
  select version into v_version from public.res_state where id = 'histtest';
  select count(*) into cnt from public.res_state_history where row_id = 'histtest';
  select saved_by, version into v2_saved_by, v2_version from public.res_state_history where row_id = 'histtest' order by id desc limit 1;
  if v_version = 2 and cnt = 2 and v2_saved_by = '00000000-0000-0000-0000-000000000101' and v2_version = 1 then
    raise notice 'correct-version update (admin2): PASS (version=2, history now 2 rows, newest archived entry is version=1/saved_by=admin1)';
  else
    raise notice 'correct-version update (admin2): FAIL (version=%, history count=%, last saved_by=%, last version=%)', v_version, cnt, v2_saved_by, v2_version;
  end if;
end $$;

-- ── Retention: 205 more successful updates must cap history at 200 rows for this row_id ─────────
do $$
declare i int; v_version bigint;
begin
  select version into v_version from public.res_state where id = 'histtest';
  for i in 1..205 loop
    update public.res_state set data = jsonb_build_object('n', i + 3) where id = 'histtest' and version = v_version;
    v_version := v_version + 1;
  end loop;
end $$;

do $$
declare cnt int;
begin
  select count(*) into cnt from public.res_state_history where row_id = 'histtest';
  if cnt = 200 then
    raise notice 'retention: PASS (history capped at 200 rows for row_id=histtest)';
  else
    raise notice 'retention: FAIL (expected exactly 200, got %)', cnt;
  end if;
end $$;

-- ── RLS on res_state_history ─────────────────────────────────────────────────────────────────────
do $$
declare cnt int;
begin
  select count(*) into cnt from public.res_state_history where row_id = 'histtest';
  if cnt = 200 then
    raise notice 'admin / res_state_history select: PASS (sees all 200 rows)';
  else
    raise notice 'admin / res_state_history select: FAIL (expected 200, got %)', cnt;
  end if;
end $$;

do $$
begin
  insert into public.res_state_history (row_id, data, version) values ('histtest', '{}'::jsonb, 0);
  raise notice 'admin / direct res_state_history insert: FAIL (expected permission denied, the insert succeeded)';
exception when insufficient_privilege then
  raise notice 'admin / direct res_state_history insert: PASS (permission denied — only the SECURITY DEFINER trigger writes, as designed)';
end $$;

-- ── PostgREST upsert shape (Prefer: resolution=merge-duplicates) ────────────────────────────────
-- `INSERT ... ON CONFLICT (id) DO UPDATE` is literally what `resolution=merge-duplicates` compiles
-- to (sbSeedState's predecessor, and sbSaveStateExplicit's eventual fallback when its own seed
-- attempt finds the row already there) — confirm the ON CONFLICT path runs through the exact same
-- triggers as a plain UPDATE statement: version still increments, OLD still gets archived. Still
-- under admin2's role/claims from the stale-version check above — same caller writes both rows, so
-- the archived OLD row's saved_by is admin2 (who wrote it), not admin1.
delete from public.res_state_history where row_id = 'histtest_upsert';
delete from public.res_state where id = 'histtest_upsert';

insert into public.res_state (id, data) values ('histtest_upsert', jsonb_build_object('n', 1));
insert into public.res_state (id, data) values ('histtest_upsert', jsonb_build_object('n', 2))
  on conflict (id) do update set data = excluded.data;

do $$
declare v_version bigint; cnt int; v_saved_by uuid;
begin
  select version into v_version from public.res_state where id = 'histtest_upsert';
  select count(*) into cnt from public.res_state_history where row_id = 'histtest_upsert';
  select saved_by into v_saved_by from public.res_state_history where row_id = 'histtest_upsert' order by id desc limit 1;
  if v_version = 1 and cnt = 1 and v_saved_by = '00000000-0000-0000-0000-000000000102' then
    raise notice 'upsert shape (on conflict do update) / version+history: PASS (version=1, 1 history row archived, saved_by=admin2 — who wrote the overwritten v0)';
  else
    raise notice 'upsert shape (on conflict do update) / version+history: FAIL (version=%, history count=%, saved_by=%)', v_version, cnt, v_saved_by;
  end if;
end $$;

-- ── PostgREST seed shape (Prefer: resolution=ignore-duplicates) ──────────────────────────────────
-- sbSeedState's actual shape: `INSERT ... ON CONFLICT (id) DO NOTHING`. Confirms (a) it creates a
-- fresh row normally when none exists, and (b) against an EXISTING row it is a true no-op — 0 rows
-- affected, no version bump, no new history row, original data untouched — which is exactly what
-- makes it safe for sbSaveStateExplicit to fall back to a versioned PATCH afterward instead of two
-- admins' concurrent seeds silently colliding (one clobbering the other, as merge-duplicates would).
delete from public.res_state_history where row_id = 'histtest_seed';
delete from public.res_state where id = 'histtest_seed';

insert into public.res_state (id, data) values ('histtest_seed', jsonb_build_object('n', 1))
  on conflict (id) do nothing;

do $$
declare v_version bigint;
begin
  select version into v_version from public.res_state where id = 'histtest_seed';
  if v_version = 0 then
    raise notice 'seed shape (on conflict do nothing) / fresh row: PASS (created, version=0)';
  else
    raise notice 'seed shape (on conflict do nothing) / fresh row: FAIL (version=%, expected 0)', v_version;
  end if;
end $$;

do $$
declare affected int; v_data jsonb; v_version bigint; cnt int;
begin
  insert into public.res_state (id, data) values ('histtest_seed', jsonb_build_object('n', 'should not land'))
    on conflict (id) do nothing;
  get diagnostics affected = row_count;
  select data, version into v_data, v_version from public.res_state where id = 'histtest_seed';
  select count(*) into cnt from public.res_state_history where row_id = 'histtest_seed';
  if affected = 0 and v_data = jsonb_build_object('n', 1) and v_version = 0 and cnt = 0 then
    raise notice 'seed shape (on conflict do nothing) / already exists: PASS (0 rows affected, original data/version untouched, no history row created)';
  else
    raise notice 'seed shape (on conflict do nothing) / already exists: FAIL (affected=%, data=%, version=%, history count=%)', affected, v_data, v_version, cnt;
  end if;
end $$;

-- Deliberately NOT rolling back to sp_setup here — the 'histtest' row and its 200 archived
-- history rows need to still exist for the RLS checks below (resident must see 0 despite rows
-- existing; anon must be denied outright). The final `rollback;` at the end of the script is what
-- actually undoes all of this — nothing from this script is left behind either way.

-- ── resident ───────────────────────────────────────────────────────────────────────────────────
savepoint sp_resident;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000103","email":"rsh-test-resident@example.test","role":"authenticated"}';

do $$
declare cnt int;
begin
  select count(*) into cnt from public.res_state_history where row_id = 'histtest';
  if cnt = 0 then
    raise notice 'resident / res_state_history select: PASS (0 rows, RLS denied as expected — no error)';
  else
    raise notice 'resident / res_state_history select: FAIL (expected 0 rows, got %)', cnt;
  end if;
exception when insufficient_privilege then
  raise notice 'resident / res_state_history select: FAIL (got permission denied — expected a silent 0-row result)';
end $$;

rollback to savepoint sp_resident;

-- ── anon ───────────────────────────────────────────────────────────────────────────────────────
savepoint sp_anon;
set local role anon;

do $$
begin
  perform 1 from public.res_state_history where row_id = 'histtest';
  raise notice 'anon / res_state_history select: FAIL (expected permission denied, the query succeeded)';
exception when insufficient_privilege then
  raise notice 'anon / res_state_history select: PASS (permission denied, as expected — %)', sqlerrm;
end $$;

rollback to savepoint sp_anon;

-- ── Trigger function EXECUTE revoke (migrate_revoke_trigger_fn_execute.sql) ─────────────────────
-- Confirms the security-advisor fix: anon/authenticated can no longer call either trigger function
-- directly via /rest/v1/rpc/<fn_name>. This does NOT re-check that the triggers still fire — every
-- PASS above this point (audit fields set, history rows archived, retention capped at 200) already
-- happened AFTER migrate_revoke_trigger_fn_execute.sql's revoke if it's been applied, so those are
-- the real proof the revoke doesn't disable the triggers themselves (see that file's header for
-- why: trigger invocation bypasses EXECUTE privilege checks entirely).
do $$
declare anon_archive boolean; anon_audit boolean; authed_archive boolean; authed_audit boolean;
begin
  anon_archive   := has_function_privilege('anon',          'public.res_state_archive_history()',  'EXECUTE');
  anon_audit     := has_function_privilege('anon',          'public.res_state_set_audit_fields()', 'EXECUTE');
  authed_archive := has_function_privilege('authenticated',  'public.res_state_archive_history()',  'EXECUTE');
  authed_audit   := has_function_privilege('authenticated',  'public.res_state_set_audit_fields()', 'EXECUTE');
  if not anon_archive and not anon_audit and not authed_archive and not authed_audit then
    raise notice 'trigger fn EXECUTE revoke: PASS (anon and authenticated can call neither res_state_archive_history() nor res_state_set_audit_fields() directly)';
  else
    raise notice 'trigger fn EXECUTE revoke: FAIL (anon_archive=%, anon_audit=%, authenticated_archive=%, authenticated_audit=%) — run migrate_revoke_trigger_fn_execute.sql (or the fold-in in migrate_res_state_history.sql)', anon_archive, anon_audit, authed_archive, authed_audit;
  end if;
end $$;

-- Nothing persists.
rollback;
