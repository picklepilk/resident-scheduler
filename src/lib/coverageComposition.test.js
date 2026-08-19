// src/lib/coverageComposition.test.js
import { describe, it, expect } from 'vitest';
import { composeCoverage, bucketLabel, COVERAGE_GROUPS } from './coverageComposition.js';
import { DEFAULT_COVERAGE } from './coverage.js';

// Fake names only -- this repo is public (see CLAUDE.md).
function resident(id, category, pgy) {
  return { id, category, pgy };
}

describe('bucketLabel', () => {
  it('formats a category_pgy bucket key using CAT_MAP shortLabel', () => {
    expect(bucketLabel('EM_HOME_2')).toBe('EM-H PGY-2');
    expect(bucketLabel('EM_BAMC_1')).toBe('BAMC PGY-1');
  });

  it('splits on the LAST underscore, not the first, since category ids contain underscores', () => {
    expect(bucketLabel('EM_HOME_1')).toBe('EM-H PGY-1');
  });

  it('falls back to the raw key for an unknown category id', () => {
    expect(bucketLabel('NOT_A_CATEGORY_2')).toBe('NOT_A_CATEGORY_2');
  });
});

describe('COVERAGE_GROUPS', () => {
  it('is the three coarse buckets', () => {
    expect(COVERAGE_GROUPS).toEqual(['home', 'bamc', 'offservice']);
  });
});

describe('composeCoverage: a plain date', () => {
  const dateStr = '2026-06-02'; // Tuesday (2026-06-01 is Monday, per coverage.test.js)
  const allResidents = [
    resident('r1', 'EM_HOME', 2),
    resident('r2', 'EM_HOME', 2),
    resident('r3', 'EM_HOME', 3),
    resident('r4', 'EM_BAMC', 1),
  ];
  const schedule = {
    r1: { [dateStr]: 'POD-D' },
    r2: { [dateStr]: 'POD-D' },
    r3: { [dateStr]: 'POD-N' },
    r4: { [dateStr]: 'POD-D' },
  };

  const out = composeCoverage({ dates: [dateStr], schedule, allResidents, coverage: {}, ayConf: {} });

  it('counts total bodies per shift correctly', () => {
    expect(out[dateStr]['POD-D'].total).toBe(3);
    expect(out[dateStr]['POD-N'].total).toBe(1);
  });

  it('resolves min/max from DEFAULT_COVERAGE, including the Tuesday POD-D dow bump', () => {
    expect(out[dateStr]['POD-D'].min).toBe(DEFAULT_COVERAGE['POD-D'].min);
    expect(out[dateStr]['POD-D'].max).toBe(3); // DOW_COVERAGE_MAX_OVERRIDE bumps Tue POD-D max to 3
  });

  it('builds fine-grained category_pgy buckets', () => {
    expect(out[dateStr]['POD-D'].buckets).toEqual({ EM_HOME_2: 2, EM_BAMC_1: 1 });
    expect(out[dateStr]['POD-N'].buckets).toEqual({ EM_HOME_3: 1 });
  });

  it('builds coarse home/bamc/offservice groups', () => {
    expect(out[dateStr]['POD-D'].groups).toEqual({ home: 2, bamc: 1, offservice: 0 });
  });

  it('lists residentIds assigned to each shift', () => {
    expect(out[dateStr]['POD-D'].residentIds.sort()).toEqual(['r1', 'r2', 'r4']);
    expect(out[dateStr]['POD-N'].residentIds).toEqual(['r3']);
  });

  it('an unstaffed shift on the date still gets an entry, zeroed', () => {
    expect(out[dateStr]['TRAUMA-D']).toEqual({
      total: 0, min: 1, max: 1, buckets: {}, groups: { home: 0, bamc: 0, offservice: 0 }, residentIds: [],
    });
  });
});

describe('composeCoverage: SHIFT_DOW (PED-S only exists Mon/Tue/Thu/Fri)', () => {
  const allResidents = [resident('r1', 'EM_HOME', 2)];

  it('PED-S is absent from a Wednesday entry', () => {
    const out = composeCoverage({ dates: ['2026-06-03'], schedule: {}, allResidents, coverage: {}, ayConf: {} }); // Wed
    expect(out['2026-06-03']['PED-S']).toBeUndefined();
  });

  it('PED-S is present on a Monday entry', () => {
    const out = composeCoverage({ dates: ['2026-06-01'], schedule: {}, allResidents, coverage: {}, ayConf: {} }); // Mon
    expect(out['2026-06-01']['PED-S']).toBeDefined();
    expect(out['2026-06-01']['PED-S'].min).toBe(DEFAULT_COVERAGE['PED-S'].min);
    expect(out['2026-06-01']['PED-S'].max).toBe(DEFAULT_COVERAGE['PED-S'].max);
  });
});

