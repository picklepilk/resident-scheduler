// src/lib/qgendaSlotRuns.js
// Reads a QGenda "Grid By Staff" export for NUMBERED PLACEHOLDER slots ('Neurology 1, Neurology 1',
// 'Resident 5, SAMMC3 PGY3', ...) — how the real export lists off-service residents — and groups each
// slot's worked dates into contiguous RUNS so a caller can offer them as choices for a rotation.
// Slot labels do NOT reliably match the specialty, so category hints are weak and nothing is ever
// auto-picked: callers show ranked choices. Pure; reuses qgendaImport's date-column resolver.
import { resolveDateColumns, RES_CALL_RE } from './qgendaImport.js';
import { matchCategory } from './parse.js';

function cell(row, i) { return String(row?.[i] ?? '').trim(); }

// Department words that mark a row as a placeholder slot rather than a real 'Last, First' person.
const DEPT_WORD_RE = /\b(neuro\w*|anes\w*|family|medicine|psych\w*|psyc|sammc\w*|bamc\w*|military|rotator|off\s*service|resident|pgy[\s-]*\d*|peds?|pediatric\w*|podiatry|pod|fm|im)\b/i;

const MARKER_RE = /^\s*\[|^\s*md\s+open\b|^\s*open\b/i;
const PHONE_RE = /^[\d\s()+.\-x]{7,}$/i;

function hintFor(label) {
  const s = String(label);
  let category = null;
  if (/neuro/i.test(s)) category = matchCategory('Neurology');
  else if (/anes/i.test(s)) category = matchCategory('Anesthesia');
  else if (/family\s*medicine|\bfm\b/i.test(s)) category = matchCategory('Family Medicine');
  else if (/psych|\bpsyc\b/i.test(s)) category = matchCategory('Psychiatry');
  else if (/sammc|bamc|military/i.test(s)) category = 'EM_BAMC';
  else if (/\bpeds?\b|pediatric/i.test(s)) category = 'PEDS';
  else if (/\bpod\b|podiatry/i.test(s)) category = 'POD';
  else if (/medicine|\bim\b/i.test(s)) category = matchCategory('Internal Medicine');
  const pm = /pgy[\s-]*(\d)/i.exec(s);
  return { category: category ?? null, pgy: pm ? Number(pm[1]) : null };
}

// -> { kind:'slot'|'person'|'marker', label, hint:{category,pgy} }
export function parseSlotLabel(nameCell) {
  const label = String(nameCell ?? '').trim().replace(/\s+/g, ' ');
  const none = { category: null, pgy: null };
  if (!label || MARKER_RE.test(label) || PHONE_RE.test(label)) return { kind: 'marker', label, hint: none };
  if (/\d/.test(label) || DEPT_WORD_RE.test(label)) return { kind: 'slot', label, hint: hintFor(label) };
  if (/^[^,]+,[^,]+$/.test(label)) return { kind: 'person', label, hint: none };
  // Neither a slot nor a 'Last, First' name: a section header or stray text.
  return { kind: 'marker', label, hint: none };
}

const NON_CLINICAL_RE = /^(vac\w*|leave|off|lecture|conference|grand\s*rounds)\b/i;

function taskArea(task) {
  if (/\bpeds?\b|pediatric/i.test(task)) return 'peds';
  if (/trauma/i.test(task)) return 'trauma';
  return 'main';
}

function dayNum(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86400000);
}
function addDays(iso, n) {
  const dt = new Date((dayNum(iso) + n) * 86400000);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}

// -> [{ id, slot, hint, start, end, count, areaMix:{peds,main,trauma}, dates }]
export function slotRuns(rows, { gapDays = 6 } = {}) {
  const list = Array.isArray(rows) ? rows : [];
  const { dates: dateByCol, dayRow, error } = resolveDateColumns(list);
  if (error) return [];
  const cols = Object.keys(dateByCol).map(Number).sort((a, b) => a - b);

  // slot label -> { hint, byDate: Map(date -> area) } (a label listed twice merges)
  const slots = new Map();
  for (let i = dayRow + 1; i < list.length; i++) {
    const parsed = parseSlotLabel(cell(list[i], 0));
    if (parsed.kind !== 'slot') continue;
    let s = slots.get(parsed.label);
    if (!s) { s = { hint: parsed.hint, byDate: new Map() }; slots.set(parsed.label, s); }
    for (const c of cols) {
      const raw = cell(list[i], c);
      if (!raw || RES_CALL_RE.test(raw) || /^res[_\s]*call/i.test(raw) || NON_CLINICAL_RE.test(raw)) continue;
      s.byDate.set(dateByCol[c], taskArea(raw));
    }
  }

  const out = [];
  for (const [slot, { hint, byDate }] of slots) {
    const dates = [...byDate.keys()].sort();
    let cur = null;
    const flush = () => {
      if (!cur) return;
      const areaMix = { peds: 0, main: 0, trauma: 0 };
      for (const d of cur) areaMix[byDate.get(d)]++;
      out.push({ id: `${slot}@${cur[0]}`, slot, hint, start: cur[0], end: cur[cur.length - 1], count: cur.length, areaMix, dates: cur });
    };
    for (const d of dates) {
      if (cur && dayNum(d) - dayNum(cur[cur.length - 1]) > gapDays) { flush(); cur = null; }
      (cur ??= []).push(d);
    }
    flush();
  }
  return out.sort((a, b) => a.start.localeCompare(b.start) || a.slot.localeCompare(b.slot));
}

// Best first. Never picks: caller shows choices. -> [{ run, score, reasons }]
export function rankRunsForRange(runs, { start, end, category, obligation } = {}, { usedRunIds } = {}) {
  const used = usedRunIds instanceof Set ? usedRunIds : new Set(usedRunIds ?? []);
  const lo = addDays(start, -1), hi = addDays(end, 1);
  const ranked = [];
  for (const run of runs ?? []) {
    if (used.has(run.id)) continue;
    if (run.start < lo || run.end > hi) continue;
    let score = 0;
    const reasons = [];
    const startDiff = Math.abs(dayNum(run.start) - dayNum(start));
    if (startDiff <= 3) { score += 40 - 10 * startDiff; reasons.push(startDiff === 0 ? 'starts on rotation start' : `starts ${startDiff}d from rotation start`); }
    const endDiff = Math.abs(dayNum(run.end) - dayNum(end));
    if (endDiff <= 3) { score += 10 - 2 * endDiff; reasons.push(`ends ${endDiff}d from rotation end`); }
    const frac = (k) => (run.count ? run.areaMix[k] / run.count : 0);
    if (category === 'PEDS') {
      score += Math.round(30 * frac('peds'));
      if (frac('peds') >= 0.5) reasons.push('mostly Peds shifts');
    } else {
      const f = frac('main');
      score += Math.round(30 * f);
      if (f >= 0.5) reasons.push('mostly main/flex/midtrack shifts');
      if (frac('peds') >= 0.5) reasons.push('mostly Peds shifts (unexpected for this category)');
    }
    if (obligation != null) {
      if (run.count <= obligation) { score += 10; reasons.push(`${run.count} shifts within obligation ${obligation}`); }
      else { score -= 20; reasons.push(`${run.count} shifts exceeds obligation ${obligation}`); }
    }
    if (category && run.hint?.category === category) { score += 5; reasons.push('slot label hints at this category'); }
    ranked.push({ run, score, reasons });
  }
  return ranked.sort((a, b) => b.score - a.score || a.run.start.localeCompare(b.run.start) || a.run.slot.localeCompare(b.run.slot));
}
