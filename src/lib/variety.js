// src/lib/variety.js
// "Shift variety" soft rule (owner decision 2026-11-22). Pure; imports only sibling lib modules.
//
// Two counts, both advisory (never export-blocking, never a hard rule):
//   * runExcess  - per resident per NON-NIGHT shift id, every consecutive day beyond `maxSameShiftRun`
//                  on the SAME id. A run of L days costs max(0, L - N). Night ids are skipped on purpose:
//                  NIGHT_RULES already governs night runs (soft 6, consolidated 5-6 wanted), so a
//                  variety cap there would fight night consolidation.
//   * pairExcess - per resident PAIR per AREA, the number of dates both work a NON-NIGHT shift of that
//                  area, beyond `pairStackDays`. Only `pairResidentIds` (EM residents) take part - the
//                  same restriction the solver uses to keep its model small.
// The solver mirrors both exactly (objective.py `_add_variety_terms`): a run of L costs L-N full windows
// of N+1 days, which is the same number; pair excess is max(0, cooccurrences - M) per pair+area.

import { SHIFT_MAP } from './shifts.js';
import { parseDate, addDays, toDateStr } from './dates.js';

export const DEFAULT_VARIETY_RULE = { enabled: true, maxSameShiftRun: 3, pairStackDays: 4 };
export const VARIETY_MAX_VALUE = 28;

// Untrusted persisted value -> valid rule. Integers clamped to 1..28; anything else falls to default.
export function normalizeVarietyRule(appSettings) {
  const raw = appSettings?.varietyRule;
  const int = (v, d) => {
    const n = Math.floor(Number(v));
    return Number.isFinite(n) && n >= 1 ? Math.min(n, VARIETY_MAX_VALUE) : d;
  };
  return {
    enabled: raw?.enabled !== false,
    maxSameShiftRun: int(raw?.maxSameShiftRun, DEFAULT_VARIETY_RULE.maxSameShiftRun),
    pairStackDays: int(raw?.pairStackDays, DEFAULT_VARIETY_RULE.pairStackDays),
  };
}

const isNight = sid => SHIFT_MAP[sid]?.type === 'night';

// -> { runExcess, runs: [{residentId, shiftId, dates[], excess}], pairExcess,
//      pairs: [{a, b, area, dates[], excess}] }.  `rule` is a normalized rule; disabled -> all zero.
export function varietyStats({ schedule, dates, residents, pairResidentIds, rule }) {
  const out = { runExcess: 0, runs: [], pairExcess: 0, pairs: [] };
  if (!rule?.enabled) return out;
  const N = rule.maxSameShiftRun, M = rule.pairStackDays;
  const consecutive = (i) => toDateStr(addDays(parseDate(dates[i]), 1)) === dates[i + 1];

  for (const r of residents) {
    const rs = schedule[r.id] || {};
    let i = 0;
    while (i < dates.length) {
      const sid = rs[dates[i]];
      if (!sid || isNight(sid)) { i++; continue; }
      let j = i;
      while (j + 1 < dates.length && rs[dates[j + 1]] === sid && consecutive(j)) j++;
      const len = j - i + 1;
      if (len > N) {
        out.runExcess += len - N;
        out.runs.push({ residentId: r.id, shiftId: sid, dates: dates.slice(i, j + 1), excess: len - N });
      }
      i = j + 1;
    }
  }

  const pairIds = pairResidentIds ? new Set(pairResidentIds) : null;
  const members = residents.filter(r => !pairIds || pairIds.has(r.id));
  const tally = new Map(); // "a|b|area" -> dates[]
  for (const ds of dates) {
    const byArea = {};
    for (const r of members) {
      const sid = schedule[r.id]?.[ds];
      if (!sid || isNight(sid)) continue;
      const area = SHIFT_MAP[sid]?.area;
      if (area) (byArea[area] ||= []).push(r.id);
    }
    for (const [area, ids] of Object.entries(byArea)) {
      for (let x = 0; x < ids.length; x++) for (let y = x + 1; y < ids.length; y++) {
        const [a, b] = ids[x] < ids[y] ? [ids[x], ids[y]] : [ids[y], ids[x]];
        const k = `${a}|${b}|${area}`;
        const arr = tally.get(k); if (arr) arr.push(ds); else tally.set(k, [ds]);
      }
    }
  }
  for (const [k, ds] of tally) {
    if (ds.length > M) {
      const [a, b, area] = k.split('|');
      out.pairExcess += ds.length - M;
      out.pairs.push({ a, b, area, dates: ds, excess: ds.length - M });
    }
  }
  return out;
}
