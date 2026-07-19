import { createClient } from '@supabase/supabase-js';

// Mirrors the isUnresolvedToken guard in ResidentScheduler.jsx's SUPABASE SYNC section — Vite's
// %VITE_...% HTML token substitution leaves the literal unresolved token string in place (not an
// empty string) when the env var isn't defined for a build, which would otherwise make every
// check below falsely truthy.
export const isUnresolvedToken = v => typeof v === 'string' && v.startsWith('%') && v.endsWith('%');
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
