-- Run this ONCE in the Supabase project's SQL editor against an already-provisioned DB (a fresh
-- install gets this shape directly from the baseline comment in src/ResidentScheduler.jsx's
-- SUPABASE SYNC section, updated alongside this file per CLAUDE.md "Schema change = update
-- baseline AND add migrate file").
--
-- *** DEPLOY ORDER (load-bearing) — opposite of migrate_res_state_admin_only.sql ***
--   1. Run THIS migration first.
--   2. THEN ship the client that sends `?version=eq.N` on every save (ResidentScheduler.jsx's
--      SUPABASE SYNC section) and reads the new Version History UI (SettingsTab).
-- Reasoning: this migration is purely ADDITIVE (new columns with defaults, a new table, two new
-- triggers) — it changes nothing an OLD client depends on. An old client's save is still the
-- plain `POST .../res_state?... Prefer: resolution=merge-duplicates` upsert it always was, with no
-- `version` in its body and no `?version=eq.N` filter; the BEFORE trigger below still fires on
-- that statement and still forces `updated_by`/`updated_at`/`version` to sane, server-computed
-- values regardless of what the old client's body omits or sends — the old client just never
-- reads those columns back (its own `select=data,saved_at` doesn't ask for them), so it keeps
-- working exactly as before, including the "last write wins" behavior it always had (an old
-- client is not optimistic-concurrency-aware; it never had that protection and isn't newly broken
-- by this migration either).
-- The reverse order is NOT safe: a NEW client shipped before this migration runs would send
-- `?version=eq.N` against a table that has no `version` column yet — PostgREST returns a hard
-- "column not found" error on every save, with no fallback, until the migration lands. Hence
-- migration-first here (the opposite of migrate_res_state_admin_only.sql, where running the SQL
-- first would have locked every admin out — read that file's own note before assuming "migration
-- first" is always the safe default; it depends on whether the migration only ADDS capability the
-- old client ignores, as here, or NARROWS access the old client depended on, as there).
--
-- WHAT THIS ADDS (see CLAUDE.md Persistence section + ResidentScheduler.jsx's SUPABASE SYNC
-- comment for the client-side half):
--   - res_state.version/updated_by/updated_at: optimistic concurrency + "who wrote this" audit,
--     maintained ENTIRELY server-side by a BEFORE INSERT OR UPDATE trigger — never client-supplied,
--     same principle as updated_by on profiles-adjacent tables elsewhere in this schema.
--   - res_state_history: one row per PAST version of a res_state row, populated by an AFTER
--     UPDATE trigger that archives the OLD row (the version being overwritten, attributed to
--     whoever actually wrote it) before the new one takes its place. Admin-only read, no direct
--     write path for anyone — only the SECURITY DEFINER trigger function populates it.
--
-- Idempotent: every statement below is `if not exists` / `or replace` / drop-then-create.
-- Take a DB backup/snapshot before running, same convention as every other supabase/migrate_*.sql.

begin;

-- ── res_state: audit + optimistic-concurrency columns ───────────────────────────────────────────
alter table public.res_state add column if not exists version    bigint not null default 0;
alter table public.res_state add column if not exists updated_by uuid;
alter table public.res_state add column if not exists updated_at timestamptz not null default now();

-- BEFORE INSERT OR UPDATE: the ONLY place these three columns are ever set. Whatever a client sent
-- for them (an old client sends none; a malicious/buggy client could in principle send anything)
-- is discarded — `new.x := ...` below always wins, same "never client-supplied" posture as
-- `enforce_profile_role_change_rules`/the admin-allowlist trigger elsewhere in this schema.
-- `security invoker` (the default — omitted here, not security definer): this function only ever
-- writes INTO the row already being inserted/updated by the calling statement, so it needs no
-- elevated privilege; it still runs under `set search_path = ''` and schema-qualifies auth.uid()
-- as a matter of consistent hygiene, not because it's load-bearing here the way it is for a
-- SECURITY DEFINER function.
create or replace function public.res_state_set_audit_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_by := auth.uid();
  new.updated_at := now();
  if tg_op = 'UPDATE' then
    -- Ignore whatever version the client sent (PATCH's `?version=eq.N` filter is what enforces
    -- optimistic concurrency — see res_state_history's header below — this increment is
    -- unconditional and server-computed so the stored version always advances by exactly 1 per
    -- successful write, regardless of client arithmetic).
    new.version := old.version + 1;
  else
    new.version := 0;
  end if;
  return new;
end;
$$;

drop trigger if exists res_state_audit_fields on public.res_state;
create trigger res_state_audit_fields
  before insert or update on public.res_state
  for each row execute function public.res_state_set_audit_fields();

-- ── res_state_history: one row per overwritten version ──────────────────────────────────────────
create table if not exists public.res_state_history (
  id        bigserial primary key,
  row_id    text not null,
  data      jsonb not null,
  version   bigint not null,
  saved_by  uuid default auth.uid(),
  saved_at  timestamptz not null default now()
);
-- Supports both the retention prune (delete all but the newest 200 per row_id, ordered by id —
-- bigserial is monotonic and immune to clock skew, unlike ordering by saved_at) and the Settings
-- "last 50" Version History list (same row_id, same order, descending).
create index if not exists res_state_history_row_id_id_idx on public.res_state_history (row_id, id desc);

alter table public.res_state_history enable row level security;
revoke all on public.res_state_history from anon;
-- No insert/update/delete grant to anyone, admin included — the SECURITY DEFINER trigger function
-- below is the only writer, by design (point 1 of this feature's spec: "no insert/update/delete
-- policies, only the SECURITY DEFINER trigger writes").
grant select on public.res_state_history to authenticated;
drop policy if exists "res_state_history_admin_select" on public.res_state_history;
create policy "res_state_history_admin_select" on public.res_state_history for select
  to authenticated
  using (public.is_admin());

-- AFTER UPDATE: archives OLD — the row as it stood immediately before this update, attributed to
-- OLD.updated_by/OLD.updated_at (whoever actually wrote THAT version), not to the caller doing the
-- current update. `security definer` is load-bearing here (unlike the audit-fields trigger above):
-- `authenticated` has no insert grant on res_state_history at all, so an ordinary admin session
-- could not write this row directly — the function runs as its owner instead, same bypass
-- reasoning as `is_admin()`/`resident_block_lookup()` elsewhere in this schema. `set search_path =
-- ''` (every reference below schema-qualified) for the same reason resident_block_lookup() uses
-- it: this function writes real department data on bypassed RLS, so it gets the strictest
-- search_path available.
create or replace function public.res_state_archive_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.res_state_history (row_id, data, version, saved_by, saved_at)
  values (old.id, old.data, old.version, old.updated_by, old.updated_at);

  -- Retention: keep only the newest 200 snapshots per row_id. Runs every write rather than on a
  -- schedule — res_state saves are already debounced client-side (1.5s) and infrequent compared to
  -- almost any other table in this schema, so an extra DELETE per save is cheap, and it keeps the
  -- table self-maintaining with no separate cron/function to remember to run.
  delete from public.res_state_history
  where row_id = old.id
    and id not in (
      select id from public.res_state_history
      where row_id = old.id
      order by id desc
      limit 200
    );

  return null; -- AFTER trigger return value is ignored; null is the documented convention.
end;
$$;

drop trigger if exists res_state_archive_history on public.res_state;
create trigger res_state_archive_history
  after update on public.res_state
  for each row execute function public.res_state_archive_history();

commit;
