import { describe, it, expect } from 'vitest';
import { parseCsv, parseCalendarDateCell, parseQGendaCalendarCsv, mapQGendaCalendar } from './qgendaCalendarParse.js';

const CSV = [
  'Org,,,',
  '<h6> Report </h6>,,,',
  'Monday,,Tuesday,',
  '"November 16, 2026",,"November 17, 2026",',
  'MC Team Day 7a-4p ,"Zztest, Alpha",Flex Team Day 6a-3p ,"Yytest, Beta"',
  '*Peds Night (FM only) 11p-8a ,"Placeholder 1, Placeholder 1",Mystery Task ,"Zztest, Alpha"',
  'Res_Call PGY2 ,"Yytest, Beta",Res_Call PGY1 ,"Nobody, Known"',
  ',,,',
  'Wednesday,,Thursday,',
  '"November 18, 2026",,"November 19, 2026",',
  'Trauma Day-Intern ,"Zztest, Alpha",MC Team Night 11p-8a ,"Zztest, Alpha"',
].join('\r\n');

describe('qgendaCalendarParse', () => {
  it('parses quoted csv', () => {
    expect(parseCsv('a,"b, c",d\n')[0]).toEqual(['a', 'b, c', 'd']);
  });
  it('parses date cells', () => {
    expect(parseCalendarDateCell('November 16, 2026')).toBe('2026-11-16');
    expect(parseCalendarDateCell('Monday')).toBeNull();
  });
  it('parses weekly blocks into rows', () => {
    const rows = parseQGendaCalendarCsv(CSV);
    expect(rows).toHaveLength(8);
    expect(rows[0]).toEqual({ date: '2026-11-16', task: 'MC Team Day 7a-4p', name: 'Zztest, Alpha' });
    expect(rows.at(-1)).toEqual({ date: '2026-11-19', task: 'MC Team Night 11p-8a', name: 'Zztest, Alpha' });
  });
  it('maps tasks and names, reports leftovers', () => {
    const roster = [
      { id: 'a', firstName: 'Alpha', lastName: 'Zztest' },
      { id: 'b', firstName: 'Beta', lastName: 'Yytest' },
    ];
    const m = mapQGendaCalendar(parseQGendaCalendarCsv(CSV), roster);
    expect(m.schedule.a).toEqual({ '2026-11-16': 'POD-D', '2026-11-18': 'TRAUMA-D', '2026-11-19': 'POD-N' });
    expect(m.schedule.b).toEqual({ '2026-11-17': 'FLEX-D' });
    expect(m.unmappedTasks).toEqual([{ task: 'Mystery Task', count: 1 }]);
    expect(m.unmatchedNames.map(u => u.name)).toEqual(['Placeholder 1, Placeholder 1']);
    expect(m.jeopardy).toHaveLength(2);
    expect(m.jeopardy[0]).toMatchObject({ pgy: 2, residentId: 'b' });
    expect(m.jeopardy[1].residentId).toBeNull();
  });
});
