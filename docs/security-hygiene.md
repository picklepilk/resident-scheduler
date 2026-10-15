# Security hygiene notes

## Shared-workstation admin sessions (2026-10-15)

Admin sign-out (and a 30-minute idle timeout, same path) now clears this device's `res_*`/
`res_demo_*` localStorage — see `src/lib/signOutCleanup.js` (`keysToClearOnSignOut`) and the
sign-out/idle wiring in `ResidentScheduler.jsx` (`requestSignOut`/`createIdleTimer`). Only runs
when cloud sync is configured; with no cloud, localStorage is the only copy of the data and is
never cleared.

## MFA — not yet implemented

Admin accounts are not required to use multi-factor auth. Supabase supports TOTP MFA natively
(`supabase.auth.mfa.enroll({ factorType: 'totp' })` to get a QR code, `challenge`/`verify` to
confirm, then gate the admin app on `supabase.auth.mfa.getAuthenticatorAssuranceLevel()` reaching
`aal2` — same pattern as Supabase's own MFA guide). Given this app's RLS already restricts
`res_state` to `is_admin()` sessions, requiring `aal2` for the admin role would need: (1) an
enroll/manage UI in Settings, (2) an RLS check or an app-level gate requiring `aal2` before
rendering `ResidentScheduler`, and (3) a decision on whether to also enforce it at the database
level (`auth.jwt()->>'aal'`) the way `admin_email_allowlist` already keys off `auth.jwt()`.
Deferred — track as a follow-up when there's time to also write the enrollment UI and test the
RLS gate end to end.
