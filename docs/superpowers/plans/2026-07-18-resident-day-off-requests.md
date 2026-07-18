# Resident Day-Off Request & Approval Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let residents submit day-off requests (with an optional reason) through a new login-gated `/requests` page, let the chief approve/deny them from a new tab in the existing app, and have an approval automatically become a real, enforced schedule block — with email notifications both directions.

**Architecture:** Two new Supabase tables (`profiles`, `day_off_requests`) with row-level security, using the official `@supabase/supabase-js` client for auth and CRUD on just these two tables (the existing hand-rolled `sbFetch` sync of `res_state` is untouched). A new, separate resident-facing route (`src/residentRequests/*`, mounted at `/requests` via a pathname check in `main.jsx`) has zero visibility into the schedule — only its own request history. A new "Requests" tab inside the existing `ResidentScheduler.jsx` app is gated behind the chief's own login and writes approvals straight into the existing `approvedDatesOff` field, so no changes to the eligibility/generator engine are needed. Email notifications go through a Supabase Edge Function calling Resend.

**Tech Stack:** React 19, Vite 6, Tailwind CSS, `@supabase/supabase-js` (new dependency, auth + 2 tables only), Supabase Postgres + Auth + Edge Functions (Deno/TypeScript), Resend (email).

## Global Constraints

- No test runner or lint config exists in this repo (per CLAUDE.md) — every verification step below is manual: run `npm run dev`, do the described action in a browser, confirm the described outcome. Do not introduce a test framework as part of this plan; that would be a separate, unrequested infrastructure change.
- Never commit real resident names/PII — this repo is public. All manual verification should use placeholder/test data.
- This feature requires cloud sync (`VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`) to already be configured, since the resident-facing route has no other way to read block date ranges (it reads the existing shared `res_state` row, read-only, same wide-open RLS policy already documented in `ResidentScheduler.jsx`'s "SUPABASE SYNC" section).
- Never commit the `RESEND_API_KEY` — it's a Supabase Edge Function secret, set via the Supabase CLI, not an env var in this repo.
- Follow the existing code's plain-Tailwind-utility-classes style (no CSS-in-JS, no new UI library) and the existing `hsl(var(--...))` design tokens from `tailwind.config.js` for anything chrome-colored (buttons, focus rings). Status colors (pending/approved/denied) may use plain Tailwind palette colors (amber/green/red) — same pattern the existing app already uses for violation severity.
- New files use the same functional-component + hooks style as `ResidentScheduler.jsx` (no class components, no new state-management library).

---

### Task 1: Supabase Auth client + config plumbing

**Files:**
- Modify: `package.json`
- Create: `src/supabaseClient.js`
- Modify: `index.html`
- Modify: `.env.example`

**Interfaces:**
- Produces: `supabase` (the `@supabase/supabase-js` client instance, or `null` if unconfigured), `AUTH_ENABLED` (boolean), `ALLOWED_EMAIL_DOMAIN` (string, may be `''`) — all named exports from `src/supabaseClient.js`, consumed by every later resident/chief-facing file in this plan.

- [ ] **Step 1: Add the dependency**

Run: `npm install @supabase/supabase-js`

Expected: `package.json`'s `dependencies` gains `"@supabase/supabase-js": "^2.x.x"` and `package-lock.json` (or equivalent) updates.

- [ ] **Step 2: Add the new env var placeholders**

Modify `.env.example`, appending after the existing two Supabase lines:

```
# Restricts resident/chief self-registration (magic-link signup) at /requests to this email
# domain — e.g. "youruh.edu". Required for the day-off request feature; leave unset to disable
# that feature entirely (the /requests route will show a "not configured" message).
VITE_ALLOWED_EMAIL_DOMAIN=youruh.edu
```

- [ ] **Step 3: Inject the new token in index.html**

Modify `index.html`, in the existing inline `<script>` block:

```html
    <script>
      window.__SUPABASE_URL__  = "%VITE_SUPABASE_URL%";
      window.__SUPABASE_ANON__ = "%VITE_SUPABASE_ANON_KEY%";
      window.__ALLOWED_EMAIL_DOMAIN__ = "%VITE_ALLOWED_EMAIL_DOMAIN%";
    </script>
```

- [ ] **Step 4: Create the client module**

Create `src/supabaseClient.js`:

```js
import { createClient } from '@supabase/supabase-js';

// Mirrors the isUnresolvedToken guard in ResidentScheduler.jsx's SUPABASE SYNC section — Vite's
// %VITE_...% HTML token substitution leaves the literal unresolved token string in place (not an
// empty string) when the env var isn't defined for a build, which would otherwise make every
// check below falsely truthy.
const isUnresolvedToken = v => typeof v === 'string' && v.startsWith('%') && v.endsWith('%');
const readGlobal = key => {
  const raw = (typeof globalThis !== 'undefined' && globalThis[key]) || '';
  return isUnresolvedToken(raw) ? '' : raw;
};

const SUPABASE_URL = readGlobal('__SUPABASE_URL__');
const SUPABASE_ANON = readGlobal('__SUPABASE_ANON__');
export const ALLOWED_EMAIL_DOMAIN = readGlobal('__ALLOWED_EMAIL_DOMAIN__');

export const AUTH_ENABLED = Boolean(SUPABASE_URL && SUPABASE_ANON && ALLOWED_EMAIL_DOMAIN);

// null when unconfigured — every caller must check AUTH_ENABLED (or that `supabase` is non-null)
// before using it, same fallback-to-clean-disabled-state philosophy as SUPABASE_ENABLED elsewhere
// in this app.
export const supabase = AUTH_ENABLED
  ? createClient(SUPABASE_URL, SUPABASE_ANON)
  : null;
```

- [ ] **Step 5: Verify**

Run `npm run dev`, open the browser console at `http://localhost:5173/`, and confirm no import errors are thrown (the main scheduler app still loads normally — this module isn't imported anywhere yet, so this step is really just confirming `npm install` + the new file don't break the build). Run `npm run build` and confirm it completes without errors.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/supabaseClient.js index.html .env.example
git commit -m "Add @supabase/supabase-js client for the resident-request auth feature"
```

---

### Task 2: Database schema — profiles + day_off_requests tables, RLS policies

**Files:**
- Create: `supabase/day_off_requests.sql`

**Interfaces:**
- Produces: two Postgres tables (`profiles`, `day_off_requests`) and their RLS policies that every later Supabase-querying task in this plan depends on. Not consumed by any JS — this is a reference script the chief runs by hand in the Supabase SQL editor, same pattern as the existing `res_state` table (documented as a comment in `ResidentScheduler.jsx`, never auto-applied).

- [ ] **Step 1: Write the schema script**

Create `supabase/day_off_requests.sql`:

```sql
-- Run this once in the Supabase project's SQL editor to enable the resident day-off request
-- feature. Same "run by hand, no migration tooling" pattern as the res_state table documented
-- in src/ResidentScheduler.jsx's SUPABASE SYNC section.
--
-- Unlike res_state's wide-open RLS, these two tables carry per-resident data, so they use real
-- row-level security scoped by the authenticated user (auth.uid()).

create table profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null,
  role        text not null default 'resident' check (role in ('resident','chief')),
  resident_id text,
  created_at  timestamptz not null default now()
);
alter table profiles enable row level security;

-- Every user (resident or chief) may read and create only their own profile row. The insert
-- policy pins role to 'resident' (like the update policy below) — without this, a resident could
-- self-insert a profile row with role='chief' before one exists, self-promoting to admin.
create policy "profiles_select_own" on profiles for select
  using (auth.uid() = id);
