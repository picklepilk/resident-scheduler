# Resident Day-Off Request & Approval Workflow — Design

**Date:** 2026-07-18
**Status:** Approved by chief (Dr. Pilkey), ready for implementation planning

## Context

This is one of several pieces of work that came out of reviewing `Scheduling Rules.docx`
(a Q&A document between Dr. Pilkey and a colleague) and a broader ask to modernize the app.
That review turned up four largely independent pieces of work:

1. **Scheduling-rule reconciliation** — checked against the live code; nearly everything in the
   doc is already implemented correctly (US/EM windows, BAMC Thursday GR + one-Wednesday-overnight
   exception, Psych Mon/Tue rules, IM CCU/Code Blue blackouts, trauma night PGY/weekday windows,
   EM/Vac shift counts, Anesthesia first-Friday-of-calendar-month). The EM Home Wednesday rule
   (no day shifts, evening/night OK, GR-only conflict) was specifically re-verified against PGY-1/2/3
   and is already correct everywhere. No app changes came out of this review.
2. **Cloud backend** — already built (`dd1c8a4`, `5ac57b9`, optional Supabase sync, see CLAUDE.md's
   "Cloud sync" section) and appears configured locally (`.env` has real-looking values, not
   placeholders). Not yet independently verified as deployed/live on Netlify — separate follow-up.
3. **This document: resident day-off requests with chief approval.**
4. **Mobile-friendly UI** and **QGenda export format** — separate, not-yet-designed follow-ups.

A related but distinct gap surfaced during this design and is explicitly **out of scope** here:
the app has no mechanism to auto-assign or validate "exactly one jeopardy call day per EM Home
resident per EM block" — `jeopardyDates` today is a free-form, chief-edited list with no
per-block-count expectation. Queued as its own follow-up.

## Goals

- Residents can submit day-off requests (one or more dates, or a range) with an optional reason,
  without needing the chief to manually enter anything on their behalf.
- The chief approves or denies requests from inside the existing app, with an optional note back
  to the resident on denial (and optionally on approval).
- An approved request becomes a real, enforced schedule block automatically — no separate manual
  step to "also" block the date.
- A pending request is visible on the scheduling grid as a soft cue, distinct from an approved one.
- Residents can only ever see their own request history/status — never the schedule, never other
  residents' requests.

## Non-goals

- Residents do not get any visibility into the generated schedule, coverage, or other residents'
  data.
- No SMS notifications, only email.
- No general-purpose messaging/comment thread between chief and resident beyond the single
  approve/deny note.
- No change to the scheduling/eligibility engine itself — approved requests reuse the existing
  `approvedDatesOff` hard-block mechanism as-is.

## Architecture overview

The app currently has zero authentication — a single shared Supabase row (`res_state`, wide-open
RLS) that whoever has the app open can read/write, per CLAUDE.md's "Cloud sync" section. This
feature introduces the app's first real per-user identity and its first RLS-protected tables,
scoped narrowly to requests — the rest of the app's data model and sync mechanism (`LS_BACKUP_KEYS`,
`syncBindings`, the existing `res_state` row) are untouched.

Two new pieces ship inside the existing app/repo (not a separate deploy):

- A new, login-gated route for residents (e.g. `/requests`) — no relation to the main
  `ResidentScheduler` tab UI, renders nothing else.
- A new "Requests" tab inside the existing chief-facing app, gated behind the chief's own login.

Both share the same Supabase project already used for cloud sync.

## Data model

Two new Supabase tables, both with row-level security enabled (unlike the existing wide-open
`res_state` row):

**`profiles`**
| column | type | notes |
|---|---|---|
| `id` | uuid, PK | = Supabase Auth user id |
| `email` | text | from auth, used for domain-restriction check at signup |
| `role` | text | `'resident'` \| `'chief'` — chief's row is set manually once via the Supabase dashboard (no self-promotion flow needed for a single admin) |
| `resident_id` | text, nullable | set on first login when a resident picks their name from the existing roster; links to `emRoster` entry id |

**`day_off_requests`**
| column | type | notes |
|---|---|---|
| `id` | uuid, PK | |
| `resident_id` | text | matches `profiles.resident_id` / roster entry id |
| `dates` | text[] | one or more ISO date strings |
| `reason` | text, nullable | optional, resident-entered |
| `status` | text | `'pending'` \| `'approved'` \| `'denied'` \| `'cancelled'` (resident-withdrawn) |
| `decision_note` | text, nullable | optional, chief-entered on approve/deny |
| `submitted_at` | timestamptz | |
| `decided_at` | timestamptz, nullable | |
| `decided_by` | uuid, nullable | chief's `profiles.id` |

RLS policies:
- A resident (via their linked `profiles.resident_id`) may `INSERT`/`SELECT` only rows where
  `resident_id` matches their own; may `UPDATE` `status` from `pending` to `cancelled` only, and
  only on their own rows.
- Only a `profiles.role = 'chief'` account may `SELECT` all rows or `UPDATE` `status`/`decision_note`/
  `decided_at`/`decided_by` on any row.

