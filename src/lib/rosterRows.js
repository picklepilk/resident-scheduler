// src/lib/rosterRows.js
// Parsing helpers for the full-year roster workbook's 'Off Service Residents' sheet: three
// side-by-side ID | Name | Dept | Dates groups, stacked month sections. Pure; no React.
import { CAT_MAP, DATE_RANGE_RE, matchCategory, normalizeToken, parseDateRangeInAY, splitName } from './parse.js';

// -> { category, scheduledByUs, reference, note }
//   reference: BAMC PA rows — shown for information, never scheduled by us.
//   note: free-text remark in the Dept column, not a department.
export function classifyRosterDept(raw) {
  const s = String(raw ?? '').trim();
  const out = { category: null, scheduledByUs: false, reference: false, note: false };
  if (!s) return out;
  if (s.length > 24 || s.split(/\s+/).length > 4) return { ...out, note: true };
  if (normalizeToken(s) === 'bamcpa') return { ...out, reference: true };
  const category = matchCategory(s);
  if (category) return { ...out, category, scheduledByUs: true };
  return out;
}

function titleCase(s) {
  return s.toLowerCase().replace(/(^|[\s\-'’.])([a-z])/g, (_, p, ch) => p + ch.toUpperCase());
}

// 'Last, First' | 'First Last' | 'FIRST LAST' -> { firstName, lastName } | null
export function splitRosterName(raw) {
  const s = String(raw ?? '').replace(/\*+\s*$/, '').replace(/\s+/g, ' ').trim();
  if (!s) return null;
  const name = splitName(s);
  if (!name) return null;
  const fix = (v) => (v === v.toUpperCase() && v !== v.toLowerCase() ? titleCase(v) : v);
  return { firstName: fix(name.firstName), lastName: fix(name.lastName) };
}

// -> { rotations:[{ firstName,lastName,category,pgy,start,end,scheduledByUs,externalId,dept }], warnings }
export function parseRosterRotationRows(rows, ayStartYear) {
  const rotations = [], warnings = [];
  let skippedNoName = 0;
  const list = Array.isArray(rows) ? rows : [];
  for (let r = 0; r < list.length; r++) {
    const row = list[r] || [];
    for (let c = 2; c < row.length; c++) {
      if (!DATE_RANGE_RE.test(String(row[c] ?? ''))) continue;
      const deptRaw = String(row[c - 1] ?? '').trim();
      const nameRaw = String(row[c - 2] ?? '').replace(/\*+\s*$/, '').trim();
      const idRaw = c >= 3 ? String(row[c - 3] ?? '').trim() : '';
      const externalId = /^\d+$/.test(idRaw) ? idRaw : null;
      const cls = classifyRosterDept(deptRaw);
      if (cls.note) continue;
      if (!nameRaw) { skippedNoName++; continue; }
      const name = splitRosterName(nameRaw);
      if (!name) { warnings.push(`Row ${r + 1}: couldn't parse name "${nameRaw}" — skipped`); continue; }
      const range = parseDateRangeInAY(row[c], ayStartYear);
      if (!range) continue;
      if (!cls.category && !cls.reference) warnings.push(`Row ${r + 1}: unrecognized department "${deptRaw}" for "${nameRaw}"`);
      let pgy = null;
      if (cls.category) {
        const opts = CAT_MAP[cls.category].pgyOptions;
        if (opts.length === 1) pgy = opts[0];
        else if (cls.category === 'FM') {
          pgy = 1;
          warnings.push(`PGY assumed 1 for ${name.firstName} ${name.lastName} (FM) — verify if actually PGY-3`);
        }
      }
      rotations.push({
        firstName: name.firstName, lastName: name.lastName, category: cls.category, pgy,
        start: range.start, end: range.end, scheduledByUs: cls.scheduledByUs, externalId, dept: deptRaw,
      });
    }
  }
  if (skippedNoName > 0) warnings.push(`${skippedNoName} placeholder row(s) with no resident name skipped`);
  return { rotations, warnings };
}
