// src/lib/parse.js
// Roster-text / Master-Matrix-date parsing helpers, extracted from ResidentScheduler.jsx's
// CONSTANTS and ROSTER IMPORT / MATRIX IMPORT sections. No React, no xlsx import (the caller
// still owns reading the workbook itself), no side effects at import time.

// NOTE: CATEGORIES/CAT_MAP/normalizeToken/DATE_RANGE_RE are not in the original extraction
// spec's name list, but matchCategory/parseRosterText/parseDateRangeInAY depend on them
// directly, and each is a zero-dependency leaf (plain data or a one-line pure function) — moving
// them here too avoids a circular import back into ResidentScheduler.jsx (which also needs
// CATEGORIES/CAT_MAP/normalizeToken/DATE_RANGE_RE for unrelated UI/matrix-import call sites and
// re-imports them from here for those).

// Residency-category tint/badge — a different axis from shift-area color (AREA_COLORS, in
// lib/shifts.js): this colors rows/badges by residency category+PGY, not by shift area. Only
// coincidentally shares some hues with AREA_COLORS; intentionally NOT folded into that map.
export const CATEGORIES = [
  { id: 'EM_HOME', label: 'EM – Home',        shortLabel: 'EM-H', pgyOptions: [1,2,3], persistent: true,  rowBg: 'bg-blue-50',    badge: 'bg-blue-700 text-white' },
  { id: 'EM_BAMC', label: 'EM – BAMC',        shortLabel: 'BAMC', pgyOptions: [1],     persistent: false, rowBg: 'bg-blue-50',    badge: 'bg-blue-400 text-black/80' },
  { id: 'PEDS',    label: 'Pediatrics',        shortLabel: 'PEDS', pgyOptions: [2,3],   persistent: false, rowBg: 'bg-green-50',   badge: 'bg-green-600 text-white' },
  { id: 'FM',      label: 'Family Medicine',   shortLabel: 'FM',   pgyOptions: [1,3],   persistent: false, rowBg: 'bg-yellow-50',  badge: 'bg-yellow-500 text-black/80' },
  { id: 'IM',      label: 'Internal Medicine', shortLabel: 'IM',   pgyOptions: [2],     persistent: false, rowBg: 'bg-orange-50',  badge: 'bg-orange-500 text-black/80' },
  { id: 'NEURO',   label: 'Neurology',         shortLabel: 'NEURO',pgyOptions: [1],     persistent: false, rowBg: 'bg-purple-50',  badge: 'bg-purple-400 text-black/80' },
  { id: 'ANES',    label: 'Anesthesiology',    shortLabel: 'ANES', pgyOptions: [1],     persistent: false, rowBg: 'bg-purple-50',  badge: 'bg-purple-600 text-white' },
  { id: 'PSYCH',   label: 'Psychiatry',        shortLabel: 'PSYCH',pgyOptions: [1],     persistent: false, rowBg: 'bg-amber-50',   badge: 'bg-amber-600 text-white' },
  { id: 'POD',     label: 'Podiatry',          shortLabel: 'POD',  pgyOptions: [1],     persistent: false, rowBg: 'bg-gray-50',    badge: 'bg-gray-500 text-white' },
];
export const CAT_MAP = Object.fromEntries(CATEGORIES.map(c => [c.id, c]));

// Recognized free-text spellings for each category, beyond its own id/label/shortLabel.
export const CATEGORY_SYNONYMS = {
  EM_HOME: ['em', 'emhome', 'emergencymedicine'],
  EM_BAMC: ['bamc', 'embamc'],
  PEDS:    ['peds', 'pediatrics', 'ped'],
  FM:      ['fm', 'familymedicine'],
  IM:      ['im', 'internalmedicine', 'intmed'],
  NEURO:   ['neuro', 'neurology'],
  ANES:    ['anes', 'anesthesia', 'anesthesiology'],
  PSYCH:   ['psych', 'psychiatry', 'psyc'],
  POD:     ['pod', 'podiatry'],
};
export function normalizeToken(s) { return String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, ''); }
export function matchCategory(raw) {
  const n = normalizeToken(raw);
  if (!n) return null;
  for (const c of CATEGORIES) {
    if (n === normalizeToken(c.id) || n === normalizeToken(c.label) || n === normalizeToken(c.shortLabel)) return c.id;
  }
  for (const [id, syns] of Object.entries(CATEGORY_SYNONYMS)) if (syns.includes(n)) return id;
  return null;
}

// Splits one CSV line honoring double-quoted fields (so `"Last, First"` survives comma-splitting).
export function splitCsvLine(line) {
  const out = []; let cur = '', inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i+1] === '"') { cur += '"'; i++; }
      else if (ch === '"') inQuotes = false;
      else cur += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ',') { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out.map(s => s.trim());
}

export function splitName(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  if (s.includes(',')) {
    const [last, first] = s.split(',').map(x => x.trim());
    if (!last || !first) return null;
    return { firstName: first, lastName: last };
  }
  const parts = s.split(/\s+/);
  if (parts.length < 2) return null;
  return { firstName: parts.slice(0, -1).join(' '), lastName: parts[parts.length - 1] };
}