create policy "profiles_insert_own" on profiles for insert
  with check (auth.uid() = id and role = 'resident');
-- A resident may set their own resident_id (the one-time "which resident are you" pick) but can
-- never grant themselves the 'chief' role through the app — role stays 'resident' on any
-- self-update. The chief's own row is flipped to role='chief' manually via the Supabase table
-- editor after their first login (one-time bootstrap, not a feature to build).
create policy "profiles_update_own" on profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id and role = 'resident');

create table day_off_requests (
  id            uuid primary key default gen_random_uuid(),
  resident_id   text not null,
  dates         text[] not null,
  reason        text,
  status        text not null default 'pending' check (status in ('pending','approved','denied','cancelled')),
  decision_note text,
  submitted_at  timestamptz not null default now(),
  decided_at    timestamptz,
  decided_by    uuid references profiles(id)
);
alter table day_off_requests enable row level security;

-- A resident may see and create only rows tagged with their own resident_id (looked up from
-- their own profile row, which profiles_select_own already lets them read). The insert policy
-- also pins status/decided_*/decision_note to their unset defaults — without this, a resident
-- could insert a request already marked 'approved' with a fabricated decided_by, bypassing the
-- chief's decision entirely.
create policy "requests_select_own" on day_off_requests for select
  using (resident_id = (select resident_id from profiles where id = auth.uid()));
create policy "requests_insert_own" on day_off_requests for insert
  with check (
    resident_id = (select resident_id from profiles where id = auth.uid())
    and status = 'pending'
    and decision_note is null
    and decided_at is null
    and decided_by is null
  );
-- A resident may only ever flip their own still-pending request to 'cancelled' (withdrawal).
-- WITH CHECK alone can only pin the new value of individual columns (status='cancelled') — it
-- cannot express "no other column changed," so a resident could otherwise rewrite decision_note/
-- decided_*/dates/reason in the same update. The trigger below closes that gap.
create policy "requests_cancel_own" on day_off_requests for update
  using (
    resident_id = (select resident_id from profiles where id = auth.uid())
    and status = 'pending'
  )
  with check (status = 'cancelled');

-- The chief (role='chief' on their own profile row) may read and decide on every request.
create policy "requests_chief_select_all" on day_off_requests for select
  using (exists (select 1 from profiles where id = auth.uid() and role = 'chief'));
create policy "requests_chief_update_all" on day_off_requests for update
  using (exists (select 1 from profiles where id = auth.uid() and role = 'chief'));

-- Guards requests_cancel_own above: when a resident's update transitions pending -> cancelled,
-- every column except status must stay unchanged. Uses IS DISTINCT FROM (not =/!=) because a
-- pending request's decided_at/decided_by/decision_note/reason are normally NULL, and plain SQL
-- equality against NULL evaluates to NULL (neither true nor false) rather than a usable boolean —
-- with plain =/!=, a resident could smuggle a fabricated decided_by into the same cancel-update
-- undetected, since `NULL = NULL` never trips the guard. Does not affect the chief's approve/deny
-- path (that transitions to 'approved'/'denied', never 'cancelled', so this condition never fires
-- for it — verified: requests_chief_update_all's own USING clause is what authorizes that path,
-- and this trigger only inspects OLD/NEW status, not which policy allowed the write).
create or replace function public.enforce_cancel_only_status()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'cancelled' and old.status = 'pending' then
    if new.resident_id is distinct from old.resident_id
       or new.dates is distinct from old.dates
       or new.reason is distinct from old.reason
       or new.decision_note is distinct from old.decision_note
       or new.submitted_at is distinct from old.submitted_at
       or new.decided_at is distinct from old.decided_at
       or new.decided_by is distinct from old.decided_by
    then
      raise exception 'Cancelling a request may only change status';
    end if;
  end if;
  return new;
end;
$$;

create trigger day_off_requests_cancel_guard
  before update on day_off_requests
  for each row execute function public.enforce_cancel_only_status();
```

- [ ] **Step 2: Verify**

The chief (Dr. Pilkey) runs this script once in the Supabase project's SQL editor (Supabase dashboard → SQL Editor → paste → Run). Confirm both tables appear under Table Editor with RLS marked "Enabled," and that no error was raised running the script.

- [ ] **Step 3: Commit**

```bash
git add supabase/day_off_requests.sql
git commit -m "Add profiles + day_off_requests schema and RLS policies"
```

---

### Task 3: Server-side email-domain signup restriction

A client-side-only domain check (email ends with `@youruh.edu`) is trivial to bypass — anyone can call Supabase's auth REST API directly with the public anon key (visible in this public repo's deployed bundle regardless) and skip the app's JS entirely. The real enforcement has to live in Postgres, using a Supabase Auth Hook that runs before a user is created.

**Files:**
- Create: `supabase/auth_hook_domain_restriction.sql`

**Interfaces:**
- Produces: a Postgres function `public.restrict_signup_domain(event jsonb)` wired as a Supabase "Before User Created" Auth Hook. No JS interface — this is a server-side gate, invisible to every later task.

- [ ] **Step 1: Write the hook function**

Create `supabase/auth_hook_domain_restriction.sql`:

```sql
-- Run once, after day_off_requests.sql. Wires a "Before User Created" Auth Hook so email-domain
-- restriction is enforced server-side — a client-side-only check can be bypassed by calling
-- Supabase's auth API directly with the public anon key, which is unavoidably visible in this
-- public repo's deployed bundle.
--
-- After running this script, finish the wiring in the Supabase dashboard: Authentication → Hooks
-- → "Before User Created" → select the Postgres function `public.restrict_signup_domain`.
--
-- IMPORTANT: replace 'youruh.edu' below with the actual institutional domain — this must match
-- VITE_ALLOWED_EMAIL_DOMAIN exactly, or legitimate signups will be rejected.

