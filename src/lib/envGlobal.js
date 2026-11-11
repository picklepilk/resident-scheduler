// Build-time env globals injected through index.html (%VITE_...% tokens). Vite leaves the literal
// unresolved token string (not an empty string) when the env var is undefined for a build, which
// would otherwise make "is it configured" checks falsely truthy. Pure; no React, no app imports.
export const isUnresolvedToken = v => typeof v === 'string' && v.startsWith('%') && v.endsWith('%');

export const readGlobal = key => {
  const raw = (typeof globalThis !== 'undefined' && globalThis[key]) || '';
  return isUnresolvedToken(raw) ? '' : raw;
};
