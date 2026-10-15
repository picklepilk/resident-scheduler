-- Supabase security advisor finding (this project's res_state history feature only — do NOT touch
-- any em_*/emb_*/sloe_* function, another app shares this Supabase project with those prefixes):
-- public.res_state_archive_history() and public.res_state_set_audit_fields() (both defined in
-- migrate_res_state_history.sql) are PostgreSQL functions, which grant EXECUTE to the PUBLIC
-- pseudo-role by default on creation. Because both are also exposed under the public schema,
-- PostgREST advertises them at /rest/v1/rpc/res_state_archive_history and
-- /rest/v1/rpc/res_state_set_audit_fields, callable by anon and authenticated alike — even though
-- neither does anything useful invoked that way (res_state_archive_history archives `old`, which
-- is null outside a trigger context; res_state_set_audit_fields just returns the row it's handed,
-- also null outside a trigger context). Not currently a data-write hole — calling them directly
-- can't forge an archived row or bypass res_state's own RLS/trigger-driven versioning — but it is
-- unnecessary attack surface the advisor correctly flags, and the fix is free: trigger functions
-- don't need EXECUTE for the trigger itself to fire. Postgres invokes a trigger function via the
-- table owner's trigger-execution path, not through a role's EXECUTE privilege — revoking EXECUTE
-- here only closes the direct-RPC-call door, and does not stop res_state's BEFORE/AFTER triggers
-- from running on every insert/update, which is confirmed by this file's own verification query
-- and by supabase/tests/res_state_history.sql (run after this migration — any of its PASS lines
-- that depend on the triggers having fired is itself proof the revoke didn't disable them).
--
-- Idempotent (`revoke` is a no-op if the privilege is already gone); safe to run on a DB that's
-- already past migrate_res_state_history.sql. No deploy-order constraint with that file or with
-- migrate_res_state_admin_only.sql — this only removes a default grant nothing in the client ever
-- relied on.
--
-- Folded into migrate_res_state_history.sql itself too (this statement, verbatim) so a FRESH
-- install never has the gap in the first place — this file exists for a DB that already ran that
-- migration before this fix shipped.

begin;

revoke execute on function public.res_state_archive_history()   from public, anon, authenticated;
revoke execute on function public.res_state_set_audit_fields()  from public, anon, authenticated;

commit;

-- ── Verification (run by hand, read the output) ─────────────────────────────────────────────────
-- Expect every row to show false/false. `has_function_privilege` checks the EXECUTE grant alone —
-- it does not and cannot affect whether Postgres still invokes the function as a trigger, which is
-- a separate, ungated mechanism (see this file's header comment and the res_state_history.sql test
-- script, which continues to exercise both triggers after this migration runs).
select
  'anon'          as role_name, has_function_privilege('anon',          'public.res_state_archive_history()',  'EXECUTE') as can_call_archive_history,
                                 has_function_privilege('anon',          'public.res_state_set_audit_fields()', 'EXECUTE') as can_call_set_audit_fields
union all
select
  'authenticated' as role_name, has_function_privilege('authenticated', 'public.res_state_archive_history()',  'EXECUTE'),
                                 has_function_privilege('authenticated', 'public.res_state_set_audit_fields()', 'EXECUTE');