-- Supabase's Postgres Auth Hook contract invokes this with a single `event jsonb` argument — the
-- function body reads `event->'user'->>'email'` below, so the parameter must be declared or every
-- invocation errors before the domain check ever runs (a silent full bypass or a signup outage,
-- depending on how the hook runtime handles the exception — either way, unacceptable for the
-- app's sole signup security gate).
create or replace function public.restrict_signup_domain(event jsonb)
returns jsonb
language plpgsql
as $$
declare
  user_email text := (event->'user'->>'email');
begin
  if user_email is null or right(lower(user_email), length('@youruh.edu')) <> '@youruh.edu' then
    return jsonb_build_object(
      'error', jsonb_build_object(
        'http_code', 403,
        'message', 'Sign-up is restricted to youruh.edu email addresses.'
      )
    );
  end if;
  return jsonb_build_object();
end;
$$;

-- Supabase's documented pattern for Postgres-function Auth Hooks: only the auth system itself
-- should be able to invoke this — otherwise it's also reachable as an arbitrary PostgREST RPC
-- endpoint (/rest/v1/rpc/restrict_signup_domain) by any anon/authenticated caller. Not a bypass of
-- the domain check itself (calling it directly doesn't create a user), but unnecessary surface.
revoke execute on function public.restrict_signup_domain(jsonb) from public, anon, authenticated;
grant execute on function public.restrict_signup_domain(jsonb) to supabase_auth_admin;
```

- [ ] **Step 2: Wire the hook and verify**

In the Supabase dashboard: Authentication → Hooks → "Before User Created" → select `restrict_signup_domain`. Then, from the browser console at `http://localhost:5173` (after Task 1's `supabase` client exists — this can be tested directly via the browser console once Task 1 is merged):

```js
import('/src/supabaseClient.js').then(({ supabase }) =>
  supabase.auth.signInWithOtp({ email: 'test@gmail.com' }).then(console.log)
);
```

Expected: an error response (HTTP 403, the message above) — confirming a non-domain email is rejected server-side, not just by the app's UI.

- [ ] **Step 3: Commit**

```bash
git add supabase/auth_hook_domain_restriction.sql
git commit -m "Enforce email-domain signup restriction server-side via Auth Hook"
```

---

### Task 4: Block-lookup pure helpers

**Files:**
- Create: `src/residentRequests/blockLookup.js`

**Interfaces:**
- Consumes: an array of block-like objects `{ id, name, startDate, endDate }` (matches the shape already used for `block` and each `blocksHistory[]` entry in `ResidentScheduler.jsx`).
- Produces: `findBlockForDate(dateStr, blocks)` → the matching block object or `null`; `weeksUntil(fromDateStr, toDateStr)` → number of whole weeks between two ISO date strings; `fetchResState()` → `Promise<object|null>`, the shared read-only fetch of the `res_state` row's `data` blob (the single place the URL/anon-key-reading and error handling live — Task 6's `fetchRosterForPicker` reuses this instead of duplicating it); `fetchBlocksForLookup()` → `Promise<{ id, name, startDate, endDate }[]>`, built on top of `fetchResState()`. All consumed by Task 6 (roster picker), Task 7 (request form), and Task 8 (request list).

- [ ] **Step 1: Write the pure date/block helpers**

Create `src/residentRequests/blockLookup.js`:

```js
// Pure helpers for matching a resident's requested date against known scheduling blocks, and for
// reading those blocks read-only from the shared res_state cloud row (same wide-open-RLS row the
// main app's cloud sync already uses — see ResidentScheduler.jsx's SUPABASE SYNC section). This
// file intentionally does NOT import from ResidentScheduler.jsx — the resident-facing app is a
// separate surface with no access to that file's local component state.

export function findBlockForDate(dateStr, blocks) {
  return blocks.find(b => b.startDate && b.endDate && dateStr >= b.startDate && dateStr <= b.endDate) || null;
}

// Whole weeks between two ISO date strings (toDateStr expected to be on/after fromDateStr).
export function weeksUntil(fromDateStr, toDateStr) {
  const from = new Date(`${fromDateStr}T00:00:00Z`);
  const to = new Date(`${toDateStr}T00:00:00Z`);
  return Math.floor((to.getTime() - from.getTime()) / (7 * 24 * 60 * 60 * 1000));
}

const RES_STATE_URL_KEY = '__SUPABASE_URL__';
const RES_STATE_ANON_KEY = '__SUPABASE_ANON__';

// Shared read-only fetch of the shared res_state row's `data` blob — the single place the
// URL/anon-key-reading and error handling live for every read this resident-facing app needs
// (Task 6's fetchRosterForPicker reuses this instead of duplicating it). No Supabase Auth session
// needed, since that table's RLS policy is intentionally wide-open (public_read_write). Returns
// null on any failure (unconfigured, network error, empty row) rather than throwing, since every
// caller only uses this for informational display (cutoff warning, block-grouping label, name
// picker) — never a hard gate.
export async function fetchResState() {
  const url = (typeof globalThis !== 'undefined' && globalThis[RES_STATE_URL_KEY]) || '';
  const anon = (typeof globalThis !== 'undefined' && globalThis[RES_STATE_ANON_KEY]) || '';
  if (!url || url.startsWith('%') || !anon || anon.startsWith('%')) return null;
  try {
    const res = await fetch(`${url}/rest/v1/res_state?id=eq.main&select=data`, {
      headers: { apikey: anon, Authorization: `Bearer ${anon}` },
    });
    if (!res.ok) return null;
    const rows = await res.json();
    return rows && rows[0] && rows[0].data ? rows[0].data : null;
  } catch {
    return null;
  }
}

export async function fetchBlocksForLookup() {
  const data = await fetchResState();
  if (!data) return [];
  const current = data.res_current_block;
  const history = Array.isArray(data.res_blocks_history) ? data.res_blocks_history : [];
  const all = [...history, ...(current ? [current] : [])];
  return all
    .filter(b => b && b.startDate && b.endDate)
    .map(b => ({ id: b.id, name: b.name || b.startDate, startDate: b.startDate, endDate: b.endDate }));
}
```

- [ ] **Step 2: Verify**

Run this in the browser console after `npm run dev` (adjust the import path to whatever dev-server URL Vite serves):

```js
import('/src/residentRequests/blockLookup.js').then(m => {
  const blocks = [{ id: '1', name: 'Block A', startDate: '2026-08-01', endDate: '2026-08-28' }];
  console.log(m.findBlockForDate('2026-08-15', blocks)); // expect the block object
  console.log(m.findBlockForDate('2026-09-01', blocks)); // expect null
  console.log(m.weeksUntil('2026-07-18', '2026-08-01'));  // expect 2
});
```

Expected: the three `console.log` outputs match the comments above.

- [ ] **Step 3: Commit**

```bash
git add src/residentRequests/blockLookup.js
git commit -m "Add pure block-lookup helpers for the resident-requests feature"
```

---

### Task 5: Resident-facing app shell, routing, and magic-link login

**Files:**
- Modify: `src/main.jsx`
- Create: `src/residentRequests/ResidentRequestsApp.jsx`
- Create: `src/residentRequests/LoginScreen.jsx`

**Interfaces:**
- Consumes: `supabase`, `AUTH_ENABLED`, `ALLOWED_EMAIL_DOMAIN` from `src/supabaseClient.js` (Task 1).
- Produces: `<ResidentRequestsApp/>` — the mounted root at `/requests`, which internally tracks `session` (Supabase auth session or `null`) and renders `<LoginScreen/>` when there's no session. Later tasks (6–8) render inside this shell once a session exists. `<LoginScreen embedded title subtitle/>` (all optional props, defaults: `embedded=false`, `title='Day-Off Requests'`, `subtitle=null`) is also reused directly by Task 9's chief-facing tab — the `embedded` prop swaps the full-page centered layout for a plain inline block so the same component drops into a tab panel without a second copy of the magic-link-send logic.

- [ ] **Step 1: Route by pathname in main.jsx**

Modify `src/main.jsx`:

```js
import React from 'react';
import ReactDOM from 'react-dom/client';
import '@fontsource/barlow/400.css';
import '@fontsource/barlow/500.css';
import '@fontsource/barlow/600.css';
import '@fontsource/barlow/700.css';
import '@fontsource/barlow-condensed/600.css';
import '@fontsource/barlow-condensed/700.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/600.css';
import '@fontsource/jetbrains-mono/700.css';
import './index.css';
import ResidentScheduler from './ResidentScheduler';
import ResidentRequestsApp from './residentRequests/ResidentRequestsApp';

const isRequestsRoute = window.location.pathname.replace(/\/+$/, '') === '/requests';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {isRequestsRoute ? <ResidentRequestsApp /> : <ResidentScheduler />}
  </React.StrictMode>
);
```

(No `netlify.toml` change needed — its existing `/* → /index.html` SPA redirect already serves `index.html` for `/requests`, and `main.jsx` does the rest client-side.)

- [ ] **Step 2: Write the login screen**

Create `src/residentRequests/LoginScreen.jsx`:

```jsx
import { useState } from 'react';
import { Mail, CheckCircle2 } from 'lucide-react';
import { supabase, AUTH_ENABLED, ALLOWED_EMAIL_DOMAIN } from '../supabaseClient';

// embedded=true drops the full-page centered layout in favor of a plain inline block, so this
// same component can be reused inside a tab panel (Task 9's chief-facing Requests tab) without a
// second copy of the magic-link-send form/logic.
function PageWrapper({ embedded, children }) {
  if (embedded) return <div className="max-w-sm">{children}</div>;
  return <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">{children}</div>;
}

export default function LoginScreen({ embedded = false, title = 'Day-Off Requests', subtitle }) {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (!AUTH_ENABLED) {
    return (
      <PageWrapper embedded={embedded}>
        <p className="text-sm text-gray-500 max-w-sm text-center">
          Day-off requests aren't configured yet. {embedded ? 'Set VITE_ALLOWED_EMAIL_DOMAIN.' : 'Ask the chief resident to finish setup.'}
        </p>
      </PageWrapper>
    );
  }

  async function submit(e) {
    e.preventDefault();
    setError('');
    const trimmed = email.trim().toLowerCase();
    if (!trimmed.endsWith(`@${ALLOWED_EMAIL_DOMAIN.toLowerCase()}`)) {
      setError(`Please use your @${ALLOWED_EMAIL_DOMAIN} email address.`);
      return;
    }
    setBusy(true);
    const { error: sendError } = await supabase.auth.signInWithOtp({ email: trimmed });
    setBusy(false);
    if (sendError) { setError(sendError.message); return; }
    setSent(true);
  }

  if (sent) {
    return (
      <PageWrapper embedded={embedded}>
        <div className="text-center max-w-sm">
          <CheckCircle2 className="mx-auto text-primary mb-3" size={32} />
          <p className="font-display text-lg font-semibold text-gray-800 mb-1">Check your email</p>
          <p className="text-sm text-gray-500">We sent a sign-in link to {email}.</p>
        </div>
      </PageWrapper>
    );
  }

  return (
    <PageWrapper embedded={embedded}>
      <form onSubmit={submit} className={embedded ? '' : 'bg-white border border-gray-200 rounded-lg p-6 w-full max-w-sm'}>
        <p className="font-display text-lg font-semibold text-gray-800 mb-1">{title}</p>
        <p className="text-sm text-gray-500 mb-4">{subtitle || `Sign in with your @${ALLOWED_EMAIL_DOMAIN} email.`}</p>
        <label className="block text-xs font-medium text-gray-700 mb-1">Email</label>
        <div className="relative mb-3">
          <Mail size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="email" required value={email} onChange={e => setEmail(e.target.value)}
            className="input-field pl-8 w-full" placeholder={`you@${ALLOWED_EMAIL_DOMAIN}`} />
        </div>
        {error && <p className="text-xs text-red-500 mb-3">{error}</p>}
        <button type="submit" disabled={busy}
          className="w-full bg-primary text-white text-sm font-medium rounded-md py-2 disabled:opacity-50">
          {busy ? 'Sending…' : 'Send sign-in link'}
        </button>
      </form>
    </PageWrapper>
  );
}
```

- [ ] **Step 3: Write the app shell**

Create `src/residentRequests/ResidentRequestsApp.jsx`:

```jsx
import { useEffect, useState } from 'react';
import { supabase, AUTH_ENABLED } from '../supabaseClient';
import LoginScreen from './LoginScreen';

export default function ResidentRequestsApp() {
  const [session, setSession] = useState(undefined); // undefined = not checked yet, null = signed out

  useEffect(() => {
    if (!AUTH_ENABLED) { setSession(null); return; }
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => setSession(newSession));
    return () => sub.subscription.unsubscribe();
  }, []);

  if (session === undefined) return null; // brief flash before the session check resolves
  if (!session) return <LoginScreen />;

  // Tasks 6-8 fill this in: resident-picker (first login) then the request form + list.
  return <div className="min-h-screen bg-gray-50 p-4">Signed in.</div>;
}
```

- [ ] **Step 4: Verify**

Run `npm run dev`, navigate to `http://localhost:5173/requests`. With `.env`'s Supabase vars set but `VITE_ALLOWED_EMAIL_DOMAIN` unset, confirm the "not configured" message shows. Add `VITE_ALLOWED_EMAIL_DOMAIN=youruh.edu` (or a test domain) to `.env`, restart `npm run dev`, reload — confirm the login form now shows, submitting a matching-domain email shows "Check your email," and a non-matching domain shows the inline error without calling Supabase. Also visit `http://localhost:5173/` and confirm the main scheduler still loads unaffected.

- [ ] **Step 5: Commit**

```bash
git add src/main.jsx src/residentRequests/ResidentRequestsApp.jsx src/residentRequests/LoginScreen.jsx
git commit -m "Add /requests route with magic-link login shell"
```

---

### Task 6: Resident name-picker (first-login profile linking)

**Files:**
- Create: `src/residentRequests/ResidentPicker.jsx`
- Modify: `src/residentRequests/ResidentRequestsApp.jsx`

**Interfaces:**
- Consumes: `fetchBlocksForLookup`-style read-only `res_state` fetch pattern (Task 4) — reused here to read `res_em_roster` instead of block dates; `session` (Supabase session object) from `ResidentRequestsApp`.
- Produces: once a name is picked, writes `profiles.resident_id`; `ResidentRequestsApp` re-reads the profile and stops rendering `ResidentPicker` once `resident_id` is set. Task 7/8 consume `profile.resident_id`.

- [ ] **Step 1: Add a roster-reading helper**

Modify `src/residentRequests/blockLookup.js`, adding a second exported function alongside `fetchBlocksForLookup`, built on Task 4's shared `fetchResState()` (same `res_state` row, same read-once-per-call pattern — no separate URL/anon-key-reading logic duplicated here):

```js
// Read-only roster fetch, same res_state row as fetchBlocksForLookup — returns only the fields
// needed to let a resident identify themselves (never exposes shift/schedule data).
export async function fetchRosterForPicker() {
  const data = await fetchResState();
  const roster = data && Array.isArray(data.res_em_roster) ? data.res_em_roster : [];
  return roster.map(r => ({ id: r.id, firstName: r.firstName, lastName: r.lastName }))
    .sort((a, b) => a.lastName.localeCompare(b.lastName));
}
```

- [ ] **Step 2: Write the picker**

Create `src/residentRequests/ResidentPicker.jsx`:

```jsx
import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { fetchRosterForPicker } from './blockLookup';

export default function ResidentPicker({ session, onLinked }) {
  const [roster, setRoster] = useState([]);
  const [selected, setSelected] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { fetchRosterForPicker().then(setRoster); }, []);

  async function confirm() {
    if (!selected) return;
    setBusy(true);
    setError('');
    const { error: upsertError } = await supabase.from('profiles').upsert({
      id: session.user.id,
      email: session.user.email,
      resident_id: selected,
    });
    setBusy(false);
    if (upsertError) { setError(upsertError.message); return; }
    onLinked(selected);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="bg-white border border-gray-200 rounded-lg p-6 w-full max-w-sm">
        <p className="font-display text-lg font-semibold text-gray-800 mb-1">Which resident are you?</p>
        <p className="text-sm text-gray-500 mb-4">One-time setup — this links your login to your profile.</p>
        <select value={selected} onChange={e => setSelected(e.target.value)} className="input-field w-full mb-3">
          <option value="">Select your name…</option>
          {roster.map(r => <option key={r.id} value={r.id}>{r.lastName}, {r.firstName}</option>)}
        </select>
        {error && <p className="text-xs text-red-500 mb-3">{error}</p>}
        <button onClick={confirm} disabled={!selected || busy}
          className="w-full bg-primary text-white text-sm font-medium rounded-md py-2 disabled:opacity-50">
          {busy ? 'Saving…' : 'Confirm'}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Wire it into the app shell**

Modify `src/residentRequests/ResidentRequestsApp.jsx`, replacing the last `return` with a profile-fetching step:

```jsx
import { useEffect, useState } from 'react';
import { supabase, AUTH_ENABLED } from '../supabaseClient';
import LoginScreen from './LoginScreen';
import ResidentPicker from './ResidentPicker';

export default function ResidentRequestsApp() {
  const [session, setSession] = useState(undefined);
  const [profile, setProfile] = useState(undefined); // undefined = not fetched, null = no row yet

  useEffect(() => {
    if (!AUTH_ENABLED) { setSession(null); return; }
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => setSession(newSession));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) return;
    supabase.from('profiles').select('resident_id').eq('id', session.user.id).maybeSingle()
      .then(({ data }) => setProfile(data));
  }, [session]);

  if (session === undefined) return null;
  if (!session) return <LoginScreen />;
  if (profile === undefined) return null;
  if (!profile || !profile.resident_id) {
    return <ResidentPicker session={session} onLinked={residentId => setProfile({ resident_id: residentId })} />;
  }

  // Task 7/8 fill this in.
  return <div className="min-h-screen bg-gray-50 p-4">Linked to resident {profile.resident_id}.</div>;
}
```

- [ ] **Step 4: Verify**

With a test resident already in the roster (add one via the main app's EM Residents tab if needed — never a real name, per this repo's public-PII rule), sign in at `/requests` with a matching-domain email, confirm the name picker shows the roster, pick a name, confirm "Linked to resident …" shows. Reload the page — confirm it skips straight past the picker this time (profile already linked). In the Supabase Table Editor, confirm the `profiles` row has the right `resident_id`.

- [ ] **Step 5: Commit**

```bash
git add src/residentRequests/blockLookup.js src/residentRequests/ResidentPicker.jsx src/residentRequests/ResidentRequestsApp.jsx
git commit -m "Add resident name-picker for first-login profile linking"
```

---

### Task 7: Request submission form (cutoff warning + optional reason)

**Files:**
- Create: `src/residentRequests/RequestForm.jsx`

**Interfaces:**
- Consumes: `findBlockForDate`, `weeksUntil`, `fetchBlocksForLookup` (Task 4); `supabase` (Task 1); `session.user.id`/`profile.resident_id` (Task 6).
- Produces: `onSubmitted()` callback prop, called after a successful insert — Task 8's `RequestList` re-fetches in response.

- [ ] **Step 1: Write the form**

Create `src/residentRequests/RequestForm.jsx`:

```jsx
import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { fetchBlocksForLookup, findBlockForDate, weeksUntil } from './blockLookup';

