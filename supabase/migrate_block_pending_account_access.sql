-- Run this ONCE in the Supabase project's SQL editor against production, after
-- migrate_admin_email_allowlist.sql.
--
-- Closes a confirmed approval bypass. role='pending' was enforced ONLY by AppGate.jsx's client
-- branch, and only on the `/` route. The standalone `/requests` route (ResidentRequestsApp) never
-- read `role` at all, and neither did any RLS policy: profiles_update_own let a pending row set
-- its own resident_id, and every day_off_requests policy authorized purely on resident_id.
--
-- Verified before this fix: a brand-new pending account could link itself to an unclaimed roster
-- resident and submit day-off requests under that identity, with no admin approval anywhere in
-- the chain. Because it could claim any resident who had not yet signed up, that is impersonation
-- of a colleague, not just self-service. The email-domain auth hook capped the blast radius at
-- in-domain addresses; it did not prevent this.
--
-- Fix is DB-side on purpose: the client gate is convenience, RLS is the boundary (see CLAUDE.md,
-- "RLS is the actual security boundary; the UI gates are convenience").

begin;

-- A pending account may not modify its own row at all — in particular it may not claim a
-- resident_id via ResidentPicker before an admin has approved it. Approved accounts are
-- unaffected. Role changes remain blocked for everyone by enforce_profile_role_change_rules.
drop policy if exists "profiles_update_own" on profiles;
create policy "profiles_update_own" on profiles for update
  using (auth.uid() = id and role <> 'pending')
  with check (auth.uid() = id);

-- Every resident-facing request policy now requires the caller's profile to be APPROVED, not just
-- to carry a matching resident_id. Expressed by folding `role <> 'pending'` into the existing
-- subquery: for a pending caller it yields no row, so `resident_id = NULL` evaluates to NULL —
-- neither true nor false — and the policy denies. Same NULL-comparison reasoning as the
-- enforce_cancel_only_status trigger's use of IS DISTINCT FROM.
--
-- NOTE: `status = 'pending'` below is day_off_requests.status (a request awaiting a decision) and
-- is unrelated to profiles.role = 'pending' (an account awaiting approval). Same word, different
-- state machines.
drop policy if exists "requests_select_own" on day_off_requests;
create policy "requests_select_own" on day_off_requests for select
  using (
    resident_id = (select resident_id from profiles where id = auth.uid() and role <> 'pending')
  );

drop policy if exists "requests_insert_own" on day_off_requests;
create policy "requests_insert_own" on day_off_requests for insert
  with check (
    resident_id = (select resident_id from profiles where id = auth.uid() and role <> 'pending')
    and status = 'pending'
    and decision_note is null
    and decided_at is null
    and decided_by is null
  );

drop policy if exists "requests_cancel_own" on day_off_requests;
create policy "requests_cancel_own" on day_off_requests for update
  using (
    resident_id = (select resident_id from profiles where id = auth.uid() and role <> 'pending')
    and status = 'pending'
  )
  with check (status = 'cancelled');

commit;
