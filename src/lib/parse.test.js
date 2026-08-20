import { describe, it, expect } from 'vitest';
import {
  CATEGORIES, CAT_MAP, normalizeToken, matchCategory,
  splitCsvLine, splitName, parseRosterText, parseDateRangeInAY,
} from './parse.js';

describe('normalizeToken / matchCategory', () => {
  it('strips non-alphanumerics and lowercases', () => {
    expect(normalizeToken('EM - Home')).toBe('emhome');
  });

  it('matches by id, label, or shortLabel', () => {
    expect(matchCategory('EM_HOME')).toBe('EM_HOME');
    expect(matchCategory('Family Medicine')).toBe('FM');
    expect(matchCategory('BAMC')).toBe('EM_BAMC');
  });

  it('matches via a recognized synonym', () => {
    expect(matchCategory('peds')).toBe('PEDS');
    expect(matchCategory('internalmedicine')).toBe('IM');
  });

  it('is case- and punctuation-insensitive', () => {
    expect(matchCategory('  em-home ')).toBe('EM_HOME');
  });

  it('returns null for an unrecognized or empty category', () => {
    expect(matchCategory('Not A Category')).toBeNull();
    expect(matchCategory('')).toBeNull();
    expect(matchCategory(null)).toBeNull();
  });

  it('CAT_MAP has an entry for every CATEGORIES id', () => {
    for (const c of CATEGORIES) expect(CAT_MAP[c.id]).toBe(c);
  });
});

describe('splitCsvLine', () => {
  it('splits a plain comma-delimited line', () => {
    expect(splitCsvLine('a,b,c')).toEqual(['a', 'b', 'c']);
  });

  it('keeps a quoted field with an internal comma intact', () => {
    expect(splitCsvLine('"Doe, Jane",EM - Home,1')).toEqual(['Doe, Jane', 'EM - Home', '1']);
  });

  it('unescapes a doubled quote inside a quoted field', () => {
    expect(splitCsvLine('"Say ""hi""",b')).toEqual(['Say "hi"', 'b']);
  });

  it('trims whitespace around each field', () => {
    expect(splitCsvLine(' a , b ,c')).toEqual(['a', 'b', 'c']);
  });
});

describe('splitName', () => {
  it('parses "Last, First" form', () => {
    expect(splitName('Doe, Jane')).toEqual({ firstName: 'Jane', lastName: 'Doe' });
  });

  it('parses "First Last" form (space-delimited, no comma)', () => {
    expect(splitName('Jane Doe')).toEqual({ firstName: 'Jane', lastName: 'Doe' });
  });

  it('treats a multi-word first name before the last token as the first name', () => {
    expect(splitName('Mary Jane Doe')).toEqual({ firstName: 'Mary Jane', lastName: 'Doe' });
  });

  it('returns null for a single unsplittable token', () => {
    expect(splitName('Doe')).toBeNull();
  });

  it('returns null for empty/missing input', () => {
    expect(splitName('')).toBeNull();
    expect(splitName(null)).toBeNull();
  });

  it('returns null for "Last," with nothing after the comma', () => {
    expect(splitName('Doe,')).toBeNull();
  });
});