// Parses pasted or uploaded roster text into resident rows. Only Name/Category/PGY are read —
// any Rotation/date columns present (as in the QGenda-style export this mirrors) are ignored.
// allowedCategoryIds restricts which categories this import target (EM Home vs Off-Service) accepts.
export function parseRosterText(text, allowedCategoryIds) {
  const lines = String(text ?? '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const ok = [], errors = [];
  if (!lines.length) return { ok, errors };

  const delim = lines[0].includes('\t') ? '\t' : ',';
  const split = line => delim === '\t' ? line.split('\t').map(s => s.trim()) : splitCsvLine(line);

  let startIdx = 0, nameIdx = 0, catIdx = 1, pgyIdx = 2;
  const first = split(lines[0]);
  if (/resident|name/i.test(first[0] || '') && first.some(c => /category|service/i.test(c))) {
    startIdx = 1;
    const li = first.map(c => c.toLowerCase());
    nameIdx = li.findIndex(c => /resident|name/.test(c));
    catIdx  = li.findIndex(c => /category|service/.test(c));
    pgyIdx  = li.findIndex(c => /pgy/.test(c));
    if (nameIdx < 0) nameIdx = 0; if (catIdx < 0) catIdx = 1; if (pgyIdx < 0) pgyIdx = 2;
  }

  for (let i = startIdx; i < lines.length; i++) {
    const lineNo = i + 1;
    let cols = split(lines[i]);
    let nI = nameIdx, cI = catIdx, pI = pgyIdx;

    // Unquoted comma-delimited "Last, First" splits the name's own comma into an extra
    // column (e.g. "Doe, Jane,EM - Home,1" -> 4 cols instead of 3). If the category
    // doesn't match where expected, retry once with the name and next column rejoined.
    if (delim === ',' && !matchCategory(cols[cI]) && cols.length > cI + 1 && matchCategory(cols[cI + 1])) {
      cols = [`${cols[nI]}, ${cols[nI + 1]}`, ...cols.slice(cI + 1)];
      cI = 1; pI = 2;
    }

    const name = splitName(cols[nI]);
    if (!name) { errors.push({ line: lineNo, raw: lines[i], reason: 'Expected a "Last, First" name' }); continue; }

    const category = matchCategory(cols[cI]);
    if (!category) { errors.push({ line: lineNo, raw: lines[i], reason: `Unrecognized category "${cols[cI] ?? ''}"` }); continue; }
    if (!allowedCategoryIds.includes(category)) {
      errors.push({ line: lineNo, raw: lines[i], reason: `"${CAT_MAP[category].label}" can't be imported here` });
      continue;
    }

    const pgyRaw = String(cols[pI] ?? '').trim();
    const pgyMatch = pgyRaw.match(/[0-9]/);
    const pgyOptions = CAT_MAP[category].pgyOptions;
    // A blank PGY cell is the common case for a category with only one possible PGY (e.g.
    // Podiatry — pgyOptions:[1]): a chief's roster paste often omits a redundant PGY column
    // for those specialties entirely, which used to hard-reject the row with no visible
    // indication why the resident "didn't populate." Default it instead — but only when the
    // cell is genuinely blank; an explicit-but-wrong value (e.g. "2" pasted for Podiatry)
    // still errors below exactly as before.
    const pgy = pgyMatch ? Number(pgyMatch[0]) : (!pgyRaw && pgyOptions.length === 1 ? pgyOptions[0] : null);
    if (!pgy || !pgyOptions.includes(pgy)) {
      errors.push({ line: lineNo, raw: lines[i], reason: `PGY "${cols[pI] ?? ''}" isn't valid for ${CAT_MAP[category].label} (allowed: ${pgyOptions.join(', ')})` });
      continue;
    }

    ok.push({ firstName: name.firstName, lastName: name.lastName, category, pgy });
  }

  return { ok, errors };
}

export const DATE_RANGE_RE = /(\d{1,2})\/(\d{1,2})\s*-\s*(\d{1,2})\/(\d{1,2})/;

// Sheet 2's rows aren't sequential (three independent month-grouped column tracks), so each
// range is dated independently via a Jul-cutoff — except the one case that cutoff gets
// backward: a range that itself straddles Jun->Jul (e.g. "6/29-7/26", right at the AY's
// start). Same-year ranges use the LATER month's half so that straddle lands on the
// earlier (AY-start) year instead of being misread as the AY's May/Jun tail.
export function parseDateRangeInAY(raw, ayStartYear) {
  const m = DATE_RANGE_RE.exec(String(raw ?? ''));
  if (!m) return null;
  const sm = Number(m[1]), sd = Number(m[2]), em = Number(m[3]), ed = Number(m[4]);
  const pad = n => String(n).padStart(2, '0');
  let startYear, endYear;
  if (em < sm) { // genuine wrap across the turn of the year (e.g. Dec 18 -> Jan 14)
    startYear = sm >= 7 ? ayStartYear : ayStartYear + 1;
    endYear = startYear + 1;
  } else {
    const year = em >= 7 ? ayStartYear : ayStartYear + 1;
    startYear = year; endYear = year;
  }
  return { start: `${startYear}-${pad(sm)}-${pad(sd)}`, end: `${endYear}-${pad(em)}-${pad(ed)}` };
}
