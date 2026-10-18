// src/lib/ruleDates.js
// Chief-LOGGED dates for the "computed-date" scheduling rules (First Friday, Wellness Wednesday,
// Journal Club). Until 2026-10-18 these dates were derived from the calendar on every read, so
// rules with exceptions (or rules the program stopped using) could not be corrected. Now the date
// list is STORED per academic year and the rule's math is only a SUGGESTER: nothing is applied
// unless the chief logged it (or the one-time migration materialized what used to be derived).
// Absent list = no dates, exactly like holidays.
//
// Storage (inside ayData[AY], so it round-trips with backups/cloud like jcDates always has):
//   firstFriday:       ayData[AY].ruleDates.firstFriday          = ['YYYY-MM-DD', ...]
//   wellnessWednesday: ayData[AY].ruleDates.wellnessWednesday    = { '1': [...], '2': [...], '3': [...] }  (key = PGY)
//   journalClub:       ayData[AY].jcDates                        = [...]   (pre-existing field, kept)
// Everything read from storage is untrusted shape: validated here, never trusted by callers.
//
// Pure module: imports only sibling lib files (never ResidentScheduler.jsx).

import { parseDate, toDateStr, addDays, ayWindowFor, getAcademicYearFor } from './dates.js';
import { getFirstTuesdaysInRange } from './journalClub.js';

export const RULE_KEYS = { FIRST_FRIDAY: 'firstFriday', WELLNESS: 'wellnessWednesday', JOURNAL_CLUB: 'journalClub' };

