// src/lib/academicImportPlan.js
// Pure plan/diff/apply logic for the Academic Schedule (.docx) importer. Takes the output of
// academicSchedule.js (parse) plus the current roster/ayData and produces (1) a preview model with
// diffs vs current app data and (2) the next roster/ayData to write. No React, never imports
// ResidentScheduler.jsx; the one name matcher (matchLectureRosterName, src/lib/nameMatch.js
// primitives) is injected so this module cannot grow a second matcher.
import { getAcademicYearFor } from './dates.js';
import { resolveJcDates } from './journalClub.js';
import { bucketByAy } from './academicSchedule.js';

export const personKey = (pgy, name) => `${pgy ?? '?'}|${String(name).toLowerCase()}`;

// One entry per table row: { key, pgy, name, status, residentId, rosterName, candidates, tier }.
// status: 'matched' (unique) | 'ambiguous' | 'unmatched' | 'mapped' (chief picked) | 'skipped'.
// `mapping` is the chief's per-key override: a roster id, or 'skip'. Ambiguous never auto-commits.
export function resolvePeople(parsed, emRoster, match, mapping = {}) {
  const byId = new Map((emRoster || []).map(r => [r.id, r]));
  const people = [];
  for (const t of parsed.tables) for (const row of t.rows) {
    const key = personKey(t.pgy, row.name);
    const base = { key, pgy: t.pgy, name: row.name, row, residentId: null, rosterName: null, candidates: [], tier: 'none' };
    const ov = mapping[key];
    if (ov === 'skip') { people.push({ ...base, status: 'skipped' }); continue; }
    if (ov && byId.has(ov)) {
      const r = byId.get(ov);
      people.push({ ...base, status: 'mapped', residentId: ov, rosterName: `${r.firstName} ${r.lastName}` });
      continue;
    }
    let { candidates, tier } = match(row.name, emRoster || []);
    if (!candidates.length) {
      // Word splits runs mid-word ("Lamber t"); repair by comparing space-stripped letters, in
      // either word order. Only runs when the shared matcher found nothing at all.
      const sq = s => String(s ?? '').toLowerCase().replace(/[^a-z]/g, '');
      const want = sq(row.name);
      const healed = (emRoster || []).filter(r => want && (want === sq(r.firstName + r.lastName) || want === sq(r.lastName + r.firstName)));
      if (healed.length) { candidates = healed; tier = 'healed'; }
    }
    if (candidates.length === 1) {
      const r = candidates[0];
      people.push({ ...base, status: 'matched', tier, residentId: r.id, rosterName: `${r.firstName} ${r.lastName}` });
    } else {
      people.push({ ...base, status: candidates.length ? 'ambiguous' : 'unmatched', tier,
        candidates: candidates.map(c => ({ id: c.id, label: `${c.firstName} ${c.lastName} (PGY-${c.pgy})` })) });
    }
  }
  return people;
}

const ayStartDate = y => `${y}-07-01`;