describe('composeCoverage: 12-hour replace window', () => {
  // Same window shape as src/lib/coverage.test.js's twelveHourWindows fixtures: an explicit
  // ayConf.twelveHourWindows array, mode 'replace', over a single area.
  const ayConf = {
    twelveHourWindows: [
      { start: '2026-06-01', end: '2026-06-05', areas: ['POD'], mode: 'replace' },
    ],
  };
  const dateStr = '2026-06-01'; // Monday, inside the window
  const allResidents = [resident('r1', 'EM_HOME', 3)];
  const schedule = { r1: { [dateStr]: 'POD-D12' } };

  const out = composeCoverage({ dates: [dateStr], schedule, allResidents, coverage: {}, ayConf });

  it("the area's normal 9h ids resolve to {min:0,max:0}", () => {
    expect(out[dateStr]['POD-D']).toMatchObject({ min: 0, max: 0 });
    expect(out[dateStr]['POD-E']).toMatchObject({ min: 0, max: 0 });
    expect(out[dateStr]['POD-N']).toMatchObject({ min: 0, max: 0 });
  });

  it("the area's 12h ids come alive at DEFAULT_COVERAGE (no explicit override given)", () => {
    expect(out[dateStr]['POD-D12']).toMatchObject(DEFAULT_COVERAGE['POD-D12']);
    expect(out[dateStr]['POD-N12']).toMatchObject(DEFAULT_COVERAGE['POD-N12']);
  });

  it('an assignment onto the 12h id is still counted normally', () => {
    expect(out[dateStr]['POD-D12'].total).toBe(1);
    expect(out[dateStr]['POD-D12'].residentIds).toEqual(['r1']);
  });

  it('a DIFFERENT area (e.g. MT) is unaffected by the POD-only window', () => {
    expect(out[dateStr]['MT-D']).toMatchObject(DEFAULT_COVERAGE['MT-D']);
    expect(out[dateStr]['MT-D12']).toMatchObject({ min: 0, max: 0 }); // MT-D12 has no active window either
  });
});

describe('composeCoverage: category -> group discrimination (no isOffService flag)', () => {
  const dateStr = '2026-06-02';
  const allResidents = [
    resident('h1', 'EM_HOME', 1),
    resident('b1', 'EM_BAMC', 1),
    resident('o1', 'PEDS', 3),
    resident('o2', 'FM', 1),
  ];
  const schedule = {
    h1: { [dateStr]: 'MT-D' },
    b1: { [dateStr]: 'MT-D' },
    o1: { [dateStr]: 'MT-D' },
    o2: { [dateStr]: 'MT-D' },
  };
  const out = composeCoverage({ dates: [dateStr], schedule, allResidents, coverage: {}, ayConf: {} });

  it('EM_HOME lands in groups.home', () => {
    expect(out[dateStr]['MT-D'].groups.home).toBe(1);
  });
  it('EM_BAMC lands in groups.bamc', () => {
    expect(out[dateStr]['MT-D'].groups.bamc).toBe(1);
  });
  it('every other category (PEDS, FM, ...) lands in groups.offservice', () => {
    expect(out[dateStr]['MT-D'].groups.offservice).toBe(2);
  });
  it('total reflects all four regardless of group', () => {
    expect(out[dateStr]['MT-D'].total).toBe(4);
  });
});

describe('composeCoverage: empty/absent schedule and roster does not crash', () => {
  it('absent schedule and allResidents are treated as empty, not a crash', () => {
    const out = composeCoverage({ dates: ['2026-06-02'] });
    expect(out['2026-06-02']['POD-D']).toEqual({
      total: 0, min: DEFAULT_COVERAGE['POD-D'].min, max: 3, // Tuesday dow bump still applies
      buckets: {}, groups: { home: 0, bamc: 0, offservice: 0 }, residentIds: [],
    });
  });

  it('an empty dates array returns an empty object', () => {
    expect(composeCoverage({ dates: [], schedule: {}, allResidents: [] })).toEqual({});
  });

  it('a resident with no matching schedule entry for the date contributes nothing', () => {
    const out = composeCoverage({
      dates: ['2026-06-02'],
      schedule: { r1: { '2026-06-03': 'POD-D' } }, // wrong date
      allResidents: [resident('r1', 'EM_HOME', 1)],
      coverage: {}, ayConf: {},
    });
    expect(out['2026-06-02']['POD-D'].total).toBe(0);
  });
});
