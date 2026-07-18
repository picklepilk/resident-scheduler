# User Feedback + Admin Portal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an in-app bug/crash/idea feedback widget (with automatic crash capture) and a password-gated admin triage view to `resident-scheduler`, backed by a new shared-Supabase-project `feedback` table.

**Architecture:** A floating widget in the root `ResidentScheduler` component posts directly to Supabase PostgREST via the existing hand-rolled `sbFetch` client (anon key, insert-only RLS policy); a `window.onerror`/`unhandledrejection` listener in `main.jsx` auto-submits crash reports through the same helper. A new server-only `netlify/functions/feedback-admin.js` (service-role key, password header) is the only way to *read* feedback rows, surfaced as a new password-gated "Feedback" sidebar tab.

**Tech Stack:** React 19 + Vite 6 (existing), Supabase PostgREST via hand-rolled `fetch` (no `@supabase/supabase-js`), Netlify Functions (Node, ESM, no extra dependency — uses global `fetch`), `lucide-react` icons (existing).

## Global Constraints

- Every `feedback` insert/query — client-side `submitFeedback` and both `GET`/`PATCH` branches of `netlify/functions/feedback-admin.js` — must filter or set `app_name = 'resident-scheduler'`. The Supabase project is shared with the sibling `em-scheduler` app.
- Reuse the existing `sbFetch` helper and `SUPABASE_ENABLED` flag (`src/ResidentScheduler.jsx`, `// ─── SUPABASE SYNC ───` section) for all client-side Supabase calls. Do **not** add `@supabase/supabase-js` as a dependency.
- `SUPABASE_ENABLED` is computed from `window.__SUPABASE_URL__`/`__SUPABASE_ANON__`, populated by Vite's `%VITE_SUPABASE_URL%`/`%VITE_SUPABASE_ANON_KEY%` HTML-token substitution in `index.html` — never read `import.meta.env.VITE_*` directly in this file.
- The feedback widget, the crash listener, and the "Feedback" sidebar tab must all no-op / stay hidden when `SUPABASE_ENABLED` is false — matches how `AutosaveIndicator`'s cloud states only appear when sync is configured.
- The `feedback` table's anon-role RLS grants `INSERT` only — no `SELECT`/`UPDATE`/`DELETE` for anon. The admin view goes exclusively through the Netlify Function's `SUPABASE_SERVICE_ROLE_KEY`, never the anon key. Because there is no anon `SELECT` policy, `sbFetch` calls that insert into `feedback` must pass `prefer: 'return=minimal'` (not the default `return=representation`) — Postgres RLS only returns an `INSERT ... RETURNING` row if the SELECT policies also allow reading it back, and there deliberately isn't one for anon.
- `FEEDBACK_ADMIN_PASSWORD` and `SUPABASE_SERVICE_ROLE_KEY` are server-only Netlify environment variables (set in the Netlify dashboard for this site, and locally in the gitignored `.env` only for `netlify dev` testing). They must **never** be prefixed `VITE_` and must never be routed through the `%VITE_*%` HTML-token mechanism — that mechanism inlines its values into the client-shipped `dist/index.html`.
- No test runner or lint config exists in this repo (confirmed: `package.json` scripts are only `dev`/`build`/`preview`, no `test`, no ESLint config). Every task's verification step is a concrete manual action: an exact command plus an exact expected result (browser UI action, `curl`, or a Supabase SQL editor query), never "add tests."
- `src/ResidentScheduler.jsx` is ~6,840 lines and growing; line numbers drift as earlier tasks in this plan insert code. Each task below cites the line numbers as read *before this plan's changes*. When executing tasks 2+ in order, re-locate the anchor by its quoted surrounding code/comment (e.g. grep for the `// ─── SUPABASE SYNC ───` or `// ─── MAIN APP ───` markers) rather than trusting the absolute numbers, exactly as `CLAUDE.md`'s own "Map of ResidentScheduler.jsx" section instructs.
- This repo keeps no `supabase/migrations` folder (same as `res_state`). The `feedback` table's schema is documented as a comment directly above the code that depends on it (mirroring `res_state`'s own schema comment in the `SUPABASE SYNC` section), not as a separate SQL file — apply it by hand in the Supabase SQL editor.
- This is a public repo — the feedback feature must not introduce any real user/resident PII into committed code (it doesn't; feedback rows are created only at runtime by app users, no seed data).

---

### Task 1: Feedback table schema, `submitFeedback` helper, and `app_version` plumbing

**Files:**
- Modify: `vite.config.js` (whole file, 7 lines)
- Modify: `src/ResidentScheduler.jsx:6303-6382` (insert new code after `sbDeleteState`, before the `// ─── SETTINGS TAB ───` comment on line 6383)
- Verify: Supabase SQL editor (schema) + `curl` against the Supabase REST API (insert policy) + `npm run build` + `grep` on the built bundle (app_version)

**Interfaces:**
- Consumes: existing `sbFetch`, `SUPABASE_URL`, `SUPABASE_ANON`, `SUPABASE_ENABLED` (all already defined in the `SUPABASE SYNC` section, `src/ResidentScheduler.jsx:6303-6317`)
- Produces: `export const SUPABASE_ENABLED` (promoted from an internal `const` to a named export), `export const submitFeedback({ type, message, contact, page, meta })` — both consumed by Task 2 (widget), Task 3 (crash capture), and Task 5 (admin tab's type badges reuse the same `type` values). `__APP_VERSION__` — a Vite `define`d global string, consumed only inside `submitFeedback`.

- [ ] **Step 1: Add `__APP_VERSION__` to `vite.config.js`**

Read the current file first (already confirmed — 7 lines, no `define` block). Replace its full contents:

```js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Injects the current package.json version as a compile-time global, so submitFeedback()
// can attach it to every feedback row without a separate VITE_APP_VERSION env var to keep
// in sync by hand.
const pkg = JSON.parse(readFileSync(fileURLToPath(new URL('./package.json', import.meta.url)), 'utf-8'));

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
});
```

- [ ] **Step 2: Run the `feedback` table SQL in the Supabase SQL editor**

Open the Supabase project shared with `em-scheduler` (same project `resident-scheduler`'s `VITE_SUPABASE_URL` points to — see `.env`), open the SQL editor, and run:

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

-- No select/update/delete policy for anon — deliberately NOT the wide-open posture res_state
-- uses. The admin view goes through the Netlify Function's service-role key instead (see
-- netlify/functions/feedback-admin.js, Task 4), never the anon key.
```

Expected: "Success. No rows returned." Confirm the table exists by running `select * from feedback;` in the same SQL editor — expect an empty result set with the 10 columns above.

- [ ] **Step 3: Add the schema comment + `submitFeedback` to `src/ResidentScheduler.jsx`**

Insert this new block immediately after line 6381 (`await sbFetch(...)` inside `sbDeleteState`, i.e. right after `sbDeleteState`'s closing `};`) and before the blank line + `// ─── SETTINGS TAB ───` comment currently on line 6383:

```js

// ─── FEEDBACK ─────────────────────────────────────────────────────────────────
// A brand-new table, structurally unrelated to the single-row res_state document — it needs
// many independent rows (one per report), so it deliberately does NOT reuse res_state's sync
// machinery (sbFetch is reused as the transport, but not syncBindings/LS_BACKUP_KEYS/the
// debounced-save effect). Schema (run once in the same shared Supabase project's SQL editor —
// see docs/superpowers/plans/2026-07-18-user-feedback-plan.md Task 1 for the full statement):
//   create table feedback (
//     id uuid primary key default gen_random_uuid(), created_at timestamptz not null default now(),
//     app_name text not null default 'resident-scheduler',
//     type text not null check (type in ('bug','crash','idea')), message text not null,
//     contact text, page text, user_agent text, app_version text,
//     status text not null default 'new' check (status in ('new','reviewed','resolved')), meta jsonb
//   );
//   alter table feedback enable row level security;
//   create policy "anyone can submit feedback" on feedback for insert with check (true);
// No select/update/delete policy for anon — the admin view (see netlify/functions/
// feedback-admin.js) goes through a service-role key instead. Every insert hardcodes
// app_name: 'resident-scheduler' so a future em-scheduler feedback feature on the same
// project/table can't collide with this app's rows.
//
// Insert-only via the anon key. `prefer: 'return=minimal'` is required (not sbFetch's default
// return=representation) — Postgres RLS only returns an INSERT...RETURNING row if a SELECT
// policy also grants access to it, and there deliberately isn't one for anon; requesting a
// representation here would come back empty/confusing instead of erroring loudly.
export const submitFeedback = async ({ type, message, contact, page, meta }) => {
  if (!SUPABASE_ENABLED) return;
  await sbFetch('/feedback', {
    method: 'POST',
    prefer: 'return=minimal',
    body: {
      app_name: 'resident-scheduler',
      type,
      message,
      contact: contact || null,
      page: page || null,
      user_agent: (typeof navigator !== 'undefined' && navigator.userAgent) || null,
      app_version: typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : null,
      meta: meta || null,
    },
  });
};
```

Then change line 6317 from:

```js
const SUPABASE_ENABLED = Boolean(SUPABASE_URL && SUPABASE_ANON);
```

to:

```js
export const SUPABASE_ENABLED = Boolean(SUPABASE_URL && SUPABASE_ANON);
```

(This is the only existing line this task modifies in place — everything else above is a pure insertion. `SUPABASE_ENABLED` needs to be an export because Task 3 imports it into `main.jsx` for the crash-capture no-op check.)

- [ ] **Step 4: Verify the insert policy directly with `curl` (no UI needed yet)**

Get `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` from your local `.env` (copied from `.env.example` per its instructions), then run (bash):

```bash
source .env 2>/dev/null || export $(grep -v '^#' .env | xargs)
curl -i -X POST "$VITE_SUPABASE_URL/rest/v1/feedback" \
  -H "apikey: $VITE_SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $VITE_SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=minimal" \
  -d '{"app_name":"resident-scheduler","type":"bug","message":"schema smoke test"}'
```

Expected: `HTTP/2 201` with an empty body (matches `return=minimal`). Then in the Supabase SQL editor run `select id, app_name, type, message, status from feedback where message = 'schema smoke test';` — expect exactly one row with `app_name = 'resident-scheduler'`, `status = 'new'`. Delete it afterward: `delete from feedback where message = 'schema smoke test';`.

- [ ] **Step 5: Verify `__APP_VERSION__` is inlined at build time**

```bash
npm run build
grep -r "0.1.0" dist/assets/*.js
```

Expected: at least one match (the literal version string from `package.json`, inlined by Vite's `define` wherever `__APP_VERSION__` appears in the bundled code — confirms Step 1 wired correctly ahead of Task 2 actually calling `submitFeedback`).

- [ ] **Step 6: Commit**

```bash
git add vite.config.js src/ResidentScheduler.jsx
git commit -m "Add feedback table schema doc, submitFeedback helper, and app_version define"
```

---

### Task 2: Floating feedback widget (button + modal)

**Files:**
- Modify: `src/ResidentScheduler.jsx:5-11` (lucide-react icon imports)
- Modify: `src/ResidentScheduler.jsx:6901-6903` (new `FeedbackWidget` component, inserted between the end of `UserGuideTab` and the `// ─── MAIN APP ───` comment)
- Modify: `src/ResidentScheduler.jsx:7488` (render `<FeedbackWidget>` in the root's JSX, just before `<Toast>`)
- Verify: `npm run dev` + manual click-through + Supabase Table Editor

**Interfaces:**
- Consumes: `submitFeedback`, `SUPABASE_ENABLED` (Task 1), `Modal` (existing UI primitive), `showToast` (existing root helper, already passed to every tab component the same way)
- Produces: `FeedbackWidget({ page, showToast })` component, rendered by the root

- [ ] **Step 1: Add new icons to the lucide-react import**

Change lines 5-11 from:

```js
import {
  Plus, Trash2, AlertTriangle, Calendar, Users, Settings as SettingsIcon,
  X, ChevronDown, Download, Info, RefreshCw, CheckCircle, AlertCircle,
  Home, Archive, Save, ChevronRight, Check, Table2, Activity,
  Stethoscope, ClipboardList, BookOpen, Shield, Edit2, LayoutDashboard,
  CalendarDays, AlertOctagon, HelpCircle, Upload, Wand2, GripVertical, ChevronUp, Sun, Moon,
} from 'lucide-react';
```

to:

```js
import {
  Plus, Trash2, AlertTriangle, Calendar, Users, Settings as SettingsIcon,
  X, ChevronDown, Download, Info, RefreshCw, CheckCircle, AlertCircle,
  Home, Archive, Save, ChevronRight, Check, Table2, Activity,
  Stethoscope, ClipboardList, BookOpen, Shield, Edit2, LayoutDashboard,
  CalendarDays, AlertOctagon, HelpCircle, Upload, Wand2, GripVertical, ChevronUp, Sun, Moon,
  MessageSquare, Bug, Zap, Lightbulb, Lock,
} from 'lucide-react';
```

(`Lock` is unused until Task 5's admin tab — importing it now keeps this single import block edited exactly once across the plan.)

- [ ] **Step 2: Insert `FeedbackWidget` before `// ─── MAIN APP ───`**

Insert this new section between `UserGuideTab`'s closing `}` (line 6901) and the blank line + `// ─── MAIN APP ───` comment (line 6903):

```js

// ─── FEEDBACK WIDGET ────────────────────────────────────────────────────────
// Floating "Feedback" button, rendered by the root regardless of active tab. Hidden entirely
// when SUPABASE_ENABLED is false — matches how AutosaveIndicator's cloud states only appear
// when cloud sync is configured (see the root's own render call site).
const FEEDBACK_TYPES = [
  { id: 'bug',   label: 'Bug',   icon: Bug },
  { id: 'crash', label: 'Crash', icon: Zap },
  { id: 'idea',  label: 'Idea',  icon: Lightbulb },
];

function FeedbackWidget({ page, showToast }) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState('bug');
  const [message, setMessage] = useState('');
  const [contact, setContact] = useState('');
  const [submitting, setSubmitting] = useState(false);

  function reset() { setType('bug'); setMessage(''); setContact(''); }

  async function handleSubmit() {
    if (!message.trim()) { showToast('Please describe the issue or idea first', 'red'); return; }
    setSubmitting(true);
    try {
      await submitFeedback({ type, message: message.trim(), contact: contact.trim(), page });
      showToast('Thanks — feedback sent', 'green');
      reset();
      setOpen(false);
    } catch (e) {
      showToast(`Could not send feedback: ${e.message}`, 'red');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <button onClick={() => setOpen(true)} title="Report a bug, crash, or idea"
        className="no-print fixed bottom-5 right-5 z-40 flex items-center gap-1.5 px-3.5 py-2.5 rounded-full bg-primary text-white shadow-lg hover:bg-primary/90 transition-colors text-sm font-medium">
        <MessageSquare size={16}/> Feedback
      </button>
      {open && (
        <Modal title="Send Feedback" onClose={() => { setOpen(false); reset(); }}>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Type</label>
              <div className="flex gap-1.5">
                {FEEDBACK_TYPES.map(t => {
                  const Ic = t.icon;
                  return (
                    <button key={t.id} onClick={() => setType(t.id)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${type === t.id ? 'bg-primary text-white border-primary' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
                      <Ic size={13}/> {t.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Message <span className="text-red-500">*</span></label>
              <textarea value={message} onChange={e => setMessage(e.target.value)} rows={4}
                placeholder="What happened, or what would help?"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"/>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Contact (optional)</label>
              <input type="text" value={contact} onChange={e => setContact(e.target.value)}
                placeholder="Email, if you'd like a reply"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"/>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => { setOpen(false); reset(); }} className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-700">Cancel</button>
              <button onClick={handleSubmit} disabled={submitting}
                className="px-3 py-1.5 text-sm bg-primary hover:bg-primary/90 disabled:opacity-50 text-white rounded-lg font-medium">
                {submitting ? 'Sending…' : 'Send'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
```

- [ ] **Step 3: Render `FeedbackWidget` from the root component**

Change line 7488 from:

```js
      <Toast toast={toast} onClose={()=>setToast(null)}/>
```

to:

```js
      {SUPABASE_ENABLED && <FeedbackWidget page={tab} showToast={showToast}/>}
      <Toast toast={toast} onClose={()=>setToast(null)}/>
```

- [ ] **Step 4: Verify with cloud sync configured**

Run `npm run dev`, confirm your `.env` has `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` set (copy from `.env.example` if not), open `http://localhost:5173`. Expected: a rounded "Feedback" button fixed at the bottom-right of every tab. Click it → modal opens with Bug/Crash/Idea segmented control (Bug selected by default), a required Message textarea, and an optional Contact field. Type a message ("test from widget"), click Send. Expected: a green "Thanks — feedback sent" toast, modal closes. In the Supabase Table Editor, open `feedback`, filter `app_name = eq.resident-scheduler`, sort by `created_at` descending — expect the newest row to have `type = 'bug'`, `message = 'test from widget'`, `page` set to whichever tab was active (e.g. `'home'`), `user_agent` populated, `app_version = '0.1.0'`, `status = 'new'`.

- [ ] **Step 5: Verify hidden when cloud sync is not configured**

Temporarily rename `.env` to `.env.disabled` (or comment out both `VITE_SUPABASE_*` lines), restart `npm run dev`, reload the page. Expected: no "Feedback" button anywhere on screen. Restore `.env` afterward and restart `npm run dev`.

- [ ] **Step 6: Commit**

```bash
git add src/ResidentScheduler.jsx
git commit -m "Add floating feedback widget (button + modal)"
```

---

### Task 3: Crash auto-capture in `main.jsx`

**Files:**
- Modify: `src/main.jsx` (whole file, 19 lines)
- Verify: `npm run dev` + browser devtools console + Supabase Table Editor

**Interfaces:**
- Consumes: `submitFeedback`, `SUPABASE_ENABLED` (named exports from `src/ResidentScheduler.jsx`, added in Task 1)
- Produces: module-level `window.addEventListener('error', ...)` / `('unhandledrejection', ...)` listeners (side-effect only, no exports)

- [ ] **Step 1: Replace `src/main.jsx`**

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
import ResidentScheduler, { submitFeedback, SUPABASE_ENABLED } from './ResidentScheduler';

// ─── CRASH AUTO-CAPTURE ─────────────────────────────────────────────────────
// Installed once here (main.jsx runs exactly once per page load). No-ops entirely when
// SUPABASE_ENABLED is false. Deduped per session (same message + first stack line only ever
// reported once) and capped at 5 auto-reports per session so a tight error loop can't flood
// the feedback table.
const CRASH_SEEN_KEY = 'res_feedback_crash_seen';
const CRASH_COUNT_KEY = 'res_feedback_crash_count';
const CRASH_CAP = 5;

function crashKey(message, stack) {
  const firstStackLine = (stack || '').split('\n')[1]?.trim() || '';
  return `${message}::${firstStackLine}`;
}

function reportCrash(message, stack) {
  if (!SUPABASE_ENABLED) return;
  try {
    const seen = JSON.parse(sessionStorage.getItem(CRASH_SEEN_KEY) || '[]');
    const count = Number(sessionStorage.getItem(CRASH_COUNT_KEY) || '0');
    const key = crashKey(message, stack);
    if (seen.includes(key) || count >= CRASH_CAP) return;
    sessionStorage.setItem(CRASH_SEEN_KEY, JSON.stringify([...seen, key]));
    sessionStorage.setItem(CRASH_COUNT_KEY, String(count + 1));
    submitFeedback({
      type: 'crash',
      message: String(message || 'Unknown error').slice(0, 500),
      meta: { stack: stack || null },
    }).catch(() => {}); // a failed report must never itself throw an unhandledrejection
  } catch {
    // sessionStorage unavailable (e.g. private browsing) — skip crash capture entirely
  }
}

window.addEventListener('error', (e) => {
  reportCrash(e.message, e.error && e.error.stack);
});
window.addEventListener('unhandledrejection', (e) => {
  const reason = e.reason;
  const message = reason && reason.message ? reason.message : String(reason);
  const stack = reason && reason.stack ? reason.stack : '';
  reportCrash(message, stack);
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ResidentScheduler />
  </React.StrictMode>
);
```

- [ ] **Step 2: Verify a single crash is captured once**

Run `npm run dev` (with `.env` configured), open the app in the browser, open devtools console, and run:

```js
setTimeout(() => { throw new Error('feedback-plan crash test A'); }, 0);
```

Expected: the error appears in the console (uncaught), and within a few seconds a new row appears in Supabase's `feedback` table (Table Editor, filter `app_name = eq.resident-scheduler`) with `type = 'crash'`, `message = 'feedback-plan crash test A'`, `meta` containing a `stack` string. Run the exact same `setTimeout` line again in the console. Expected: **no second row** is created (same message + first stack line → deduped via `sessionStorage`).

- [ ] **Step 3: Verify the 5-per-session cap**

In the same devtools console, run 6 distinct errors:

```js
for (let i = 1; i <= 6; i++) {
  setTimeout(() => { throw new Error(`feedback-plan crash test cap-${i}`); }, i * 50);
}
```

Expected: exactly 5 new `type = 'crash'` rows appear in the `feedback` table for `cap-1` through `cap-5` (plus the earlier `crash test A` row from Step 2 already counted toward this session's cap, so if Step 2 was run in the same session only 4 of the 6 `cap-*` messages will land — reload the page first, which resets `sessionStorage`, to test the cap cleanly against a fresh count of 0). After reload, run the loop above: expect rows for `cap-1` through `cap-5` only; `cap-6` is silently skipped (verify via `select message from feedback where message like 'feedback-plan crash test cap-%';` in the SQL editor — expect exactly 5 rows).

Clean up test rows: `delete from feedback where message like 'feedback-plan crash test%';` in the Supabase SQL editor.

- [ ] **Step 4: Verify no-op when cloud sync is disabled**

Rename `.env` to `.env.disabled`, restart `npm run dev`, reload, run `setTimeout(() => { throw new Error('should not submit'); }, 0);` in the console. Expected: the error is thrown/logged normally by the browser but no network request to Supabase occurs (check the Network tab — no request to `*.supabase.co`). Restore `.env` and restart `npm run dev` afterward.

- [ ] **Step 5: Commit**

```bash
git add src/main.jsx
git commit -m "Add crash auto-capture (window error/unhandledrejection -> submitFeedback)"
```

---

### Task 4: `netlify/functions/feedback-admin.js` + `netlify.toml`

**Files:**
- Create: `netlify/functions/feedback-admin.js`
- Modify: `netlify.toml` (whole file, currently 8 lines)
- Verify: `netlify dev` (via `npx`) + `curl`

**Interfaces:**
- Consumes: `FEEDBACK_ADMIN_PASSWORD`, `SUPABASE_SERVICE_ROLE_KEY`, `VITE_SUPABASE_URL` (Netlify environment variables — the function reads `VITE_SUPABASE_URL` directly since Netlify Functions have runtime access to every site env var regardless of the `VITE_` prefix, which is purely a Vite client-bundle-inclusion convention, not a Netlify access restriction)
- Produces: `GET /api/feedback-admin/` → JSON array of feedback rows (filtered to `app_name = 'resident-scheduler'`, newest first); `PATCH /api/feedback-admin/` with body `{id, status}` → JSON of the updated row. Both consumed by Task 5's `FeedbackAdminTab`.

- [ ] **Step 1: Create `netlify/functions/feedback-admin.js`**

```js
// Password-gated read/update access to the `feedback` table, using the Supabase service-role
// key (server-only — never shipped to the client, unlike VITE_SUPABASE_ANON_KEY). This is the
// ONLY way feedback rows are ever read back; the client's sbFetch calls (submitFeedback) use
// the anon key and can only INSERT, per the table's RLS policy (see
// docs/superpowers/plans/2026-07-18-user-feedback-plan.md Task 1).
const APP_NAME = 'resident-scheduler';

export const handler = async (event) => {
  const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
  const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const ADMIN_PASSWORD = process.env.FEEDBACK_ADMIN_PASSWORD;

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !ADMIN_PASSWORD) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'feedback-admin function is not configured (missing SUPABASE_SERVICE_ROLE_KEY, FEEDBACK_ADMIN_PASSWORD, or VITE_SUPABASE_URL).' }),
    };
  }

  const suppliedPassword = event.headers['x-feedback-password'] || event.headers['X-Feedback-Password'];
  if (suppliedPassword !== ADMIN_PASSWORD) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  const sbHeaders = {
    apikey: SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'GET') {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/feedback?app_name=eq.${APP_NAME}&select=*&order=created_at.desc`,
      { headers: sbHeaders }
    );
    if (!res.ok) {
      const msg = await res.text().catch(() => res.statusText);
      return { statusCode: 502, body: JSON.stringify({ error: `Supabase error: ${msg}` }) };
    }
    const rows = await res.json();
    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(rows) };
  }

  if (event.httpMethod === 'PATCH') {
    let payload;
    try {
      payload = JSON.parse(event.body || '{}');
    } catch {
      return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) };
    }
    const { id, status } = payload;
    if (!id || !['new', 'reviewed', 'resolved'].includes(status)) {
      return { statusCode: 400, body: JSON.stringify({ error: 'id and a valid status (new|reviewed|resolved) are required' }) };
    }
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/feedback?id=eq.${id}&app_name=eq.${APP_NAME}`,
      {
        method: 'PATCH',
        headers: { ...sbHeaders, Prefer: 'return=representation' },
        body: JSON.stringify({ status }),
      }
    );
    if (!res.ok) {
      const msg = await res.text().catch(() => res.statusText);
      return { statusCode: 502, body: JSON.stringify({ error: `Supabase error: ${msg}` }) };
    }
    const rows = await res.json();
    if (!rows.length) {
      return { statusCode: 404, body: JSON.stringify({ error: 'Feedback row not found for this app' }) };
    }
    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(rows[0]) };
  }

  return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
};
```

- [ ] **Step 2: Update `netlify.toml`**

Replace the whole file (currently 8 lines: `[build]` + one `[[redirects]]` for the SPA catch-all) with:

```toml
[build]
  command   = "npm run build"
  publish   = "dist"