const CUTOFF_WEEKS = 8;

export default function RequestForm({ residentId, onSubmitted }) {
  const [blocks, setBlocks] = useState([]);
  const [dates, setDates] = useState(['']);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { fetchBlocksForLookup().then(setBlocks); }, []);

  const today = new Date().toISOString().slice(0, 10);
  const cutoffWarning = dates.some(d => {
    if (!d) return false;
    const block = findBlockForDate(d, blocks);
    return block && weeksUntil(today, block.startDate) < CUTOFF_WEEKS;
  });

  function updateDate(i, value) {
    setDates(prev => prev.map((d, idx) => idx === i ? value : d));
  }
  function addDateField() { setDates(prev => [...prev, '']); }
  function removeDateField(i) { setDates(prev => prev.filter((_, idx) => idx !== i)); }

  async function submit(e) {
    e.preventDefault();
    setError('');
    const cleaned = dates.filter(Boolean);
    if (cleaned.length === 0) { setError('Pick at least one date.'); return; }
    setBusy(true);
    const { error: insertError } = await supabase.from('day_off_requests').insert({
      resident_id: residentId,
      dates: cleaned,
      reason: reason.trim() || null,
    });
    setBusy(false);
    if (insertError) { setError(insertError.message); return; }
    setDates(['']);
    setReason('');
    onSubmitted();
  }

  return (
    <form onSubmit={submit} className="bg-white border border-gray-200 rounded-lg p-4 mb-4">
      <p className="font-display text-sm font-semibold text-gray-800 mb-3">Request a day off</p>
      {dates.map((d, i) => (
        <div key={i} className="flex items-center gap-2 mb-2">
          <input type="date" value={d} onChange={e => updateDate(i, e.target.value)} className="input-field" />
          {dates.length > 1 && (
            <button type="button" onClick={() => removeDateField(i)} className="text-xs text-gray-400 hover:text-red-500">Remove</button>
          )}
        </div>
      ))}
      <button type="button" onClick={addDateField} className="text-xs text-primary font-medium mb-3">+ Add another date</button>
      <label className="block text-xs font-medium text-gray-700 mb-1">Reason (optional)</label>
      <textarea value={reason} onChange={e => setReason(e.target.value)} rows={2}
        className="input-field w-full mb-3" placeholder="Optional — let the chief know why, if you'd like" />
      {cutoffWarning && (
        <p className="text-xs text-amber-600 mb-3">
          Heads up — one or more of these dates fall within {CUTOFF_WEEKS} weeks of that block's start.
          You can still submit; the chief may just have less flexibility to accommodate it.
        </p>
      )}
      {error && <p className="text-xs text-red-500 mb-3">{error}</p>}
      <button type="submit" disabled={busy}
        className="bg-primary text-white text-sm font-medium rounded-md px-4 py-2 disabled:opacity-50">
        {busy ? 'Submitting…' : 'Submit request'}
      </button>
    </form>
  );
}
```

- [ ] **Step 2: Wire it into the app shell**

Modify `src/residentRequests/ResidentRequestsApp.jsx`'s final `return`:

```jsx
  return (
    <div className="min-h-screen bg-gray-50 p-4 max-w-lg mx-auto">
      <RequestForm residentId={profile.resident_id} onSubmitted={() => setRefreshKey(k => k + 1)} />
    </div>
  );
