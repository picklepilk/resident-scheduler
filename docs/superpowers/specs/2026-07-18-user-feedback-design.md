# User Feedback + Admin Portal — Design

## Overview

Add an in-app way to report bugs, crashes, or improvement ideas, and a
password-gated admin view to triage them. This is one of four sibling apps
(Kitchen Inventory, ecowater-pricing-app, ems-inventory, resident-scheduler)
getting the same feature; each app adapts the shared pattern to its own
stack. (EM Student and em-rvu-assistant are excluded from this round —
neither has a database of its own yet.)

This app's cloud sync is optional (`SUPABASE_ENABLED`) and, when configured,
**shares a Supabase project with the sibling `em-scheduler` app** (per
`.env.example`: "reused from the em-scheduler project's .env"). The feedback
feature is only usable when sync is configured — no separate project is
provisioned just for feedback. Because the project is shared infrastructure,
the new table carries an explicit `app_name` column rather than assuming
it's the only feedback source that project will ever have.

This is a **Track A** app: admin access is gated by a shared password,
checked server-side by a Netlify Function that alone holds the Supabase
service-role key — matching Kitchen Inventory and ecowater-pricing-app. This
app has no auth system of its own (whoever has the URL + env vars has full
read-write to `res_state`), so a password is the only viable gate.

## Data model

New table (schema documented here since, like `res_state`, this repo keeps
no `supabase/migrations` folder — apply directly in the Supabase SQL editor):

```sql
create table feedback (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  app_name      text not null default 'resident-scheduler',
  type          text not null check (type in ('bug','crash','idea')),
  message       text not null,
  contact       text,
  page          text,          -- active sidebar tab at submit time
  user_agent    text,
  app_version   text,
  status        text not null default 'new' check (status in ('new','reviewed','resolved')),
  meta          jsonb
);

alter table feedback enable row level security;

create policy "anyone can submit feedback"
  on feedback for insert
  with check (true);

-- No select/update/delete policy for anon — deliberately NOT the
-- wide-open posture res_state uses. The admin view goes through the
-- Netlify Function's service-role key instead, never the anon key.
```

A brand-new table, structurally unrelated to the single-row `res_state`
document — it needs many independent rows, one per report, so it doesn't
reuse any of `res_state`'s sync machinery (`sbFetch`, `syncBindings`,
`LS_BACKUP_KEYS`). Every insert/query hardcodes `app_name = 'resident-scheduler'`
so a future feedback feature on `em-scheduler` (same project) can't collide.

## Feedback widget

A floating "Feedback" button, rendered in the root `ResidentScheduler`
component alongside the sidebar (visible regardless of active tab), opens a
small modal:
- **Type** — segmented control: Bug / Crash / Idea.
- **Message** — required textarea.
- **Contact** — optional text input.

New helper functions alongside the existing `sbFetch`-based cloud-sync code
(`// ─── SUPABASE SYNC ───` section) — `submitFeedback({type, message,
contact})` posts directly via `sbFetch` using the anon key. The button
doesn't render at all when `SUPABASE_ENABLED` is false, matching how the
`AutosaveIndicator`'s cloud states only appear when sync is configured.
Auto-attaches `page` (current `TABS` entry), `navigator.userAgent`, and
`app_version` (`package.json` version, injected via the same `%VITE_*%`
HTML-token mechanism already used for the Supabase URL/key).

## Crash auto-capture

`window.addEventListener('error', ...)` / `('unhandledrejection', ...)`,
installed once in `main.jsx`, calls `submitFeedback` with `type: 'crash'`,
`message` = error message (truncated), `meta.stack` = stack trace. Deduped
per session via `sessionStorage` (message + first stack line), capped at 5
auto-reports per session. No-ops when `SUPABASE_ENABLED` is false.

## Admin function + view

New `netlify/functions/feedback-admin.js`, plus a `[functions]` block added
to `netlify.toml` and a redirect (`/api/feedback-admin/*` →
`/.netlify/functions/feedback-admin/:splat`) placed **before** the existing
SPA catch-all redirect:
- Requires a password header (`x-feedback-password`) checked against the
  `FEEDBACK_ADMIN_PASSWORD` Netlify environment variable.
- Uses `SUPABASE_SERVICE_ROLE_KEY` (Netlify env var, server-only) to query
  `feedback` rows **filtered to `app_name = 'resident-scheduler'`**,
  bypassing RLS.
- `GET` returns the list; `PATCH {id, status}` updates triage status.

New entry added to the `TABS` array / `SidebarNav` (e.g. "Feedback"), only
shown when `SUPABASE_ENABLED` is true. Prompts for the admin password on
first visit; holds it in `sessionStorage` once accepted. Lists feedback
newest-first with type badge, message, contact, page, timestamp, and a
status dropdown that calls the function's `PATCH`.

## Out of scope

- Notifications on new feedback.
- Attachments/screenshots.
- Any change to `res_state`'s existing wide-open RLS posture (unrelated,
  pre-existing, accepted tradeoff per CLAUDE.md).
