// Shared-workstation hygiene: which localStorage keys an admin sign-out should wipe, so the next
// person to sit down at the same browser doesn't inherit the previous admin's roster/schedule/etc.
//
// Only matters when cloud sync is configured (SUPABASE_ENABLED/AUTH_ENABLED) — with no cloud,
// localStorage IS the only copy of the data, and sign-out must never touch it (see CLAUDE.md's
// cloud-sync section and the call site in ResidentScheduler.jsx, which gates this on both flags
// before ever calling keysToClearOnSignOut).
//
// Preserved: device-local preferences, not account data — the same three keys CLAUDE.md's
// "Persistence" section calls out as deliberately excluded from LS_BACKUP_KEYS/syncBindings for
// this exact reason (res_demo_mode is the fourth key in that list, but it is NOT preserved here —
// see below).
export const SIGN_OUT_PRESERVE_KEYS = ['res_dark_mode', 'res_ui_prefs', 'res_whats_new_seen'];

// Clears every res_* key (both the nine LS_BACKUP_KEYS and their res_demo_* demo-sandbox mirrors)
// except the device-local prefs above. res_demo_mode is deliberately CLEARED, not preserved: unlike
// the other three, it isn't a per-viewer display preference — it's "was this device mid-demo" state
// tied to demo data that sign-out is wiping anyway. Leaving it 'true' would drop the next sign-in
// straight into a demo sandbox that no longer has any backing data.
export function keysToClearOnSignOut(allKeys) {
  return allKeys.filter(k => k.startsWith('res_') && !SIGN_OUT_PRESERVE_KEYS.includes(k));
}