// Preview model. Per AY: JC date diff (added/removed/same vs the currently RESOLVED list, which
// includes derived first-Tuesdays), lecture/M&M counts new vs already stored, presenter adds.
export function buildAcademicPlan({ parsed, emRoster, ayData, match, mapping = {} }) {
  const people = resolvePeople(parsed, emRoster, match, mapping);
  const resolved = people.filter(p => p.residentId);
  const byId = new Map((emRoster || []).map(r => [r.id, r]));

  const ays = bucketByAy(parsed).map(b => {
    const label = getAcademicYearFor(ayStartDate(b.ayStart));
    const fileJc = [...b.jcDates].sort();
    const current = resolveJcDates(label, (ayData || {})[label] || {}, { fallbackDateStr: ayStartDate(b.ayStart) });
    const cur = new Set(current), file = new Set(fileJc);
    const added = fileJc.filter(d => !cur.has(d));
    const removed = current.filter(d => !file.has(d));
    const same = fileJc.filter(d => cur.has(d));
    // Presenter / lecture rows per resolved person, new vs already stored.
    let jcNew = 0, jcHave = 0, lecNew = 0, lecHave = 0, mmNew = 0, mmHave = 0;
    for (const p of resolved) {
      const r = byId.get(p.residentId);
      const hasJc = new Set(r.jcPresentDates || []), hasLec = new Set(r.grLectureDates || []);
      const inAy = d => getAcademicYearFor(d) === label;
      for (const d of p.row.jc.filter(inAy)) (hasJc.has(d) ? jcHave++ : jcNew++);
      for (const d of p.row.lecture.filter(inAy)) (hasLec.has(d) ? lecHave++ : lecNew++);
      for (const d of p.row.mm.filter(inAy)) (hasLec.has(d) ? mmHave++ : mmNew++);
    }
    return {
      ay: label, ayStart: b.ayStart,
      jc: { file: fileJc, current, added, removed, same, custom: Array.isArray(((ayData || {})[label] || {}).jcDates) },
      lecture: { dates: [...b.lectureDates].sort(), new: lecNew, have: lecHave },
      mm: { dates: [...b.mmDates].sort(), new: mmNew, have: mmHave },
      presenters: { new: jcNew, have: jcHave, rows: b.jc },
      // Default: write JC dates only when this AY clearly is a JC year (>= 3 dates), so a stray
      // out-of-year typo date can't rewrite the neighbouring AY's list.
      writeJcDefault: fileJc.length >= 3,
    };
  });
  return { people, ays, counts: {
    matched: people.filter(p => p.status === 'matched' || p.status === 'mapped').length,
    skipped: people.filter(p => p.status === 'skipped').length,
    unresolved: people.filter(p => !p.residentId && p.status !== 'skipped').length,
  } };
}

// Single seam for "write JC dates for an AY". D1 will redirect this to the chief-logged rule-date
// lists; today the store is ayData[AY].jcDates (an explicit array materializes the list).
export function writeJcDatesToAy(ayData, ay, dates) {
  const conf = (ayData || {})[ay] || {};
  return { ...(ayData || {}), [ay]: { ...conf, jcDates: [...new Set(dates)].sort() } };
}

// Applies the plan. opts.writeJc = { [ay]: bool } (defaults to each AY's writeJcDefault).
// Roster: jcPresentDates + grLectureDates (lecture AND M&M, as ImportLecturesModal does) MERGE
// (dedupe + sort), never remove. ayData: JC date list REPLACED by the file's list for chosen AYs.
export function applyAcademicPlan(plan, { emRoster, ayData, writeJc = {} }) {
  const adds = new Map(); // residentId -> { jc:Set, lec:Set }
  for (const p of plan.people) {
    if (!p.residentId) continue;
    const a = adds.get(p.residentId) || { jc: new Set(), lec: new Set() };
    p.row.jc.forEach(d => a.jc.add(d));
    p.row.lecture.forEach(d => a.lec.add(d));
    p.row.mm.forEach(d => a.lec.add(d));
    adds.set(p.residentId, a);
  }
  const nextRoster = (emRoster || []).map(r => {
    const a = adds.get(r.id);
    if (!a) return r;
    return {
      ...r,
      jcPresentDates: [...new Set([...(r.jcPresentDates || []), ...a.jc])].sort(),
      grLectureDates: [...new Set([...(r.grLectureDates || []), ...a.lec])].sort(),
    };
  });
  let nextAy = ayData || {};
  const jcAys = [];
  for (const ay of plan.ays) {
    const want = writeJc[ay.ay] ?? ay.writeJcDefault;
    if (want && ay.jc.file.length) { nextAy = writeJcDatesToAy(nextAy, ay.ay, ay.jc.file); jcAys.push(ay.ay); }
  }
  return { emRoster: nextRoster, ayData: nextAy, residentsTouched: adds.size, jcAys };
}
