import { describe, it, expect } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { parseAcademicDocx, parseLooseDate, bucketByAy, summarizeParsed, fileHash } from './academicSchedule.js';
import { buildAcademicPlan, applyAcademicPlan, resolvePeople, personKey } from './academicImportPlan.js';
import { matchRosterByName } from './nameMatch.js';

// Synthetic .docx: fake names, runs split mid-token like Word does.
const run = t => `<w:r><w:t xml:space="preserve">${t}</w:t></w:r>`;
const cell = (...runs) => `<w:tc><w:p>${runs.map(run).join('')}</w:p></w:tc>`;
const multi = (...paras) => `<w:tc>${paras.map(p => `<w:p>${run(p)}</w:p>`).join('')}</w:tc>`;
const row = (...cells) => `<w:tr>${cells.join('')}</w:tr>`;
const tbl = rows => `<w:tbl><w:tblPr/>${rows.join('')}</w:tbl>`;
const empty = '<w:p w:rsidR="00A"/>'; // self-closing paragraph: must not swallow following tables
function docx(bodyXml) {
  const xml = `<?xml version="1.0"?><w:document xmlns:w="x"><w:body>${bodyXml}</w:body></w:document>`;
  return zipSync({ 'word/document.xml': strToU8(xml), '[Content_Types].xml': strToU8('<x/>') });
}
const pgy3 = tbl([
  row(cell('PGY 3'), cell(''), cell(''), cell('')),
  row(cell('Resident'), cell('Lecture'), cell('M&amp;M'), cell('Journal Club')),
  row(cell('Resident ', 'One'), cell('09/0', ' 9 ', '/26'), cell('5/19/27'), cell('12/01/', ' 2 6')),
  row(cell('Resident Tw', 'o'), cell('10/7/26'), cell('not a date'), multi('1/5/27', '2/2/27')),
]);
const pgy1 = tbl([
  row(cell('Resident'), cell('Lecture'), cell('Journal Club')),
  row(cell('Lamber', ' t Three'), cell('9/30/26'), cell('3/2/27')),
]);
const other = tbl([row(cell('Something'), cell('Else')), row(cell('x'), cell('y'))]);

describe('parseLooseDate', () => {
  it('tolerates stray spaces, 2/4-digit years, rejects impossible dates', () => {
    expect(parseLooseDate('09/0 9 /26')).toBe('2026-09-09');
    expect(parseLooseDate('12/01/ 2 6')).toBe('2026-12-01');
    expect(parseLooseDate('1/5/2027')).toBe('2027-01-05');
    expect(parseLooseDate('2/30/27')).toBeNull();
    expect(parseLooseDate('hello')).toBeNull();
  });
});

describe('parseAcademicDocx', () => {
  const parsed = parseAcademicDocx(docx(`${empty}${pgy3}${empty}<w:p>${run('PGY 1')}</w:p>${pgy1}${other}`));
  it('finds tables by Journal Club header, ignores others, reads PGY from title row or heading', () => {
    expect(parsed.tablesTotal).toBe(3);
    expect(parsed.tables.map(t => [t.pgy, t.hasMM, t.rows.length])).toEqual([[3, true, 2], [1, false, 1]]);
  });
  it('joins split runs in names and dates; counts parse failures; multi-paragraph date cells', () => {
    const [a, b] = parsed.tables[0].rows;
    expect(a).toMatchObject({ name: 'Resident One', lecture: ['2026-09-09'], mm: ['2027-05-19'], jc: ['2026-12-01'], failures: 0 });
    expect(b).toMatchObject({ name: 'Resident Two', jc: ['2027-01-05', '2027-02-02'], mm: [], failures: 1 });
    expect(parsed.tables[1].rows[0].name).toBe('Lamber t Three'); // raw join; matching heals the split
  });
  it('summary is counts only', () => {
    expect(summarizeParsed(parsed)).toEqual({ tablesTotal: 3, tablesMatched: 2, residentsPerPgy: { 3: 2, 1: 1 }, dates: 8, failures: 1 });
  });
  it('buckets dates into academic years', () => {
    const ays = bucketByAy(parsed);
    expect(ays).toHaveLength(1);
    expect(ays[0].ayStart).toBe(2026);
    expect([...ays[0].jcDates].sort()).toEqual(['2026-12-01', '2027-01-05', '2027-02-02', '2027-03-02']);
  });
  it('rejects non-docx and docx without a Journal Club table', () => {
    expect(() => parseAcademicDocx(new Uint8Array([1, 2, 3]))).toThrow(/docx/);
    expect(() => parseAcademicDocx(docx(other))).toThrow(/Journal Club/);
  });
  it('fileHash is stable', () => {
    expect(fileHash(strToU8('abc'))).toBe(fileHash(strToU8('abc')));
    expect(fileHash(strToU8('abc'))).not.toBe(fileHash(strToU8('abd')));
  });
});

