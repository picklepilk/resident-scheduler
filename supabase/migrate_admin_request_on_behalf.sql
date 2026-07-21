-- Run this ONCE in the Supabase project's SQL editor against production, after
-- migrate_block_pending_account_access.sql.
--
-- Lets an admin file a day-off request ON BEHALF OF a resident from the admin UI (e.g. a resident
-- phones in a request, or hands over a paper form). Before this, requests_insert_own was the only
-- INSERT policy and it requires the new row's resident_id to equal the CALLER's own
-- profiles.resident_id — an admin's is normally NULL, so the comparison yielded NULL and every
-- such insert was denied.
--
-- Deliberately NOT impersonation: the admin stays signed in as themselves and the action happens
-- in their own UI. The row is indistinguishable from a self-filed one, which is the accepted
-- tradeoff — day_off_requests has no "created_by" column, and adding one would touch the resident
-- read path, the approval queue, and the notify-request webhook payload for marginal benefit at
-- this scale (one coordinator, a few admins).

begin;

-- Same un-decided-row guards as requests_insert_own (a brand-new request can never arrive
-- pre-approved with a fabricated decided_by), but authorized on is_admin() rather than on the
-- caller's own resident identity. Note there is no constraint that resident_id corresponds to a
-- real roster entry — the roster lives in the wide-open res_state JSON blob, not a table this
-- schema can reference, so that validation stays in the UI's picker.
create policy "requests_admin_insert_all" on day_off_requests for insert
  with check (
    is_admin()
    and status = 'pending'
    and decision_note is null
    and decided_at is null
    and decided_by is null
  );

commit;

-- Sanity check (read-only):
--   select policyname, cmd from pg_policies
--   where tablename = 'day_off_requests' order by policyname;
--   -- expect 6 policies now, including requests_admin_insert_all (INSERT).