```

Add `const [refreshKey, setRefreshKey] = useState(0);` alongside the other `useState` calls, and `import RequestForm from './RequestForm';` at the top (`refreshKey` is consumed by Task 8's `RequestList`).

- [ ] **Step 3: Verify**

At `/requests`, signed in and linked, add a test block via the main app (`Home` tab → set a start date a few weeks out) so `fetchBlocksForLookup` has something to match against, then submit a request with a date inside that block: (a) with a date <8 weeks from that block's start — confirm the amber warning shows and submission still succeeds; (b) with a date ≥8 weeks out — confirm no warning. In the Supabase Table Editor, confirm a new `day_off_requests` row appears with `status='pending'` and the right `resident_id`/`dates`/`reason`.

- [ ] **Step 4: Commit**

```bash
git add src/residentRequests/RequestForm.jsx src/residentRequests/ResidentRequestsApp.jsx
git commit -m "Add day-off request submission form with 8-week cutoff warning"
```

---

### Task 8: Resident's own request list + cancel action

**Files:**
- Create: `src/residentRequests/RequestList.jsx`
- Modify: `src/residentRequests/ResidentRequestsApp.jsx`

**Interfaces:**
- Consumes: `findBlockForDate`, `fetchBlocksForLookup` (Task 4); `supabase` (Task 1); `residentId`, `refreshKey` props.
- Produces: nothing consumed by later tasks — this is the resident-facing app's final piece.

- [ ] **Step 1: Write the list**

Create `src/residentRequests/RequestList.jsx`:

```jsx
import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { fetchBlocksForLookup, findBlockForDate } from './blockLookup';