[functions]
  directory = "netlify/functions"

[[redirects]]
  from   = "/api/feedback-admin/*"
  to     = "/.netlify/functions/feedback-admin/:splat"
  status = 200

[[redirects]]
  from   = "/*"
  to     = "/index.html"
  status = 200
```

The `/api/feedback-admin/*` redirect is placed **before** the `/*` SPA catch-all — redirects are matched top-to-bottom, so this ordering is required or every `/api/feedback-admin/...` request would instead be served `index.html`. Note the trailing-slash convention: Netlify's `/*` wildcard only matches paths that start with `/api/feedback-admin/` (including nothing after the slash) — it does **not** match the bare path `/api/feedback-admin` with no trailing slash. Task 5's client code calls `/api/feedback-admin/` (with the trailing slash) for exactly this reason.

- [ ] **Step 3: Set local env vars for testing**

Add these two lines to your local `.env` (already gitignored — never commit real values):

```
FEEDBACK_ADMIN_PASSWORD=local-test-password
SUPABASE_SERVICE_ROLE_KEY=<the service_role key from Supabase Project Settings → API>
```

- [ ] **Step 4: Verify with `netlify dev`**

```bash
npx netlify-cli@17 dev
```

Expected: it starts a local dev server (typically `http://localhost:8888`) proxying both Vite and the Netlify Functions. In a separate terminal:

```bash
# No password header -> 401
curl -i http://localhost:8888/api/feedback-admin/

# Wrong password -> 401
curl -i http://localhost:8888/api/feedback-admin/ -H "x-feedback-password: wrong"

# Correct password -> 200 with a JSON array (may be empty if Task 1/2/3's test rows were cleaned up)
curl -i http://localhost:8888/api/feedback-admin/ -H "x-feedback-password: local-test-password"
```

Expected: the first two return `HTTP/1.1 401` with `{"error":"Unauthorized"}`; the third returns `HTTP/1.1 200` with a JSON array (every element, if any, has `"app_name":"resident-scheduler"`).

Insert one test row directly via SQL editor (`insert into feedback (app_name, type, message) values ('resident-scheduler', 'idea', 'admin-fn smoke test');`), then:

```bash
curl -s http://localhost:8888/api/feedback-admin/ -H "x-feedback-password: local-test-password" | grep "admin-fn smoke test"
```

Expected: the row appears in the output. Grab its `id` from that output and PATCH it:

```bash
curl -i -X PATCH http://localhost:8888/api/feedback-admin/ \
  -H "x-feedback-password: local-test-password" -H "Content-Type: application/json" \
  -d '{"id":"<the-id-from-above>","status":"reviewed"}'
```

Expected: `HTTP/1.1 200` with the updated row showing `"status":"reviewed"`. Clean up: `delete from feedback where message = 'admin-fn smoke test';` in the SQL editor.

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/feedback-admin.js netlify.toml
git commit -m "Add feedback-admin Netlify Function (password-gated, service-role reads)"
```

---

### Task 5: "Feedback" admin tab (TABS entry, SidebarNav wiring, triage UI)

**Files:**
- Modify: `src/ResidentScheduler.jsx:6905-6916` (`TABS` array — add the `feedback` entry)
- Modify: `src/ResidentScheduler.jsx:6940-6944` (`SidebarNav` — accept and apply a `cloudEnabled` prop)
- Modify: `src/ResidentScheduler.jsx:7378-7380` (root's `<SidebarNav>` call site — pass `cloudEnabled={SUPABASE_ENABLED}`)
- Modify: `src/ResidentScheduler.jsx:7401-7403` (root's tab-content switch — render `FeedbackAdminTab` for `tab==='feedback'`)
- Modify: `src/ResidentScheduler.jsx:6901-6903` (new `FeedbackAdminTab` component + its fetch helpers, inserted right after Task 2's `FeedbackWidget`, still before `// ─── MAIN APP ───`)
- Verify: `netlify dev` + manual click-through + Supabase SQL editor

**Interfaces:**
- Consumes: `GET`/`PATCH /api/feedback-admin/` (Task 4), `SUPABASE_ENABLED` (Task 1), `Lock`/`RefreshCw` icons (already imported — `Lock` added in Task 2 Step 1)
- Produces: `FeedbackAdminTab()` component, `fetchFeedbackAdmin(password)`, `updateFeedbackStatus(password, id, status)` helpers, new `TABS` entry `{ id: 'feedback', ... }`, `SidebarNav`'s new `cloudEnabled` prop

- [ ] **Step 1: Add the `feedback` entry to `TABS`**

Change lines 6905-6916 from:

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
  { id: 'settings',   label: 'Settings',      icon: SettingsIcon },
  { id: 'guide',      label: 'User Guide',    icon: HelpCircle },
];
```

to:

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
  { id: 'settings',   label: 'Settings',      icon: SettingsIcon },
  { id: 'feedback',   label: 'Feedback',      icon: MessageSquare },
  { id: 'guide',      label: 'User Guide',    icon: HelpCircle },
];
```

(`TABS` stays a fixed static array — same as every other tab — so `reconcileTabOrder`/backup-restore keep working unchanged; visibility is filtered in `SidebarNav`, not by conditionally omitting the entry from `TABS`.)

- [ ] **Step 2: Filter the Feedback tab out of `SidebarNav` when cloud sync is off**

Change the `SidebarNav` signature and `orderedTabs` memo (lines 6940-6943) from:

```js
function SidebarNav({ tab, setTab, tabOrder, setTabOrder, issueCounts, hasSchedule, emResidentCount, offServiceCount }) {
  const [dragTabId, setDragTabId] = useState(null);
  const [dragOverTabId, setDragOverTabId] = useState(null);
  const orderedTabs = useMemo(()=>reconcileTabOrder(tabOrder, TABS),[tabOrder]);
```

to:

```js
function SidebarNav({ tab, setTab, tabOrder, setTabOrder, issueCounts, hasSchedule, emResidentCount, offServiceCount, cloudEnabled }) {
  const [dragTabId, setDragTabId] = useState(null);
  const [dragOverTabId, setDragOverTabId] = useState(null);
  // The 'feedback' tab only ever renders when cloud sync is configured (it has nothing to
  // show otherwise — see the root's SUPABASE_ENABLED gate on FeedbackAdminTab).
  const orderedTabs = useMemo(
    () => reconcileTabOrder(tabOrder, TABS).filter(t => t.id !== 'feedback' || cloudEnabled),
    [tabOrder, cloudEnabled]
  );
```

- [ ] **Step 3: Pass `cloudEnabled` from the root's `<SidebarNav>` call site**

Change lines 7378-7380 from:

```js
        <SidebarNav tab={tab} setTab={setTab} tabOrder={tabOrder} setTabOrder={setTabOrder}
          issueCounts={issueCounts} hasSchedule={hasSchedule} emResidentCount={emRoster.length}
          offServiceCount={(block.offServiceResidents||[]).length}/>
```

to:

```js
        <SidebarNav tab={tab} setTab={setTab} tabOrder={tabOrder} setTabOrder={setTabOrder}
          issueCounts={issueCounts} hasSchedule={hasSchedule} emResidentCount={emRoster.length}
          offServiceCount={(block.offServiceResidents||[]).length} cloudEnabled={SUPABASE_ENABLED}/>
```

- [ ] **Step 4: Render `FeedbackAdminTab` in the tab-content switch**

Change lines 7401-7403 from:

```js
          {tab==='validation' && <ValidationTab issues={issues} block={block} appSettings={appSettings}/>}
          {tab==='settings' && <SettingsTab block={block} updateBlock={updateBlock} onBlockReset={blockReset} appSettings={appSettings} setAppSettings={setAppSettings} showToast={showToast}/>}
          {tab==='guide' && <UserGuideTab onNavigate={setTab}/>}
```

to:

```js
          {tab==='validation' && <ValidationTab issues={issues} block={block} appSettings={appSettings}/>}
          {tab==='settings' && <SettingsTab block={block} updateBlock={updateBlock} onBlockReset={blockReset} appSettings={appSettings} setAppSettings={setAppSettings} showToast={showToast}/>}
          {tab==='feedback' && SUPABASE_ENABLED && <FeedbackAdminTab/>}
          {tab==='guide' && <UserGuideTab onNavigate={setTab}/>}
```

- [ ] **Step 5: Add `FeedbackAdminTab` + its fetch helpers**

Insert this new section immediately after Task 2's `FeedbackWidget` component (still before `// ─── MAIN APP ───`):

```js

// ─── FEEDBACK ADMIN TAB ─────────────────────────────────────────────────────
// Password-gated triage view — goes through netlify/functions/feedback-admin.js (service-role
// key, server-only) rather than sbFetch/the anon key, since anon has no SELECT policy on
// `feedback`. Password is held in sessionStorage once accepted (cleared when the browser tab
// closes, matching the "Track A" shared-password posture used by the sibling Kitchen
// Inventory / ecowater-pricing-app feedback features).
const FEEDBACK_ADMIN_SS_KEY = 'res_feedback_admin_password';
const FEEDBACK_STATUS_OPTIONS = ['new', 'reviewed', 'resolved'];
const FEEDBACK_TYPE_BADGE = {
  bug:   'bg-red-100 text-red-700',
  crash: 'bg-orange-100 text-orange-700',
  idea:  'bg-emerald-100 text-emerald-700',
};

async function fetchFeedbackAdmin(password) {
  const res = await fetch('/api/feedback-admin/', { headers: { 'x-feedback-password': password } });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed (${res.status})`);
  }
  return res.json();
}

async function updateFeedbackStatus(password, id, status) {
  const res = await fetch('/api/feedback-admin/', {
    method: 'PATCH',
    headers: { 'x-feedback-password': password, 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, status }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed (${res.status})`);
  }
  return res.json();
}

function FeedbackAdminTab() {
  const [password, setPassword] = useState(() => sessionStorage.getItem(FEEDBACK_ADMIN_SS_KEY) || '');
  const [unlocked, setUnlocked] = useState(() => Boolean(sessionStorage.getItem(FEEDBACK_ADMIN_SS_KEY)));
  const [passwordInput, setPasswordInput] = useState('');
  const [authError, setAuthError] = useState('');
  const [rows, setRows] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [busyId, setBusyId] = useState(null);

  async function load(pw) {
    setLoadError('');
    try {
      const data = await fetchFeedbackAdmin(pw);
      setRows(data);
    } catch (e) {
      setLoadError(e.message);
    }
  }

  useEffect(() => {
    if (unlocked && password) load(password);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unlocked]);

  async function handleUnlock() {
    setAuthError('');
    try {
      await fetchFeedbackAdmin(passwordInput);
      sessionStorage.setItem(FEEDBACK_ADMIN_SS_KEY, passwordInput);
      setPassword(passwordInput);
      setUnlocked(true);
    } catch (e) {
      setAuthError(e.message || 'Incorrect password');
    }
  }

  async function handleStatusChange(id, status) {
    setBusyId(id);
    try {
      await updateFeedbackStatus(password, id, status);
      setRows(prev => prev.map(r => (r.id === id ? { ...r, status } : r)));
    } catch (e) {
      setLoadError(e.message);
    } finally {
      setBusyId(null);
    }
  }

  if (!unlocked) {
    return (
      <div className="max-w-sm mx-auto mt-16 space-y-3">
        <div className="flex items-center gap-2 text-gray-700"><Lock size={16}/><h2 className="font-semibold">Feedback Admin</h2></div>
        <p className="text-sm text-gray-500">Enter the admin password to view submitted feedback.</p>
        <input type="password" value={passwordInput} onChange={e => setPasswordInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleUnlock(); }}
          placeholder="Admin password"
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"/>
        {authError && <p className="text-xs text-red-500">{authError}</p>}
        <button onClick={handleUnlock} className="px-3 py-1.5 text-sm bg-primary hover:bg-primary/90 text-white rounded-lg font-medium">Unlock</button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-gray-800">Feedback ({rows ? rows.length : '…'})</h2>
        <button onClick={() => load(password)} className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 rounded-lg">
          <RefreshCw size={12}/> Refresh
        </button>
      </div>
      {loadError && <p className="text-sm text-red-500">{loadError}</p>}
      {rows && rows.length === 0 && <p className="text-sm text-gray-400">No feedback yet.</p>}
      <div className="space-y-2">
        {(rows || []).map(r => (
          <div key={r.id} className="bg-white border border-gray-200 rounded-lg p-3 space-y-1.5">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <span className={`px-2 py-0.5 rounded text-[11px] font-bold uppercase ${FEEDBACK_TYPE_BADGE[r.type] || 'bg-gray-100 text-gray-600'}`}>{r.type}</span>
                <span className="text-xs text-gray-400">{new Date(r.created_at).toLocaleString()}</span>
                {r.page && <span className="text-xs text-gray-400">· {r.page}</span>}
              </div>
              <select value={r.status} disabled={busyId === r.id}
                onChange={e => handleStatusChange(r.id, e.target.value)}
                className="text-xs border border-gray-300 rounded-md px-2 py-1">
                {FEEDBACK_STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <p className="text-sm text-gray-800 whitespace-pre-wrap">{r.message}</p>
            {r.contact && <p className="text-xs text-gray-500">Contact: {r.contact}</p>}
            {r.meta?.stack && <pre className="text-[10px] text-gray-400 bg-gray-50 rounded p-2 overflow-x-auto">{r.meta.stack}</pre>}
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Verify end-to-end via `netlify dev`**

Plain `npm run dev` does **not** proxy Netlify Functions, so `/api/feedback-admin/` would 404 under it — this tab must be tested under `netlify dev`:

```bash
npx netlify-cli@17 dev
```

With `.env` containing `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `FEEDBACK_ADMIN_PASSWORD=local-test-password`, and `SUPABASE_SERVICE_ROLE_KEY` (from Task 4), open the printed local URL (typically `http://localhost:8888`). Expected: a "Feedback" entry now appears in the sidebar (between Settings and User Guide). Click it → password prompt appears. Type an incorrect password, click Unlock → expect an inline red error message, still locked. Type `local-test-password`, click Unlock (or press Enter) → expect the list view, showing every feedback row created by earlier tasks' smoke tests (or "No feedback yet." if all were cleaned up). Use the widget (bottom-right Feedback button) to submit a fresh test row from another tab, click "Refresh" on the Feedback tab → the new row appears with a `status` dropdown defaulted to `new`. Change the dropdown to `reviewed`. Expected: the row updates in place with no page reload. Confirm in the Supabase SQL editor: `select status from feedback order by created_at desc limit 1;` → expect `reviewed`.

- [ ] **Step 7: Verify the tab is hidden when cloud sync is off**

Rename `.env` to `.env.disabled`, run `npm run dev` (plain Vite is fine here since we're only checking sidebar visibility), reload. Expected: no "Feedback" entry in the sidebar. Restore `.env` afterward.

- [ ] **Step 8: Commit**

```bash
git add src/ResidentScheduler.jsx
git commit -m "Add password-gated Feedback admin tab"
```

---

### Task 6: Document the two new server-only env vars

**Files:**
- Modify: `.env.example` (whole file, 7 lines)
- Modify: `CLAUDE.md:83-95` (append a note after the Cloud sync paragraph, before "## Running / building / deploying")
- Verify: manual read-through (no runtime behavior to check — this task is documentation only)

**Interfaces:**
- Consumes: nothing
- Produces: nothing consumed by other tasks — this is the last task in the plan

- [ ] **Step 1: Update `.env.example`**

Replace the whole file with:

```
# Cross-device cloud sync (optional — the app runs fine local-only without this).
# Copy this file to .env and fill in your Supabase project's own values
# (e.g. reused from the em-scheduler project's .env, since resident-scheduler
# shares that project — see CLAUDE.md's "Cloud sync" section).
VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key

# Feedback admin (Netlify Function only — see netlify/functions/feedback-admin.js).
# These two are SERVER-ONLY: unlike the VITE_SUPABASE_* pair above, they must never be
# prefixed VITE_ and are never read through index.html's %VITE_*% token substitution or
# shipped in the client bundle. Only needed locally for `netlify dev`; for a real deploy set
# both in the Netlify dashboard for this site (Site configuration -> Environment variables),
# not in this file.
FEEDBACK_ADMIN_PASSWORD=choose-a-shared-triage-password
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-from-supabase-project-settings-api
```

- [ ] **Step 2: Update `CLAUDE.md`**

Insert a new paragraph after line 84 (`` `res_dark_mode`) into the shared document.``) and before line 86 (`## Running / building / deploying`):

```markdown
- **User feedback** (`// ─── FEEDBACK ───` section, after the Supabase sync helpers; `// ─── FEEDBACK WIDGET ───`/`// ─── FEEDBACK ADMIN TAB ───` sections near `MAIN APP`): a floating bug/crash/idea widget (hidden when `SUPABASE_ENABLED` is false) posts to a separate `feedback` table in the same shared Supabase project via `submitFeedback()` — insert-only for the anon key (no `SELECT`/`UPDATE`/`DELETE` RLS policy for anon, unlike `res_state`'s wide-open posture). Every row carries `app_name: 'resident-scheduler'` since the table is shared with `em-scheduler`. `main.jsx` installs a `window.onerror`/`unhandledrejection` listener that auto-submits `type: 'crash'` reports through the same helper, deduped per session via `sessionStorage` and capped at 5/session. The only way to *read* feedback is the password-gated "Feedback" sidebar tab (also hidden when `SUPABASE_ENABLED` is false), which calls `netlify/functions/feedback-admin.js` — a server-only Netlify Function using the `SUPABASE_SERVICE_ROLE_KEY` env var to bypass RLS, gated by an `x-feedback-password` header checked against `FEEDBACK_ADMIN_PASSWORD`. Both of those are server-only Netlify environment variables (set in the Netlify dashboard for this site) — never `VITE_`-prefixed, never routed through the `%VITE_*%` HTML-token mechanism `index.html` uses for the client-exposed Supabase URL/anon key. See `.env.example` for the full list and `docs/superpowers/specs/2026-07-18-user-feedback-design.md` for the original design.
```

- [ ] **Step 3: Verify**

```bash
grep -n "FEEDBACK_ADMIN_PASSWORD" .env.example CLAUDE.md
grep -n "SUPABASE_SERVICE_ROLE_KEY" .env.example CLAUDE.md
```

Expected: both commands print at least one match in each file, confirming the two server-only env vars are documented in both places.

- [ ] **Step 4: Commit**

```bash
git add .env.example CLAUDE.md
git commit -m "Document FEEDBACK_ADMIN_PASSWORD and SUPABASE_SERVICE_ROLE_KEY as server-only Netlify env vars"
```
