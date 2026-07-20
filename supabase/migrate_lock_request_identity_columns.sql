-- Run this ONCE in the Supabase project's SQL editor against production. Closes a code-review
-- gap: requests_admin_update_all (day_off_requests.sql) authorizes an admin to UPDATE any row,
-- but RLS's USING/WITH CHECK can only verify the CALLER is an admin — it can't express "only
-- these columns changed." Without this trigger, an admin update could rewrite resident_id
-- (impersonation), dates, reason, or submitted_at in the same call that approves/denies a
-- request. Companion to day_off_requests.sql, which now includes this trigger for fresh
-- installs — running that file again does NOT re-apply this to an already-provisioned project.
--
-- Safe to run: adds one trigger, does not touch existing rows or other policies.

create or replace function public.enforce_request_identity_immutable()
returns trigger
language plpgsql
as $$
begin
  if new.resident_id is distinct from old.resident_id
     or new.dates is distinct from old.dates
     or new.reason is distinct from old.reason
     or new.submitted_at is distinct from old.submitted_at
  then
    raise exception 'resident_id, dates, reason, and submitted_at cannot be changed after a request is created';
  end if;
  return new;
end;
$$;

create trigger day_off_requests_identity_guard
  before update on day_off_requests
  for each row execute function public.enforce_request_identity_immutable();
