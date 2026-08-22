// src/lib/nameMatch.js
// Tolerant roster name matching, shared by every importer that has to reconcile a name typed by
// someone else against this app's own roster. Pure — no React, no ResidentScheduler.jsx import
// (lib module rule, see CLAUDE.md).
//
// Extracted verbatim from ImportVacationModal's private helpers (stripVacationNameSuffix /
// vacTokenSet / vacTokensIntersect / matchVacationRoster) when the QGenda "Grid By Staff"
// importer needed the same logic. The alternative — a second matcher living next to the second
// importer — is exactly how two call sites silently drift on what counts as the same person.
// Behaviour is unchanged from the vacation importer's original; only the names are neutral now.
import { normalizeToken } from './parse.js';

// Drops one trailing parenthetical qualifier: "Alvarez, Marcus (ECFMG)" -> "Alvarez, Marcus".
// Anchored to the END on purpose — a parenthetical in the middle of a name is not a qualifier.
export function stripNameSuffix(raw) {
  return String(raw ?? '').replace(/\s*\([^)]*\)\s*$/, '').trim();
}

export function nameTokenSet(str) {
  return new Set(String(str ?? '').trim().split(/\s+/).map(normalizeToken).filter(Boolean));
}

export function tokensIntersect(a, b) {
  for (const x of a) if (b.has(x)) return true;
  return false;
}

// Tolerant match: last-name TOKEN SETS intersect AND first-name TOKEN SETS intersect — handles
// "Alvarez, Marcus Elliot" (file) vs roster "Alvarez, Marcus" (extra middle name), "Okonkwo
// Bright, Niva" (file) vs roster "Bright, Niva" (extra last-name token), etc.
//
// Returns EVERY roster resident that matches. Callers must treat a length > 1 result as ambiguous
// and refuse to guess — an importer that silently picks the first match writes someone else's
// vacation, jeopardy, or shifts onto the wrong resident, and nothing downstream can detect it.
export function matchRosterByName(firstName, lastName, roster) {
  const lastTokens = nameTokenSet(lastName);
  const firstTokens = nameTokenSet(firstName);
  return (roster || []).filter(r =>
    tokensIntersect(lastTokens, nameTokenSet(r.lastName)) &&
    tokensIntersect(firstTokens, nameTokenSet(r.firstName)));
}
