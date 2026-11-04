# Data retention: Resident Scheduler (residentscheduling.netlify.app)

Technical owner: Benjamin Pilkey. Date: 2026-11-04.
Database: Supabase project `wjyygoansjfbzzfvtsjq` (shared with EM Scheduler; this app's tables only).
Authority: UT Health San Antonio Records Retention Schedule RRS-2025 (IHOP 2.2.1, recertified through March 2030).

## Record status

The official resident duty/shift schedule is RSIN 16.1 (USR46) "Schedules/Assignments, Residents and Fellows": fiscal-year end + 10 years, kept by the GME office and the published schedule system. This app holds a **working copy** used to build the schedule. Under IHOP 2.2.1, a convenience copy is destroyed when no longer useful and is never kept longer than the record copy.

No AI/LLM is used. The scheduling engine and solver are rule-based.

## Data held

| Data | Where | Identifies people | Retention | How deleted today |
| --- | --- | --- | --- | --- |
| Schedule document (roster, blocks, assignments, settings) | `res_state` row `main` (jsonb), admin-only RLS; also the admin's browser localStorage (`res_*` keys) | Yes (resident names) | Current + prior academic year while in use | Admin edits/removes residents and blocks in-app; localStorage cleared via Settings or browser |
| Admin playgrounds | `res_state` rows `pg_<owner>_<id>` | Yes (copy of roster) | Until the admin deletes it | In-app playground delete (`DELETE /res_state?id=eq.<row>`) |
| Schedule history snapshots | `res_state_history` (trigger-written, admin-read only) | Yes | Newest 200 snapshots per row; older ones pruned automatically on every write (`migrate_res_state_history.sql`) | Automatic |
| Day-off requests (dates, reason, decision) | `day_off_requests` | Yes (resident id; free-text reason) | Until the end of the academic year the dates fall in | Manual by technical owner (no in-app delete; residents can cancel, which sets `status='cancelled'`) |
| Accounts (email, role, resident link) | `profiles`, Supabase Auth | Yes | While the person is in the program | Admin removes access; auth user deleted by the technical owner |
| Admin email allowlist | `admin_email_allowlist` | Yes (emails) | While the person is an admin | Manual SQL by the technical owner |
| App feedback | `feedback` (shared table, `app` column), insert-only for clients | Possibly (free text) | 24 months | Manual by the technical owner |
| Request notification emails | Sent via Resend (`supabase/functions/notify-request`) | Yes | Not stored by the app; Resend logs follow Resend's retention | n/a |

## Automated purge

Only `res_state_history` is pruned automatically (newest 200 per row). No time-based purge exists yet for `day_off_requests`, `feedback` or departed residents' accounts. **Target: 2026-12-15.**

## Deletion on request

A resident or the program asks the technical owner (Benjamin Pilkey). The technical owner removes the person from the roster, their day-off requests, profile and auth user within 30 days. Supabase backups roll off on Supabase's schedule.
