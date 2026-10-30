# Security headers rollout

`netlify.toml`'s `[[headers]]` block for `/*` ships a `Content-Security-Policy-Report-Only`
(logs violations, blocks nothing) plus several headers that are already enforced
(`X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`,
`Strict-Transport-Security`). See the comment above that block for the audit this policy is
derived from (inline script, inline styles, blob: exports, supabase/solver origins, the Teams
framing question).

## 1. Check the Report-Only CSP on a deploy preview

1. Push this branch / open the PR so Netlify builds a deploy preview.
2. Open the preview URL in a browser, open DevTools **before** navigating so no early requests
   are missed, then load the app and click through the main flows: sign in, open each tab
   (Schedule/Dashboard/Rules/Settings), generate a schedule, and exercise every export (PDF,
   CSV, QGenda, .ics, JSON backup) plus Master Matrix import.
3. Console tab: CSP violations log as
   `[Report Only] Refused to ... because it violates the following Content Security Policy
   directive: ...`. Network tab: filter for `report-to`/`csp-report` if a report endpoint is
   ever added (none is configured yet — this policy only logs to the browser console, it
   doesn't POST reports anywhere).
4. Expect to see zero violations for a correct audit. Two in particular are *expected to be
   silent*, not worth chasing:
   - The inline `<script>` in `index.html` and the ~46 inline `style={{...}}` props are already
     covered by `'unsafe-inline'` in `script-src`/`style-src` (see the netlify.toml comment for
     why a hash isn't used here).
   - `blob:` URLs from PDF/CSV/.ics export and the raw-text log export are covered by
     `img-src ... blob:` / `worker-src ... blob:`.
5. If something unexpected DOES show up, it means the audit missed an origin or mechanism —
   fix the root cause (don't just widen the policy to make the message go away) and re-check.

## 2. Resolve the open decisions before enforcing

- **Solver origin**: `connect-src` currently allows `https://*.fly.dev` because no exact
  `VITE_SOLVER_URL` value is committed anywhere in this repo (it's a Netlify dashboard env var).
  Pull the real value from Netlify (Site settings → Environment variables) and narrow
  `connect-src` to that exact origin before enforcing.
- **Framing**: decided 2026-10-14 — the app is never embedded. `frame-ancestors 'none'` in the CSP
  plus `X-Frame-Options: DENY`, which is enforced immediately (it has no report-only mode).
- **Inline script `'unsafe-inline'`**: the one inline `<script>` in `index.html` sets
  `window.__SUPABASE_URL__`/`__SUPABASE_ANON__`/`__ALLOWED_EMAIL_DOMAIN__`/`__SOLVER_URL__` from
  `%VITE_*%` tokens that Netlify's HTML snippet-injection substitutes post-build — so its content
  (and any sha256 hash of it) differs per deploy context and changes whenever an env var is
  rotated. Two ways to drop `'unsafe-inline'` from `script-src` later:
  1. Accept it as a narrow, low-risk carve-out (it's a fixed, first-party config block, not
     user-influenced data) and move on.
  2. Refactor to build-time injection via `vite.config.js`'s `define` (the same pattern already
     used for `__APP_VERSION__`) instead of runtime HTML token substitution, which removes the
     inline `<script>` entirely and lets `script-src` be just `'self'`.
- **Inline styles `'unsafe-inline'`**: React's `style={{...}}` prop sets individual CSS
  properties on the DOM node, which the CSP spec treats the same as a `style="..."` attribute
  (no nonce/hash mechanism practically applies to ~46 dynamic call sites) — `style-src`
  realistically keeps `'unsafe-inline'` long-term unless those call sites move to Tailwind
  utility classes.

## 3. Flip to enforcing

Once a deploy preview shows zero unexpected Report-Only violations and the two decisions above
are resolved:

1. In `netlify.toml`, rename `Content-Security-Policy-Report-Only` to
   `Content-Security-Policy` (same value, update origins per the decisions above).
2. Redeploy a preview first, repeat the console check in step 1 — now violations actually BLOCK
   the resource, so re-verify every export path and the sign-in flow before merging to `master`
   (which auto-deploys to residentscheduling.netlify.app).
3. Keep `X-Content-Type-Options` / `Referrer-Policy` / `Permissions-Policy` /
   `Strict-Transport-Security` as-is — they were already enforced from the start and nothing
   about flipping the CSP line changes them.

## Status (2026-10-15): enforcing

The policy is now `Content-Security-Policy` (enforcing), with `connect-src` pinned to this
project's Supabase host and the live solver host, and `font-src 'self' data:`. Verified by
serving the built bundle and the dev server under the exact policy (generate, Grid CSV, ICS,
PDF matrix): the only violation found was Vite's inlined `data:` fonts, now allowed. If the
Supabase project or solver host changes, update `connect-src` in `netlify.toml` or those
requests will be blocked.

## "Run the optimizer on this computer" (2026-10-16)

Settings → Optimizer → "This computer" (see `solver-service/run-local.ps1`/`run-local.sh` and
`solver-service/README.md`'s "Run on your own computer" section) sends solve requests from the
deployed, HTTPS `residentscheduling.netlify.app` page to a solver running on the admin's own
machine at a fixed loopback address.

- **`connect-src` allows `http://127.0.0.1:8765` and `http://localhost:8765`** (both — the
  health-check probe and the solve call can resolve either depending on how the browser handles
  `localhost`). This is a plain, non-TLS `http://` origin inside an otherwise HTTPS-only policy —
  intentional: a loopback address is a "potentially trustworthy origin" per browsers' own mixed
  -content rules (same reasoning that lets `https://` pages talk to `http://localhost` dev
  servers), so Chrome/Firefox do not block this fetch as mixed content the way they would a real
  `http://` third-party host.
- **Chrome's Private Network Access (PNA) check** is the other half of this story, and it is
  *not* something this CSP line controls. A public HTTPS page fetching a private/loopback address
  triggers an extra CORS-preflight-level signal: the browser's preflight `OPTIONS` request carries
  `Access-Control-Request-Private-Network: true`, and Chrome requires the response to answer back
  `Access-Control-Allow-Private-Network: true` or it blocks the real request even once ordinary
  CORS has already passed. The local solver answers this itself (`solver-service/api/pna.py`,
  wired in `api/main.py` outside `CORSMiddleware` so it can rewrite the preflight response CORS
  already produced) — nothing in the app's own CSP/headers needs to change for PNA specifically.
  Firefox/Safari don't implement PNA as of this writing and ignore the extra header either way.
- **Auth stays off for this target, deliberately**: the local server runs with
  `SOLVER_AUTH_MODE=off` because it's bound to `127.0.0.1` only (see `run-local.ps1`'s header
  comment) — there is no real remote caller to authenticate against. The app's client code
  (`generateViaSolverOrLocal` in `src/ResidentScheduler.jsx`) also deliberately never sends the
  Supabase session JWT to the local target, even though doing so would be harmless (loopback-only)
  — simplest to just not hand a real token to a process on the same machine for no benefit.
- If the fixed local port (8765) ever changes, update both `run-local.ps1`/`run-local.sh`,
  `src/lib/solverClient.js`'s `LOCAL_SOLVER_URL`, and this `connect-src` line together.

## Owner's tailnet solver PCs (2026-10-28)

`VITE_EXTRA_SOLVER_TARGETS` (Netlify env, `name=url,name=url`, https only) adds named picker entries
("PicklePower", "PickleBook"). Setup: `solver-service/DEPLOY-PC.md`.

- **`connect-src` lists the two exact origins** `https://picklepower.tail424ec7.ts.net:8765` and
  `https://picklebook.tail424ec7.ts.net:8765`, matching how the Pi funnel origin was added (no
  `*.ts.net` wildcard: that would let injected script exfiltrate to any tailnet host). Adding or
  renaming a PC means editing `netlify.toml` and the env value together.
- **Visibility is not security.** An entry shows only for an admin viewer whose `/health` probe
  answers, and the hosts resolve only inside the owner's tailnet (`tailscale serve`, never
  `funnel`), so other devices never see them. The security boundary is server-side: the PC runs
  `SOLVER_AUTH_MODE=supabase` + `SOLVER_ALLOWED_EMAILS` (set only in the PC's gitignored
  `.env.remote`) + `SOLVER_CORS_ORIGINS`. No email address appears in the repo or bundle.
- Chrome may show a one-time local-network permission prompt: tailnet addresses (100.64/10) count
  as a private network; the solver already answers PNA preflights (`api/pna.py`).