No changes to `LS_BACKUP_KEYS` or the existing backup/restore JSON — these two tables are
Supabase-only, not part of local-storage/backup round-tripping, since they're inherently
server-side (multi-user) data.

## Auth & roles

- Supabase Auth, magic-link (passwordless) only.
- Signup restricted to the institution's email domain — checked before a login link is issued.
- First login: resident picks their name from the existing roster once, which sets
  `profiles.resident_id`; every subsequent login re-uses that link automatically.
- The chief's own account is manually flagged `role: 'chief'` once via the Supabase dashboard
  after their first login — a one-time bootstrap step, not a feature to build.

## Resident-facing UI (`/requests`)

- Unauthenticated: email entry → magic link.
- First authenticated visit only: "which resident are you?" picker from the roster.
- Thereafter: a simple form (pick date(s) or a range, optional free-text reason, submit) plus a
  list of everything they've ever submitted, grouped by the scheduling block each date falls into
  (matched dynamically against known block date ranges at render time — not stored statically, so
  it stays correct if block boundaries ever change). Dates that don't yet fall inside any known
  block are grouped under "Not yet scheduled."
- Each request shows its status and, if denied, the chief's optional note.
- A still-`pending` request can be withdrawn/cancelled by the resident.
- If a picked date falls inside a block whose start is less than 8 weeks away, an inline warning
  is shown at submit time (informational only — does not block submission).

No schedule, coverage, or other-resident data is ever fetched or rendered on this route.

## Chief-facing UI (new "Requests" tab)

- Gated behind the chief's own login (same magic-link flow, `role: 'chief'`).
- Sidebar badge with a pending-request count, same visual pattern as the existing Violations badge.
- List of pending requests grouped by resident/block, each with Approve/Deny.
  - **Approve** appends the request's date(s) into that resident's existing `approvedDatesOff`
    array (the same field the chief already edits manually today) and flips `status: 'approved'`.
    No changes needed to `getEligibleShifts`, the generator, or validation — they already treat
    `approvedDatesOff` as a hard block.
  - **Deny** flips `status: 'denied'`; nothing is written to the schedule. An optional note field
    is shown back to the resident.

## Reflecting status on the scheduling grid

- **Approved** requests need no new UI — they land in `approvedDatesOff`, which the grid already
  renders as "Approved day off" (existing OFF marker/legend entry).
- **Pending** requests get a new, distinct visual cue on the relevant resident/date cell — same
  visual language as the existing jeopardy "J" badge (small corner marker, tooltip on hover) —
  informational only, does not affect eligibility or the generator.

## Email notifications

- Provider: Resend (API key stored as a Supabase Edge Function secret, never in the repo — same
  posture as the existing Supabase URL/anon key handling described in CLAUDE.md).
- Supabase Database Webhook → Edge Function → Resend API, fired on:
  - new `pending` row inserted → email to the chief
  - `status` changed to `approved`/`denied` → email to that resident

## Testing / verification plan

No test suite exists in this repo (per CLAUDE.md) — verification is manual, via `npm run dev` plus
exercising the actual Supabase project:

- Sign up with an in-domain and an out-of-domain email; confirm the out-of-domain one is rejected.
- Submit a request as a resident; confirm it's invisible to a different resident's login.
- Approve a request as the chief; confirm the date appears as an approved day-off on the grid and
  blocks eligibility in the picker/generator without any code path changes.
- Deny a request with a note; confirm the resident sees the note and the date was never written to
  `approvedDatesOff`.
- Withdraw a pending request; confirm it disappears from the chief's queue.
- Submit a request inside the 8-week window; confirm the warning shows but submission still
  succeeds.
- Trigger both notification emails and confirm delivery.

## Known limitations (accepted, not implementation bugs)

Found during the final whole-branch review and consciously accepted rather than fixed, since
closing them would require changes well beyond this feature's scope:

- **"Residents never see the schedule" is a UI convention, not a data-layer security boundary.**
  `/requests` reads the same wide-open-RLS `res_state` row the chief's cloud sync already uses
  (see `ResidentScheduler.jsx`'s "SUPABASE SYNC" section) to power its block-date lookups — the
  *entire* generated schedule crosses the wire to the resident's browser before the app narrows
  what it renders down to just block dates/roster names. Separately, and more directly: the main
  `/` route (the full schedule editor) has no authentication at all — a resident with the
  `/requests` link can simply navigate to `/` and see or edit everything. Neither is new: the app
  has been zero-auth and wide-open-RLS by design since before this feature (an explicit prior
  tradeoff, not an oversight). This feature doesn't make that worse, but it also doesn't deliver a
  real privacy guarantee — only a UI one. Closing this for real would mean serving `/requests` a
  narrow, RLS-scoped view or Edge Function instead of the shared blob, and gating `/` itself with
  real authentication — a substantial follow-up project, not a patch to this one.

## Open follow-ups (not part of this spec)

- Verify the existing cloud sync is actually deployed/live (Netlify env vars, Supabase table
  exists).
- Mobile-friendly responsive pass across the app.
- QGenda-compatible schedule export format (needs a sample template from the chief).
- Single-jeopardy-day-per-EM-Home-resident-per-EM-block auto-assignment/validation.