const STATUS_STYLE = {
  pending:   'bg-amber-100 text-amber-700',
  approved:  'bg-green-100 text-green-700',
  denied:    'bg-red-100 text-red-700',
  cancelled: 'bg-gray-100 text-gray-500',
};

export default function RequestList({ residentId, refreshKey }) {
  const [requests, setRequests] = useState([]);
  const [blocks, setBlocks] = useState([]);

  async function load() {
    const [{ data }, blockData] = await Promise.all([
      supabase.from('day_off_requests').select('*').eq('resident_id', residentId).order('submitted_at', { ascending: false }),
      fetchBlocksForLookup(),
    ]);
    setRequests(data || []);
    setBlocks(blockData);
  }

  useEffect(() => { load(); }, [residentId, refreshKey]);

  async function cancel(id) {
    await supabase.from('day_off_requests').update({ status: 'cancelled' }).eq('id', id);
    load();
  }

  function blockLabelFor(req) {
    const block = req.dates.length ? findBlockForDate(req.dates[0], blocks) : null;
    return block ? block.name : 'Not yet scheduled';
  }

  if (requests.length === 0) {
    return <p className="text-sm text-gray-400">No requests submitted yet.</p>;
  }

  return (
    <div className="space-y-2">
      {requests.map(req => (
        <div key={req.id} className="bg-white border border-gray-200 rounded-lg p-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-xs text-gray-400 mb-0.5">{blockLabelFor(req)}</p>
              <p className="text-sm font-medium text-gray-800">{req.dates.join(', ')}</p>
              {req.reason && <p className="text-xs text-gray-500 mt-1">"{req.reason}"</p>}
              {req.decision_note && <p className="text-xs text-gray-500 mt-1">Chief's note: "{req.decision_note}"</p>}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${STATUS_STYLE[req.status]}`}>{req.status}</span>
              {req.status === 'pending' && (
                <button onClick={() => cancel(req.id)} title="Withdraw request" className="text-gray-300 hover:text-red-500">
                  <X size={14} />
                </button>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Wire it into the app shell**

Modify `src/residentRequests/ResidentRequestsApp.jsx`'s final `return`:

```jsx
  return (
    <div className="min-h-screen bg-gray-50 p-4 max-w-lg mx-auto">
      <RequestForm residentId={profile.resident_id} onSubmitted={() => setRefreshKey(k => k + 1)} />
      <RequestList residentId={profile.resident_id} refreshKey={refreshKey} />
    </div>
  );
```

Add `import RequestList from './RequestList';` at the top.

- [ ] **Step 3: Verify**

At `/requests`, submit a request, confirm it appears in the list below as "pending" with an X button. Click the X, confirm it flips to "cancelled" and the X disappears. Manually flip a different request's `status` to `'denied'` and set `decision_note` in the Supabase Table Editor, reload the page, confirm the note shows.

- [ ] **Step 4: Commit**

```bash
git add src/residentRequests/RequestList.jsx src/residentRequests/ResidentRequestsApp.jsx
git commit -m "Add resident's own request list with cancel action"
```

---

### Task 9: Chief-side "Requests" tab — login gate + role check + navigation wiring

**Files:**
- Create: `src/RequestsTab.jsx`
- Modify: `src/ResidentScheduler.jsx`

**Interfaces:**
- Consumes: `supabase`, `AUTH_ENABLED` (Task 1); `<LoginScreen embedded title subtitle/>` (Task 5) — reused as-is rather than duplicating the magic-link-send form.
- Produces: `<RequestsTab/>` mounted at `tab === 'requests'`; internally tracks its own `session`/`role` (independent of the resident app — this is a different login surface in the chief's own browser).

- [ ] **Step 1: Write the tab's login/role gate**

Create `src/RequestsTab.jsx`:

```jsx
import { useEffect, useState } from 'react';
import { supabase, AUTH_ENABLED } from './supabaseClient';
import LoginScreen from './residentRequests/LoginScreen';

export default function RequestsTab({ emRoster, setEmRoster }) {
  const [session, setSession] = useState(undefined);
  const [role, setRole] = useState(undefined); // undefined = not fetched, null = no profile row

  useEffect(() => {
    if (!AUTH_ENABLED) { setSession(null); return; }
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => setSession(newSession));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) return;
    supabase.from('profiles').select('role').eq('id', session.user.id).maybeSingle()
      .then(({ data }) => setRole(data ? data.role : null));
    // A first-time chief login has no profile row yet — create one (defaults to role='resident';
    // an admin flips it to 'chief' by hand in the Supabase table editor, same one-time bootstrap
    // documented in the day_off_requests.sql schema comment).
    supabase.from('profiles').upsert({ id: session.user.id, email: session.user.email }, { onConflict: 'id', ignoreDuplicates: true }).then(() => {});
  }, [session]);

  if (!AUTH_ENABLED) {
    return <p className="text-sm text-gray-400 p-4">Day-off requests aren't configured yet — set VITE_ALLOWED_EMAIL_DOMAIN.</p>;
  }

  if (session === undefined) return null;
  if (!session) {
    return (
      <div className="p-4">
        <LoginScreen embedded title="Chief Sign-In" subtitle="Sign in to review day-off requests." />
      </div>
    );
  }
  if (role === undefined) return null;
  if (role !== 'chief') {
    return <p className="text-sm text-gray-400 p-4">Your account isn't set up for chief access yet. Contact the app admin.</p>;
  }

  // Task 10 fills this in: the actual approval queue.
  return <div className="p-4">Signed in as chief.</div>;
}
```

- [ ] **Step 2: Add the tab to TABS, the sidebar, and the tab-routing switch**

Modify `src/ResidentScheduler.jsx`. First, the `TABS` array (around line 6905), inserting a new entry — placed right after `'validation'` since it's a similarly operational, badge-carrying tab:

```js
const TABS = [
  { id: 'home',       label: 'Home',          icon: Home },
  { id: 'dashboard',  label: 'Dashboard',     icon: LayoutDashboard },
  { id: 'em',         label: 'EM Residents',  icon: Stethoscope },
  { id: 'offservice', label: 'Off-Service',   icon: Users },
  { id: 'matrix',     label: 'Shift Matrix',  icon: Table2 },
  { id: 'schedule',   label: 'Schedule',      icon: Calendar },
  { id: 'rules',      label: 'Scheduling Rules', icon: BookOpen },
  { id: 'validation', label: 'Violations',    icon: AlertTriangle },
  { id: 'requests',   label: 'Requests',      icon: Inbox },
  { id: 'settings',   label: 'Settings',      icon: SettingsIcon },
  { id: 'guide',      label: 'User Guide',    icon: HelpCircle },
];
```

Add `Inbox` to the existing `lucide-react` import list at the top of the file (line 5–11).

Then add the tab's render, next to the existing `tab==='validation'` line (~7401):

```jsx
          {tab==='requests' && <RequestsTab emRoster={emRoster} setEmRoster={setEmRoster}/>}
```

And add the import near the top of the file, alongside the other local imports:

```js
import RequestsTab from './RequestsTab';
```

- [ ] **Step 3: Verify**

Run `npm run dev`, open the main app, confirm a new "Requests" tab appears in the sidebar with an inbox icon. Click it — confirm it shows the chief's own magic-link login form. Sign in with a domain-matching email, confirm "Your account isn't set up for chief access yet" shows (since no profile has been manually flipped to `role='chief'` yet). In the Supabase Table Editor, find that `profiles` row and manually set `role` to `'chief'`, reload the tab, confirm it now shows "Signed in as chief."

- [ ] **Step 4: Commit**

```bash
git add src/RequestsTab.jsx src/ResidentScheduler.jsx
git commit -m "Add chief-facing Requests tab with login/role gate"
```

---

### Task 10: Chief approve/deny actions

**Files:**
- Modify: `src/RequestsTab.jsx`

**Interfaces:**
- Consumes: `emRoster`, `setEmRoster` (props from Task 9, sourced from `ResidentScheduler`'s root state).
- Produces: writes to `day_off_requests.status`/`decision_note`/`decided_at`/`decided_by`, and to the matching resident's `approvedDatesOff` in `emRoster` — the exact field `getEligibleShifts`/the generator/the grid already treat as a hard block, so no further engine changes are needed.

- [ ] **Step 1: Replace the "Signed in as chief" placeholder with the approval queue**

Modify `src/RequestsTab.jsx`, replacing the final `return` and adding the queue logic above it:

```jsx
  const [requests, setRequests] = useState([]);
  const [noteDraft, setNoteDraft] = useState({});

  async function loadRequests() {
    const { data } = await supabase.from('day_off_requests').select('*').order('submitted_at', { ascending: true });
    setRequests(data || []);
  }
  useEffect(() => { if (role === 'chief') loadRequests(); }, [role]);

  function residentName(residentId) {
    const r = emRoster.find(x => x.id === residentId);
    return r ? `${r.lastName}, ${r.firstName}` : residentId;
  }

  async function decide(req, status) {
    const note = noteDraft[req.id] || null;
    await supabase.from('day_off_requests').update({
      status, decision_note: note, decided_at: new Date().toISOString(), decided_by: session.user.id,
    }).eq('id', req.id);
    if (status === 'approved') {
      setEmRoster(prev => prev.map(r => r.id === req.resident_id
        ? { ...r, approvedDatesOff: Array.from(new Set([...(r.approvedDatesOff || []), ...req.dates])).sort() }
        : r));
    }
    loadRequests();
  }

  const pending = requests.filter(r => r.status === 'pending');
  const decided = requests.filter(r => r.status !== 'pending');

  return (
    <div className="p-4 space-y-4 max-w-2xl">
      <div>
        <p className="font-display text-sm font-semibold text-gray-800 mb-2">Pending ({pending.length})</p>
        {pending.length === 0 && <p className="text-sm text-gray-400">Nothing pending.</p>}
        <div className="space-y-2">
          {pending.map(req => (
            <div key={req.id} className="bg-white border border-gray-200 rounded-lg p-3">
              <p className="text-sm font-medium text-gray-800">{residentName(req.resident_id)}</p>
              <p className="text-xs text-gray-500">{req.dates.join(', ')}</p>
              {req.reason && <p className="text-xs text-gray-500 mt-1">"{req.reason}"</p>}
              <input type="text" placeholder="Optional note back to resident" value={noteDraft[req.id] || ''}
                onChange={e => setNoteDraft(prev => ({ ...prev, [req.id]: e.target.value }))}
                className="input-field w-full mt-2 text-xs" />
              <div className="flex gap-2 mt-2">
                <button onClick={() => decide(req, 'approved')} className="bg-green-600 text-white text-xs font-medium rounded-md px-3 py-1.5">Approve</button>
                <button onClick={() => decide(req, 'denied')} className="bg-red-600 text-white text-xs font-medium rounded-md px-3 py-1.5">Deny</button>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div>
        <p className="font-display text-sm font-semibold text-gray-800 mb-2">Decided</p>
        <div className="space-y-1">
          {decided.map(req => (
            <p key={req.id} className="text-xs text-gray-400">{residentName(req.resident_id)} · {req.dates.join(', ')} · {req.status}</p>
          ))}
        </div>
      </div>
    </div>
  );
```

(`useState`/`useEffect` are already imported at the top of this file from Task 9.)

- [ ] **Step 2: Verify**

As a resident, submit a test request at `/requests`. As the chief, open the Requests tab, confirm it shows under "Pending" with the resident's real name (not their id). Approve it — confirm it moves to "Decided," and check the main app's EM Residents tab / Schedule grid: the resident's `approvedDatesOff` now includes that date, and the Schedule grid marks it "Approved day off" (existing OFF marker) and blocks that cell from being assigned a shift. Submit a second request, deny it with a note — confirm the resident's `/requests` page shows the note (Task 8's `decision_note` rendering).

- [ ] **Step 3: Commit**

```bash
git add src/RequestsTab.jsx
git commit -m "Add chief approve/deny actions wired to approvedDatesOff"
```

---

### Task 11: Pending-request visual cue on the Schedule grid + sidebar badge

**Files:**
- Modify: `src/ResidentScheduler.jsx`

**Interfaces:**
- Consumes: `supabase`, `AUTH_ENABLED` (Task 1).
- Produces: extends `SidebarNav`'s props with `pendingRequestCount`; extends `ScheduleGrid`'s props with `pendingByResident` (a `Map<residentId, Set<dateStr>>`).

- [ ] **Step 1: Add a root-level pending-requests fetch**

Modify `src/ResidentScheduler.jsx`'s root `ResidentScheduler` component, adding new state and an effect near the existing `dbReady`/`dbStatus` state (~line 7043):

```js
  const [pendingRequests, setPendingRequests] = useState([]); // [{resident_id, dates}], chief-session-gated

  useEffect(() => {
    if (!AUTH_ENABLED) return;
    let active = true;
    async function refresh() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { if (active) setPendingRequests([]); return; }
      const { data } = await supabase.from('day_off_requests').select('resident_id, dates').eq('status', 'pending');
      if (active) setPendingRequests(data || []);
    }
    refresh();
    const { data: sub } = supabase.auth.onAuthStateChange(() => refresh());
    return () => { active = false; sub.subscription.unsubscribe(); };
  }, []);

  const pendingByResident = useMemo(() => {
    const m = new Map();
    for (const req of pendingRequests) {
      if (!m.has(req.resident_id)) m.set(req.resident_id, new Set());
      req.dates.forEach(d => m.get(req.resident_id).add(d));
    }
    return m;
  }, [pendingRequests]);
```

Add the import at the top of the file: `import { supabase, AUTH_ENABLED } from './supabaseClient';`

This fetch silently returns an empty list whenever the chief has no active Supabase session yet (they haven't visited/logged into the Requests tab this session) — RLS blocks the anonymous select, so `data` comes back `null`/`[]` rather than erroring; the UI simply shows no markers until they've signed in once.

- [ ] **Step 2: Pass the count to SidebarNav**

Modify the `<SidebarNav .../>` call (~line 7378) to add `pendingRequestCount={pendingRequests.length}`, and modify `SidebarNav`'s signature and the "Requests" tab's row rendering (~line 6940 and ~6968):

```jsx
function SidebarNav({ tab, setTab, tabOrder, setTabOrder, issueCounts, hasSchedule, emResidentCount, offServiceCount, pendingRequestCount }) {
```

Inside the `orderedTabs.map` render, alongside the existing `isValidation` badge block:

```jsx
              const isRequests = t.id === 'requests';
```

and, right after the existing `isValidation && clean && (...)` block:

```jsx
              {isRequests && pendingRequestCount > 0 && (
                <span className={`text-xs px-1.5 py-0.5 rounded-full tabular-nums font-mono ${active?'bg-white/20 text-white':'bg-amber-100 text-amber-700'}`}>
                  {pendingRequestCount}
                </span>
              )}
```

- [ ] **Step 3: Pass the lookup to ScheduleGrid and render the marker**

Modify the `<ScheduleGrid .../>` call (~line 7399) to add `pendingByResident={pendingByResident}`, and `ScheduleGrid`'s signature (~line 5429):

```jsx
function ScheduleGrid({ allResidents, block, updateBlock, eligOverrides, appSettings, dayRules, coverage, blocksHistory, showToast, pendingByResident }) {
```

Inside the per-cell render (~line 5773), add a new `isPendingRequest` alongside the existing `isApprovedOff`/`isJeopardy` lookups:

```js
                        const isPendingRequest = pendingByResident.get(res.id)?.has(ds) || false;
```

And add a new corner badge right after the existing jeopardy one (~line 5809):

```jsx
                            {isPendingRequest && <span className="absolute top-0 left-0 text-[9px] leading-none font-bold text-blue-600 bg-blue-100 rounded-br px-0.5 py-px z-10" title="Day-off request pending">R</span>}
```

- [ ] **Step 4: Verify**

As a resident, submit a new pending request for a specific date. As the chief (already signed into the Requests tab at least once this session, per Step 1's session-gating), open the Schedule tab — confirm a small blue "R" badge appears in the top-left corner of that resident's cell on that date, without blocking the cell from being clicked/assigned. Confirm the sidebar's "Requests" tab shows a matching count badge. Approve the request via the Requests tab, switch back to the Schedule tab — confirm the "R" badge is gone (no longer pending) and the cell now shows "OFF" instead.

- [ ] **Step 5: Commit**

```bash
git add src/ResidentScheduler.jsx
git commit -m "Show pending day-off requests on the schedule grid and sidebar badge"
```

---

### Task 12: Email notifications (Resend via Supabase Edge Function)

**Files:**
- Create: `supabase/functions/notify-request/index.ts`
- Create: `supabase/webhooks.sql`

**Interfaces:**
- Consumes: `day_off_requests` row payloads (from a Supabase Database Webhook, standard `{type, table, record, old_record}` shape).
- Produces: outbound emails via the Resend HTTP API. No JS interface — this task has no consumer inside the app; it's triggered entirely by Postgres.

- [ ] **Step 1: Write the Edge Function**

Create `supabase/functions/notify-request/index.ts`:

```ts
// Deploy with: supabase functions deploy notify-request
// Then set the secret once: supabase secrets set RESEND_API_KEY=re_xxx CHIEF_EMAIL=chief@youruh.edu
//
// Receives a Supabase Database Webhook payload (see webhooks.sql) on day_off_requests INSERT and
// UPDATE, and emails the relevant person via Resend. Fails soft — a Resend error is logged, not
// thrown, so a flaky email provider never blocks the underlying database write that triggered it
// (the webhook fires after the write commits).

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!;
const CHIEF_EMAIL = Deno.env.get('CHIEF_EMAIL')!;
const FROM_EMAIL = 'requests@resend.dev'; // replace with a verified sending domain once set up in Resend

async function sendEmail(to: string, subject: string, text: string) {
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM_EMAIL, to, subject, text }),
    });
  } catch (err) {
    console.error('Resend send failed:', err);
  }
}

Deno.serve(async (req) => {
  const payload = await req.json();
  const { type, table, record, old_record } = payload;
  if (table !== 'day_off_requests') return new Response('ignored', { status: 200 });

  if (type === 'INSERT' && record.status === 'pending') {
    await sendEmail(
      CHIEF_EMAIL,
      'New day-off request submitted',
      `A new day-off request needs review.\nDates: ${record.dates.join(', ')}\nReason: ${record.reason || '(none given)'}`
    );
  }

  if (type === 'UPDATE' && old_record.status === 'pending' && (record.status === 'approved' || record.status === 'denied')) {
    // The Edge Function doesn't have the resident's email directly on this row — look it up via
    // the profiles table (service-role key, bypasses RLS, since this runs server-side).
    const profileRes = await fetch(
      `${Deno.env.get('SUPABASE_URL')}/rest/v1/profiles?resident_id=eq.${record.resident_id}&select=email`,
      { headers: { apikey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}` } }
    );
    const profiles = await profileRes.json();
    const residentEmail = profiles?.[0]?.email;
    if (residentEmail) {
      await sendEmail(
        residentEmail,
        `Your day-off request was ${record.status}`,
        `Dates: ${record.dates.join(', ')}\n${record.decision_note ? `Note from the chief: ${record.decision_note}` : ''}`
      );
    }
  }

  return new Response('ok', { status: 200 });
});
```

- [ ] **Step 2: Write the webhook wiring reference**

Create `supabase/webhooks.sql`:

```sql
-- Database Webhooks aren't declarable via plain SQL in Supabase — wire this up once in the
-- dashboard: Database → Webhooks → Create a new hook
--   Name: notify-day-off-request
--   Table: day_off_requests
--   Events: Insert, Update
--   Type: Supabase Edge Function
--   Edge Function: notify-request
--
-- Before creating the hook, deploy the function and set its secrets (see the comment header in
-- supabase/functions/notify-request/index.ts) — SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are
-- already available to every Edge Function automatically; only RESEND_API_KEY and CHIEF_EMAIL
-- need to be set by hand.
```

- [ ] **Step 3: Verify**

Deploy the function (`supabase functions deploy notify-request`), set the three secrets, and create the webhook per the instructions above. Submit a test request as a resident, confirm the chief's inbox receives "New day-off request submitted." Approve or deny it as the chief, confirm the resident's inbox receives the decision email including any note.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/notify-request/index.ts supabase/webhooks.sql
git commit -m "Add Resend-based email notifications for day-off requests"
```

---

### Task 13: End-to-end verification pass

**Files:** none (verification only).

- [ ] **Step 1: Full resident flow**

At `/requests` on a fresh (unauthenticated) browser session: sign in with a domain-matching test email, confirm the magic link arrives and logs you in, pick a test resident's name, submit a request with two dates and a reason, confirm it shows as "pending" in the list, withdraw a second test request and confirm it flips to "cancelled."

- [ ] **Step 2: Full chief flow**

In the main app, open the Requests tab, sign in, confirm "not set up for chief access" shows until the `profiles.role` is manually flipped to `'chief'` in Supabase, then confirm the pending queue appears with the resident's real name. Approve one request (with a note), deny another (with a note). Confirm the Schedule grid reflects the approval as an "OFF" cell and the sidebar badge count drops accordingly.

- [ ] **Step 3: Cross-check security boundaries**

Attempt (via the browser console, using a second test resident's session) to `select` or `insert` a `day_off_requests` row for a *different* `resident_id` than the one linked to that session — confirm Postgres/RLS rejects it. Attempt a non-domain-matching email signup directly against the Supabase auth API — confirm the Auth Hook rejects it with the 403 configured in Task 3.

- [ ] **Step 4: Confirm the main app is unaffected**

Run through a normal chief workflow untouched by this feature — generate a schedule, export a CSV — and confirm nothing regressed (no new console errors, no changed behavior) on the parts of the app this plan didn't touch.