describe('plan + apply', () => {
  const parsed = parseAcademicDocx(docx(`${pgy3}<w:p>${run("PGY 1")}</w:p>${pgy1}`));
  const roster = [
    { id: 'r1', firstName: 'Resident', lastName: 'One', pgy: 3, category: 'EM_HOME', jcPresentDates: ['2026-12-01'], grLectureDates: [] },
    { id: 'r2', firstName: 'Resident', lastName: 'Two', pgy: 3, category: 'EM_HOME' },
    { id: 'r3', firstName: 'Resident', lastName: 'Two', pgy: 3, category: 'EM_HOME' }, // makes Two ambiguous
    { id: 'r4', firstName: 'Lambert', lastName: 'Three', pgy: 1, category: 'EM_HOME' },
  ];
  const match = (raw, rost) => {
    const parts = raw.split(' ');
    return { candidates: matchRosterByName(parts.slice(0, -1).join(' '), parts[parts.length - 1], rost), tier: 'strict' };
  };
  it('classifies matched / ambiguous / unmatched; mapping resolves them; skip excludes', () => {
    const plan = buildAcademicPlan({ parsed, emRoster: roster, ayData: {}, match });
    expect(plan.people.map(p => p.status)).toEqual(['matched', 'ambiguous', 'matched']); // third: split-run name healed
    const mapped = buildAcademicPlan({ parsed, emRoster: roster, ayData: {}, match,
      mapping: { [personKey(3, 'Resident Two')]: 'r2', [personKey(1, 'Lamber t Three')]: 'skip' } });
    expect(mapped.people.map(p => p.status)).toEqual(['matched', 'mapped', 'skipped']);
    expect(mapped.counts).toEqual({ matched: 2, skipped: 1, unresolved: 0 });
  });
  it('diffs JC dates vs resolved list and counts presenters new vs already stored', () => {
    const plan = buildAcademicPlan({ parsed, emRoster: roster, ayData: { 'AY26/27': { jcDates: ['2026-12-01', '2026-11-03'] } }, match });
    const ay = plan.ays[0];
    expect(ay.ay).toBe('AY26/27');
    expect(ay.jc.added).toEqual(['2027-01-05', '2027-02-02', '2027-03-02']);
    expect(ay.jc.removed).toEqual(['2026-11-03']);
    expect(ay.jc.same).toEqual(['2026-12-01']);
    expect(ay.presenters).toMatchObject({ new: 1, have: 1 }); // r1 already stored; healed r4 is new
    expect(ay.writeJcDefault).toBe(true);
  });
  it('apply merges roster dates, writes JC list for chosen AYs only, is idempotent', () => {
    const mapping = { [personKey(3, 'Resident Two')]: 'r2' };
    const plan = buildAcademicPlan({ parsed, emRoster: roster, ayData: {}, match, mapping });
    const out = applyAcademicPlan(plan, { emRoster: roster, ayData: {} });
    expect(out.emRoster[0].jcPresentDates).toEqual(['2026-12-01']);
    expect(out.emRoster[0].grLectureDates).toEqual(['2026-09-09', '2027-05-19']); // lecture + M&M
    expect(out.emRoster[1].jcPresentDates).toEqual(['2027-01-05', '2027-02-02']);
    expect(out.emRoster[2]).toBe(roster[2]);
    expect(out.emRoster[3].jcPresentDates).toEqual(['2027-03-02']); // healed 'Lamber t' resident
    expect(out.ayData['AY26/27'].jcDates).toEqual(['2026-12-01', '2027-01-05', '2027-02-02', '2027-03-02']);
    const off = applyAcademicPlan(plan, { emRoster: roster, ayData: {}, writeJc: { 'AY26/27': false } });
    expect(off.ayData).toEqual({});
    const again = applyAcademicPlan(
      buildAcademicPlan({ parsed, emRoster: out.emRoster, ayData: out.ayData, match, mapping }),
      { emRoster: out.emRoster, ayData: out.ayData });
    expect(again.emRoster).toEqual(out.emRoster);
    expect(again.ayData).toEqual(out.ayData);
  });
  it('resolvePeople exported shape', () => {
    expect(resolvePeople(parsed, roster, match)[0].key).toBe(personKey(3, 'Resident One'));
  });
});
