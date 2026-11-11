-- Code-review finding V13: res_state_archive_history fires AFTER UPDATE only, but
-- migrate_res_state_admin_only.sql leaves `authenticated` with DELETE on public.res_state
-- (policy res_state_admin_all; Settings "Clear all" uses DELETE, so the grant must stay). A
-- DELETE therefore dropped the live row with no snapshot in res_state_history.
--
-- Fix: also fire the same archive function AFTER DELETE. The function reads only OLD (never NEW),
-- so it is already valid for DELETE unchanged: it archives the deleted row's last data/version,
-- attributed to OLD.updated_by/OLD.updated_at, then prunes to the newest 200 per row_id.
-- res_state_history has no FK to res_state, so archived rows survive the delete. The history table
-- has no operation column, and none is added: a snapshot of the final version is the recovery data.
--
-- Run AFTER migrate_res_state_history.sql (needs the function and table). Re-run safe. No client
-- deploy-order constraint. EXECUTE on the function stays revoked from public/anon/authenticated
-- (trigger firing does not need it).

begin;

drop trigger if exists res_state_archive_history_delete on public.res_state;
create trigger res_state_archive_history_delete
  after delete on public.res_state
  for each row execute function public.res_state_archive_history();

commit;