export const RULE_LABELS = {
  firstFriday: 'First Friday',
  wellnessWednesday: 'Wellness Wednesday',
  journalClub: 'Journal Club',
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function cleanList(v) {
  if (!Array.isArray(v)) return null;
  return Array.from(new Set(v.filter(x => typeof x === 'string' && DATE_RE.test(x)))).sort();
}

// Logged dates for one rule (and, for wellnessWednesday, one PGY via `sub`). Always an array.
export function loggedDates(ruleKey, ayConf, sub) {
  if (!ayConf || typeof ayConf !== 'object') return [];
  if (ruleKey === RULE_KEYS.JOURNAL_CLUB) return cleanList(ayConf.jcDates) || [];
  const rd = ayConf.ruleDates;
  if (!rd || typeof rd !== 'object') return [];
  if (ruleKey === RULE_KEYS.WELLNESS) {
    const per = rd.wellnessWednesday;
    if (!per || typeof per !== 'object' || Array.isArray(per)) return [];
    return cleanList(per[String(sub)]) || [];
  }
  return cleanList(rd[ruleKey]) || [];
}

// True when a stored list exists at all (even empty) -- used by the migration.
export function hasStoredList(ruleKey, ayConf, sub) {
  if (!ayConf || typeof ayConf !== 'object') return false;
  if (ruleKey === RULE_KEYS.JOURNAL_CLUB) return cleanList(ayConf.jcDates) !== null;
  const rd = ayConf.ruleDates;
  if (!rd || typeof rd !== 'object') return false;
  if (ruleKey === RULE_KEYS.WELLNESS) {
    const per = rd.wellnessWednesday;
    return !!per && typeof per === 'object' && !Array.isArray(per) && cleanList(per[String(sub)]) !== null;
  }
  return cleanList(rd[ruleKey]) !== null;
}

// The single answer to "is dateStr a logged <rule> date" (`sub` = PGY for wellnessWednesday).
export function isLoggedDate(ruleKey, ayConf, dateStr, sub) {
  return loggedDates(ruleKey, ayConf, sub).includes(dateStr);
}

export function loggedDatesInRange(ruleKey, ayConf, startStr, endStr, sub) {
  if (!startStr || !endStr) return [];
  return loggedDates(ruleKey, ayConf, sub).filter(d => d >= startStr && d <= endStr);
}

// Returns a NEW ayConf with the list replaced (sorted, deduped, validated). Never mutates.
export function withLoggedDates(ayConf, ruleKey, dates, sub) {
  const list = cleanList(dates) || [];
  const base = ayConf && typeof ayConf === 'object' ? ayConf : {};
  if (ruleKey === RULE_KEYS.JOURNAL_CLUB) return { ...base, jcDates: list };
  const rd = base.ruleDates && typeof base.ruleDates === 'object' ? base.ruleDates : {};
  if (ruleKey === RULE_KEYS.WELLNESS) {
    const per = rd.wellnessWednesday && typeof rd.wellnessWednesday === 'object' && !Array.isArray(rd.wellnessWednesday)
      ? rd.wellnessWednesday : {};
    return { ...base, ruleDates: { ...rd, wellnessWednesday: { ...per, [String(sub)]: list } } };
  }
  return { ...base, ruleDates: { ...rd, [ruleKey]: list } };
}

// ── Suggesters (the old derivations; never applied implicitly) ────────────────────────────────

export function suggestFirstFridays(startStr, endStr) {
  if (!startStr || !endStr) return [];
  const result = [];
  const start = parseDate(startStr);
  const end = parseDate(endStr);
  let month = new Date(start.getFullYear(), start.getMonth(), 1);
  const lastMonth = new Date(end.getFullYear(), end.getMonth(), 1);
  while (month <= lastMonth) {
    const d = new Date(month);
    while (d.getDay() !== 5) d.setDate(d.getDate() + 1);
    if (d >= start && d <= end) result.push(toDateStr(d));
    month.setMonth(month.getMonth() + 1);
  }
  return result;
}

export function suggestFirstTuesdays(startStr, endStr) {
  return getFirstTuesdaysInRange(startStr, endStr);
}

// Nth `weekday` on/after startStr (block-relative; wellness Wednesday = weekday 3).
export function nthWeekdayOnOrAfter(startStr, weekday, ordinal) {
  if (!startStr || !Number.isFinite(ordinal)) return null;
  const start = parseDate(startStr);
  const delta = (weekday - start.getDay() + 7) % 7;
  return toDateStr(addDays(start, delta + (ordinal - 1) * 7));
}

// One suggestion per block start.
export function suggestWellnessWednesdays(blockStarts, ordinal) {
  const out = [];
  for (const s of blockStarts || []) {
    const d = nthWeekdayOnOrAfter(s, 3, ordinal);
    if (d) out.push(d);
  }
  return Array.from(new Set(out)).sort();
}

// Window of an AY as inclusive [start, lastDay].
export function ayInclusiveRange(ayString) {
  const win = ayWindowFor(ayString);
  if (!win) return null;
  return { start: win.start, end: toDateStr(addDays(parseDate(win.end), -1)) };
}

// ── One-time migration ─────────────────────────────────────────────────────────────────────────
// Materializes what USED to be derived into stored lists for every AY that has no stored list, so
// day-one scheduling is unchanged. AYs considered: every ayData key, every block's AY, and the AY
// of every extra date (resident JC presenting dates). Returns the SAME ayData object when nothing
// changed.
//   blocks:         [{startDate, endDate, academicYear?}] (current block + history snapshots)
//   ordinalsByPgy:  { 1: 1, 2: 2, 3: 3 }  wellness ordinal per PGY (from effective day rules);
//                   a PGY with no ordinal gets no wellness list.
export function materializeLegacyRuleDates({ ayData, blocks = [], ordinalsByPgy = {}, extraDates = [] }) {
  const src = ayData && typeof ayData === 'object' && !Array.isArray(ayData) ? ayData : {};
  const byAy = new Map(); // ay -> block starts
  const note = ay => { if (ay && !byAy.has(ay)) byAy.set(ay, []); };
  Object.keys(src).forEach(note);
  for (const b of blocks) {
    if (!b || typeof b.startDate !== 'string' || !DATE_RE.test(b.startDate)) continue;
    const ay = b.academicYear || getAcademicYearFor(b.startDate);
    note(ay);
    byAy.get(ay).push(b.startDate);
  }
  for (const d of extraDates) {
    if (typeof d === 'string' && DATE_RE.test(d)) note(getAcademicYearFor(d));
  }
  let changed = false;
  const next = { ...src };
  for (const [ay, starts] of byAy) {
    const range = ayInclusiveRange(ay);
    if (!range) continue;
    let conf = src[ay] && typeof src[ay] === 'object' ? src[ay] : {};
    const orig = conf;
    if (!hasStoredList(RULE_KEYS.FIRST_FRIDAY, conf)) {
      conf = withLoggedDates(conf, RULE_KEYS.FIRST_FRIDAY, suggestFirstFridays(range.start, range.end));
    }
    if (!hasStoredList(RULE_KEYS.JOURNAL_CLUB, conf)) {
      conf = withLoggedDates(conf, RULE_KEYS.JOURNAL_CLUB, suggestFirstTuesdays(range.start, range.end));
    }
    for (const pgy of [1, 2, 3]) {
      const ord = ordinalsByPgy[pgy];
      if (!Number.isFinite(ord) || !starts.length || hasStoredList(RULE_KEYS.WELLNESS, conf, pgy)) continue;
      conf = withLoggedDates(conf, RULE_KEYS.WELLNESS, suggestWellnessWednesdays(starts, ord), pgy);
    }
    if (conf !== orig) { next[ay] = conf; changed = true; }
  }
  return changed ? next : ayData;
}

// ── Pre-generate check ─────────────────────────────────────────────────────────────────────────
// rules: [{ ruleKey, sub?, label?, enabled, suggested: [dates in block] }]. A rule is flagged only
// when it is enabled, the suggester proposes >= 1 date inside the block, and ZERO logged dates fall
// inside the block. Returns [{ ruleKey, sub, label, suggested, message }].
export function missingRuleDates({ block, ayConf, rules }) {
  const out = [];
  if (!block?.startDate || !block?.endDate) return out;
  for (const r of rules || []) {
    if (!r.enabled) continue;
    const suggested = (r.suggested || []).filter(d => d >= block.startDate && d <= block.endDate);
    if (!suggested.length) continue;
    // An explicitly stored EMPTY list = the chief opted this rule out for the AY/PGY: no warning.
    if (hasStoredList(r.ruleKey, ayConf, r.sub) && loggedDates(r.ruleKey, ayConf, r.sub).length === 0) continue;
    if (loggedDatesInRange(r.ruleKey, ayConf, block.startDate, block.endDate, r.sub).length) continue;
    const label = r.label || RULE_LABELS[r.ruleKey] || r.ruleKey;
    out.push({
      ruleKey: r.ruleKey, sub: r.sub, label, suggested,
      message: `No ${label} dates logged for this block (suggested: ${suggested.join(', ')}) - the rule will not apply until dates are logged (Dashboard tab, academic year card)`,
    });
  }
  return out;
}
