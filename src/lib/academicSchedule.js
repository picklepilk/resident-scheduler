// src/lib/academicSchedule.js
// Pure parser for the chief's "PGY Academic Schedule" Word document (.docx): one table per PGY
// (Resident | Lecture | M&M (PGY 3 only) | Journal Club). Pure — no React, never imports
// ResidentScheduler.jsx. A .docx is a zip; fflate unzips word/document.xml and a small regex walk
// reads the tables (no DOM needed, so the same code runs in vitest/node and in the browser).
//
// Word splits text into runs mid-token ("09/0 9 /26", "Lamber t"), so every cell is JOINED per
// paragraph first, and dates are parsed with ALL whitespace stripped. Tables are found by CONTENT
// (a header row containing "Journal Club"), never by filename or position.
import { unzipSync, strFromU8 } from 'fflate';

const decodeEntities = s => String(s)
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&amp;/g, '&');

// Text of one <w:p>: runs concatenated verbatim, <w:tab/> and <w:br/> become a space.
function paragraphText(pXml) {
  let out = '';
  const re = /<w:t(?:\s[^>]*[^/>])?>([\s\S]*?)<\/w:t>|<w:tab\s*\/>|<w:br\s*\/>/g;
  let m;
  while ((m = re.exec(pXml))) out += m[1] !== undefined ? decodeEntities(m[1]) : ' ';
  return out;
}

// Cell -> list of paragraph strings (blank ones dropped).
function cellParagraphs(tcXml) {
  const paras = tcXml.match(/<w:p(?:\s[^>]*[^/>])?>[\s\S]*?<\/w:p>/g) || [];
  return paras.map(paragraphText).filter(t => t.trim() !== '');
}

// Parse a (possibly space-riddled) date string to ISO. M/D/YY or M/D/YYYY; 2-digit years are 20xx.
// Returns null when it is not a real calendar date.
export function parseLooseDate(raw) {
  const s = String(raw ?? '').replace(/\s+/g, '');
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(s);
  if (!m) return null;
  const mo = Number(m[1]), da = Number(m[2]);
  let yr = Number(m[3]);
  if (m[3].length === 2) yr += 2000;
  const d = new Date(Date.UTC(yr, mo - 1, da));
  if (d.getUTCFullYear() !== yr || d.getUTCMonth() !== mo - 1 || d.getUTCDate() !== da) return null;
  const pad = n => String(n).padStart(2, '0');
  return `${yr}-${pad(mo)}-${pad(da)}`;
}

// A date cell may hold several dates (one per paragraph). Returns { dates, failures }.
function parseDateCell(paras) {
  const dates = [], failures = [];
  for (const p of paras) {
    const iso = parseLooseDate(p);
    if (iso) dates.push(iso); else failures.push(p.replace(/\s+/g, ' ').trim());
  }
  return { dates, failures };
}

const norm = s => String(s ?? '').toLowerCase().replace(/[^a-z&]/g, '');

// Column kind from a header cell, or null.
function headerKind(text) {
  const n = norm(text);
  if (n.includes('journal')) return 'jc';
  if (n.includes('m&m') || n.includes('morbid')) return 'mm';
  if (n.includes('lecture') || n.includes('grandrounds')) return 'lecture';
  if (n.includes('resident') || n === 'name') return 'name';
  return null;
}

const cleanName = s => String(s ?? '').replace(/\s+/g, ' ').trim();