describe('parseRosterText', () => {
  it('parses headerless quoted "Last, First",Category,PGY rows', () => {
    const { ok, errors } = parseRosterText('"Doe, Jane",EM - Home,1', ['EM_HOME']);
    expect(errors).toEqual([]);
    expect(ok).toEqual([{ firstName: 'Jane', lastName: 'Doe', category: 'EM_HOME', pgy: 1 }]);
  });

  it('detects and skips a header row', () => {
    const text = 'Resident,Category,PGY\nDoe, Jane,EM - Home,1';
    const { ok, errors } = parseRosterText(text, ['EM_HOME']);
    expect(errors).toEqual([]);
    expect(ok).toHaveLength(1);
    expect(ok[0].lastName).toBe('Doe');
  });

  it('recovers from an unquoted "Last, First" comma splitting into an extra column', () => {
    // "Doe, Jane,EM - Home,1" unquoted -> naive split gives 4 columns: ["Doe","Jane","EM - Home","1"]
    const { ok, errors } = parseRosterText('Doe, Jane,EM - Home,1', ['EM_HOME']);
    expect(errors).toEqual([]);
    expect(ok[0]).toEqual({ firstName: 'Jane', lastName: 'Doe', category: 'EM_HOME', pgy: 1 });
  });

  it('parses tab-delimited rows', () => {
    const { ok, errors } = parseRosterText('Doe, Jane\tEM - Home\t1', ['EM_HOME']);
    expect(errors).toEqual([]);
    expect(ok[0].category).toBe('EM_HOME');
  });

  it('rejects a category not in allowedCategoryIds', () => {
    const { ok, errors } = parseRosterText('Doe, Jane,EM - Home,1', ['PEDS']);
    expect(ok).toEqual([]);
    expect(errors).toHaveLength(1);
    expect(errors[0].reason).toMatch(/can't be imported here/);
  });

  it('rejects a PGY not valid for the category', () => {
    const { ok, errors } = parseRosterText('Doe, Jane,EM - Home,9', ['EM_HOME']);
    expect(ok).toEqual([]);
    expect(errors).toHaveLength(1);
    expect(errors[0].reason).toMatch(/PGY/);
  });

  it('rejects an unparseable name', () => {
    const { ok, errors } = parseRosterText('Doe,EM - Home,1', ['EM_HOME']);
    expect(ok).toEqual([]);
    expect(errors).toHaveLength(1);
    expect(errors[0].reason).toMatch(/name/);
  });

  it('returns empty ok/errors for blank input', () => {
    expect(parseRosterText('', ['EM_HOME'])).toEqual({ ok: [], errors: [] });
    expect(parseRosterText('   \n  \n', ['EM_HOME'])).toEqual({ ok: [], errors: [] });
  });

  // Regression: a chief reported a Podiatry resident "didn't populate from roster upload." Root
  // cause — Podiatry (like NEURO/ANES/PSYCH) has exactly one valid pgyOptions entry ([1]), and a
  // spreadsheet with a redundant single-value PGY column is easy to leave blank when copy-pasted
  // (unlike EM Home, which genuinely needs PGY-1/2/3 distinguished). A blank PGY cell used to be
  // hard-rejected with no visible reason the row was dropped; it now defaults for any
  // single-option category, while an explicit wrong value still errors exactly as before.
  it('defaults PGY when the cell is blank and the category has exactly one valid PGY (Podiatry)', () => {
    const { ok, errors } = parseRosterText('Smith, Pat\tPodiatry', ['POD']);
    expect(errors).toEqual([]);
    expect(ok).toEqual([{ firstName: 'Pat', lastName: 'Smith', category: 'POD', pgy: 1 }]);
  });

  it('defaults PGY when the cell is present but empty (trailing delimiter, no value)', () => {
    const { ok, errors } = parseRosterText('Smith, Pat\tPodiatry\t', ['POD']);
    expect(errors).toEqual([]);
    expect(ok).toEqual([{ firstName: 'Pat', lastName: 'Smith', category: 'POD', pgy: 1 }]);
  });

  it('still rejects an explicit-but-invalid PGY for a single-option category', () => {
    const { ok, errors } = parseRosterText('Smith, Pat\tPodiatry\t2', ['POD']);
    expect(ok).toEqual([]);
    expect(errors).toHaveLength(1);
    expect(errors[0].reason).toMatch(/PGY/);
  });

  it('does NOT default a blank PGY for a multi-option category (EM Home still requires it)', () => {
    const { ok, errors } = parseRosterText('Doe, Jane\tEM - Home', ['EM_HOME']);
    expect(ok).toEqual([]);
    expect(errors).toHaveLength(1);
    expect(errors[0].reason).toMatch(/PGY/);
  });
});

describe('parseDateRangeInAY', () => {
  it('dates a same-year range using the later month\'s half of a Jun->Jul straddle', () => {
    // 6/29-7/26 straddling the AY boundary should land on the AY-start year for BOTH ends
    expect(parseDateRangeInAY('6/29-7/26', 2026)).toEqual({ start: '2026-06-29', end: '2026-07-26' });
  });

  it('dates a range fully within the first (Jul-Dec) half of the AY', () => {
    expect(parseDateRangeInAY('9/1-9/14', 2026)).toEqual({ start: '2026-09-01', end: '2026-09-14' });
  });

  it('dates a range fully within the second (Jan-Jun) half of the AY', () => {
    expect(parseDateRangeInAY('3/1-3/14', 2026)).toEqual({ start: '2027-03-01', end: '2027-03-14' });
  });

  it('handles a genuine year-turn wrap (Dec -> Jan)', () => {
    expect(parseDateRangeInAY('12/18-1/14', 2026)).toEqual({ start: '2026-12-18', end: '2027-01-14' });
  });

  it('returns null for unparseable input', () => {
    expect(parseDateRangeInAY('not a range', 2026)).toBeNull();
    expect(parseDateRangeInAY('', 2026)).toBeNull();
  });
});