// document.xml string -> { tablesTotal, tables:[{pgy, heading, hasMM, rows:[{name,lecture,mm,jc,failures}]}] }.
// Exported separately so tests can feed raw XML.
export function parseAcademicXml(xml) {
  const body = String(xml ?? '');
  const tokenRe = /<w:tbl(?:\s[^>]*)?>[\s\S]*?<\/w:tbl>|<w:p(?:\s[^>]*[^/>])?>[\s\S]*?<\/w:p>/g;
  let lastHeading = null;
  let tablesTotal = 0;
  const tables = [];
  let m;
  while ((m = tokenRe.exec(body))) {
    const tok = m[0];
    if (tok.startsWith('<w:tbl')) {
      tablesTotal++;
      const rows = (tok.match(/<w:tr(?:\s[^>]*)?>[\s\S]*?<\/w:tr>/g) || []).map(tr =>
        (tr.match(/<w:tc(?:\s[^>]*)?>[\s\S]*?<\/w:tc>/g) || []).map(cellParagraphs));
      const hdrIdx = rows.findIndex(r => r.some(c => headerKind(c.join(' ')) === 'jc'));
      if (hdrIdx < 0) continue;
      const kinds = rows[hdrIdx].map(c => headerKind(c.join(' ')));
      // PGY label: a title row above the header row inside the table, else the paragraph before it.
      const pgyRe = /pgy\s*-?\s*([1-9])/i;
      const preText = rows.slice(0, hdrIdx).map(r => r.map(c => c.join(' ')).join(' ')).join(' ');
      const hm = pgyRe.exec(preText) || (lastHeading && pgyRe.exec(lastHeading));
      const pgy = hm ? Number(hm[1]) : null;
      const nameCol = kinds.indexOf('name') >= 0 ? kinds.indexOf('name') : 0;
      const resRows = [];
      for (const row of rows.slice(hdrIdx + 1)) {
        const name = cleanName((row[nameCol] || []).join(' '));
        if (!name) continue;
        const cols = { lecture: { dates: [], failures: [] }, mm: { dates: [], failures: [] }, jc: { dates: [], failures: [] } };
        kinds.forEach((k, i) => { if (k && k !== 'name') cols[k] = parseDateCell(row[i] || []); });
        resRows.push({ name, lecture: cols.lecture.dates, mm: cols.mm.dates, jc: cols.jc.dates,
          failures: cols.lecture.failures.length + cols.mm.failures.length + cols.jc.failures.length });
      }
      tables.push({ pgy, heading: lastHeading, hasMM: kinds.includes('mm'), rows: resRows });
      lastHeading = null;
    } else {
      const t = cleanName(paragraphText(tok));
      if (t) lastHeading = t;
    }
  }
  return { tablesTotal, tables };
}

// .docx bytes (Uint8Array) -> result. Throws a chief-readable Error when the file is not usable.
export function parseAcademicDocx(bytes) {
  let files;
  try { files = unzipSync(bytes, { filter: f => f.name === 'word/document.xml' }); }
  catch { throw new Error('Not a readable .docx file'); }
  const doc = files['word/document.xml'];
  if (!doc) throw new Error('Not a Word document (word/document.xml missing)');
  const res = parseAcademicXml(strFromU8(doc));
  if (!res.tables.length) throw new Error('No table with a "Journal Club" column found');
  return res;
}

// Cheap non-cryptographic content hash (FNV-1a 32-bit hex) for provenance. Metadata only.
export function fileHash(bytes) {
  let h = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) { h ^= bytes[i]; h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}

// Start year of the academic year an ISO date falls in (July 1 starts the year).
export function ayStartYearOf(iso) {
  const y = Number(iso.slice(0, 4)), mo = Number(iso.slice(5, 7));
  return mo >= 7 ? y : y - 1;
}

// Per-AY buckets: { ayStart, jcDates:Set, lectureDates:Set, mmDates:Set, jc/lecture/mm:[{pgy,name,date}] }.
// Each date routes to the AY it falls in (a PGY-3 row can span two AYs).
export function bucketByAy(parsed) {
  const out = new Map();
  const get = y => {
    if (!out.has(y)) out.set(y, { ayStart: y, jcDates: new Set(), lectureDates: new Set(), mmDates: new Set(), jc: [], lecture: [], mm: [] });
    return out.get(y);
  };
  for (const t of parsed.tables) for (const r of t.rows) {
    for (const d of r.jc) { const b = get(ayStartYearOf(d)); b.jcDates.add(d); b.jc.push({ pgy: t.pgy, name: r.name, date: d }); }
    for (const d of r.lecture) { const b = get(ayStartYearOf(d)); b.lectureDates.add(d); b.lecture.push({ pgy: t.pgy, name: r.name, date: d }); }
    for (const d of r.mm) { const b = get(ayStartYearOf(d)); b.mmDates.add(d); b.mm.push({ pgy: t.pgy, name: r.name, date: d }); }
  }
  return [...out.values()].sort((a, b) => a.ayStart - b.ayStart);
}

// Counts-only summary (safe to log / report). No names.
export function summarizeParsed(parsed) {
  const perPgy = {};
  let dates = 0, failures = 0;
  for (const t of parsed.tables) {
    const k = t.pgy ?? 'unknown';
    perPgy[k] = (perPgy[k] || 0) + t.rows.length;
    for (const r of t.rows) { dates += r.jc.length + r.lecture.length + r.mm.length; failures += r.failures; }
  }
  return { tablesTotal: parsed.tablesTotal, tablesMatched: parsed.tables.length, residentsPerPgy: perPgy, dates, failures };
}
