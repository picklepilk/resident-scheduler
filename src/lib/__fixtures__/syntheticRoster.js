// src/lib/__fixtures__/syntheticRoster.js
// Committed synthetic fixture for the schedule-generator quality harness (see
// docs/plans — "Schedule Generator: Quality Harness + Best-of-N + Repair Pass", Step 3).
//
// PUBLIC REPO — every name below is a NATO phonetic-alphabet placeholder
// ("Alpha TestResident", "Bravo TestResident", ...), never a real resident. Do not replace
// with real names/rosters (see CLAUDE.md "Data model & conventions").
//
// makeFixture(variant) returns the exact shape generateSchedule() destructures:
//   { allResidents, block, coverage, eligOverrides, appSettings, dayRules, blocksHistory, ayConf }
// `allResidents` is already the POST-MERGE shape the live app builds in its own `allResidents`
// useMemo (ResidentScheduler.jsx) — EM_HOME/EM_BAMC residents carry `blockType`/`chiefRole`
// directly, off-service residents carry `availabilityMode`/`availableRanges`/`canWorkDates`
// directly — so generateSchedule/validateAll can consume it with no further merging. Category
// ids, blockType ids, and eligibility-key composition (`${category}_${pgy}`) below are read
// verbatim from src/lib/parse.js (CATEGORIES) and src/ResidentScheduler.jsx (BLOCK_TYPES_EM,
// EM_HOME_BLOCK_TYPES_BY_PGY, TRAUMA_BLOCKS, eligKey) — never invented.
//
// coverage/eligOverrides/appSettings/dayRules are left as {} on purpose: DEFAULT_COVERAGE_MINMAX/
// BASE_ELIGIBILITY/DEFAULT_DAY_RULES apply automatically when these are empty, which is exactly
// what a "standard" chief-unconfigured block looks like.
//
// Block-edge night runs (harness Step 4's "block-edge night runs" invariant): no special fixture
// support is needed for this. The block below is a full 28-day range (2026-07-06..2026-08-02)
// and its FM PGY-3 residents (Uniform/Victor) are night-only-eligible (PED-N, Mon/Tue/Wed) with
// no day-1/day-28 exclusion, and EM_HOME PGY-2/3 residents are also night-eligible on every day
// of the block including the first and last — so a harness test can freely construct/assert a
// schedule with night shifts landing on the block's first or last date using this same fixture;
// nothing here needs to change to support that case.

import { parseDate, addDays, toDateStr } from '../dates.js';

// ─── date helpers (mirrors getBlockDates' own parseDate/addDays/toDateStr walk) ──────────────
function dateRange(startStr, endStr) {
  const out = [];
  let d = parseDate(startStr);
  const last = parseDate(endStr);
  while (d <= last) { out.push(toDateStr(d)); d = addDays(d, 1); }
  return out;
}

// ─── fixed block window ────────────────────────────────────────────────────────────────────
// 2026-07-06 (Mon) .. 2026-08-02 (Sun) = 28 days (matches DEFAULT block length). Chosen
// deliberately BEFORE the 2026-08-01 EM_HOME_2 EM/EMS<->EM/TOX weekday-window swap (see
// CLAUDE.md), so pre-swap windows apply consistently: EM/EMS covers Mon/Tue, EM/TOX covers
// Thu/Fri — the shiftGates derive this automatically from blockType + block.startDate, no
// manual day assignment needed here.
const BLOCK_START = '2026-07-06';
const BLOCK_END = '2026-08-02';
const ACADEMIC_YEAR = 'AY26/27'; // getAcademicYearFor('2026-07-06') => 'AY26/27'

// First Tuesday of the block (also the first Tuesday of July 2026) — Journal Club date.
const FIRST_TUESDAY = '2026-07-07';
// EM_HOME Grand Rounds weekday = Wednesday (grWorkDow), EM_BAMC = Thursday.
const GR_WED_1 = '2026-07-15';
const GR_WED_2 = '2026-07-22';
const GR_THU_1 = '2026-07-16';
// One-week vacation window used by both the `standard` two vacationers and the
// `vacationHeavy` variant's additional overlapping vacationers.
const VACATION_WEEK = dateRange('2026-07-13', '2026-07-19');
// Jeopardy call dates (single days, unrelated to the vacation week).
const JEOPARDY_DATE_1 = '2026-07-10';
const JEOPARDY_DATE_2 = '2026-07-24';

function makeResident(overrides) {
  return {
    id: `syn_${overrides.firstName.toLowerCase()}`,
    firstName: overrides.firstName,
    lastName: 'TestResident',
    category: overrides.category,
    pgy: overrides.pgy,
    blockType: overrides.blockType ?? 'EM',
    isCCUNights: false,
    chiefRole: overrides.chiefRole ?? null,
    approvedDatesOff: [],
    vacationDates: overrides.vacationDates ?? [],
    jeopardyDates: overrides.jeopardyDates ?? [],
    jcPresentDates: overrides.jcPresentDates ?? [],
    grLectureDates: overrides.grLectureDates ?? [],
    availabilityMode: overrides.availabilityMode ?? 'full',
    availableRanges: overrides.availableRanges ?? [],
    canWorkDates: overrides.canWorkDates ?? [],
  };
}

// ─── standard ~25-resident roster ──────────────────────────────────────────────────────────
// EM_HOME PGY-1 x6 (Alpha..Foxtrot) — Alpha on a TRAUMA_PEDS-split blockType.
// EM_HOME PGY-2 x6 (Golf..Lima) — Golf on EM_TOX, Hotel on EM_EMS (shiftGate windows).
// EM_HOME PGY-3 x6 (Mike..Romeo) — Mike carries a chiefRole.
// EM_BAMC PGY-1 x2 (Sierra, Tango).
// FM PGY-3 x2 (Uniform, Victor) — night-only eligibility path (BASE_ELIGIBILITY.FM_3 = PED-N
// only, onlyDays Mon/Tue/Wed via DEFAULT_DAY_RULES.FM_3 — see isNightOnlyResident).
// Off-service x3 (Whiskey/PEDS-2, Xray/IM-2, Yankee/NEURO-1) — exercise all three
// availabilityMode paths ('full', 'ranges', 'days'). Peds is PGY-2/PGY-3 only (chief-directed
// AY26/27 restructure — see BASE_ELIGIBILITY.PEDS_2 in ResidentScheduler.jsx).
function buildStandardRoster() {
  return [
    // EM_HOME PGY-1
    makeResident({ firstName: 'Alpha', category: 'EM_HOME', pgy: 1, blockType: 'TRAUMA_PEDS' }),
    makeResident({ firstName: 'Bravo', category: 'EM_HOME', pgy: 1, vacationDates: [...VACATION_WEEK] }),
    makeResident({ firstName: 'Charlie', category: 'EM_HOME', pgy: 1, jcPresentDates: [FIRST_TUESDAY] }),
    makeResident({ firstName: 'Delta', category: 'EM_HOME', pgy: 1, grLectureDates: [GR_WED_1] }),
    makeResident({ firstName: 'Echo', category: 'EM_HOME', pgy: 1, jeopardyDates: [JEOPARDY_DATE_1] }),
    makeResident({ firstName: 'Foxtrot', category: 'EM_HOME', pgy: 1 }),
    // EM_HOME PGY-2
    makeResident({ firstName: 'Golf', category: 'EM_HOME', pgy: 2, blockType: 'EM_TOX' }),
    makeResident({ firstName: 'Hotel', category: 'EM_HOME', pgy: 2, blockType: 'EM_EMS' }),
    makeResident({ firstName: 'India', category: 'EM_HOME', pgy: 2, grLectureDates: [GR_WED_2] }),
    makeResident({ firstName: 'Juliet', category: 'EM_HOME', pgy: 2, jcPresentDates: [FIRST_TUESDAY] }),
    makeResident({ firstName: 'Kilo', category: 'EM_HOME', pgy: 2 }),
    makeResident({ firstName: 'Lima', category: 'EM_HOME', pgy: 2, vacationDates: [...VACATION_WEEK] }),
    // EM_HOME PGY-3
    makeResident({ firstName: 'Mike', category: 'EM_HOME', pgy: 3, chiefRole: 'scheduling' }),
    makeResident({ firstName: 'November', category: 'EM_HOME', pgy: 3, jcPresentDates: [FIRST_TUESDAY] }),
    makeResident({ firstName: 'Oscar', category: 'EM_HOME', pgy: 3, jeopardyDates: [JEOPARDY_DATE_2] }),
    makeResident({ firstName: 'Papa', category: 'EM_HOME', pgy: 3 }),
    makeResident({ firstName: 'Quebec', category: 'EM_HOME', pgy: 3 }),
    makeResident({ firstName: 'Romeo', category: 'EM_HOME', pgy: 3 }),
    // EM_BAMC PGY-1
    makeResident({ firstName: 'Sierra', category: 'EM_BAMC', pgy: 1, grLectureDates: [GR_THU_1] }),
    makeResident({ firstName: 'Tango', category: 'EM_BAMC', pgy: 1 }),
    // FM PGY-3 (night-only)
    makeResident({ firstName: 'Uniform', category: 'FM', pgy: 3 }),
    makeResident({ firstName: 'Victor', category: 'FM', pgy: 3 }),
    // Off-service (non-persistent categories, mirrors block.offServiceResidents entries)
    makeResident({ firstName: 'Whiskey', category: 'PEDS', pgy: 2, availabilityMode: 'full' }),
    makeResident({
      firstName: 'Xray', category: 'IM', pgy: 2, availabilityMode: 'ranges',
      availableRanges: [{ start: '2026-07-20', end: BLOCK_END }],
    }),
    makeResident({
      firstName: 'Yankee', category: 'NEURO', pgy: 1, availabilityMode: 'days',
      canWorkDates: dateRange(BLOCK_START, BLOCK_END).filter(ds => [1, 3, 5].includes(parseDate(ds).getDay())),
    }),
  ];
}

// `understaffed`: same roster minus 6 (the residents with no special date-chip data, so the
// vacation/JC/GR/jeopardy coverage above stays intact) — at least one resident survives per
// category/PGY tier (EM_HOME 1/2/3, EM_BAMC-1, FM-3, off-service).
const UNDERSTAFFED_REMOVE = new Set(['syn_foxtrot', 'syn_kilo', 'syn_papa', 'syn_tango', 'syn_victor', 'syn_yankee']);

// `vacationHeavy`: 6 more residents (beyond the standard 2) get the same overlapping
// VACATION_WEEK added, for ~8 total residents out during that week.
const VACATION_HEAVY_ADD = new Set(['syn_alpha', 'syn_charlie', 'syn_golf', 'syn_hotel', 'syn_mike', 'syn_sierra']);

function makeDefaultAppSettings() {
  return {};
}

function makeBlock(variant) {
  return {
    id: `blk_fixture_${variant}`,
    name: `Synthetic Fixture — ${variant}`,
    academicYear: ACADEMIC_YEAR,
    startDate: BLOCK_START,
    endDate: BLOCK_END,
    // Intentionally NOT populated: generateSchedule()/validateAll() consume `allResidents`
    // directly (already the merged shape — see file header), never rebuild it from
    // emBlockAssignments/offServiceResidents, so those stay empty here.
    emBlockAssignments: {},
    offServiceResidents: [],
    schedule: {},
    specialDays: { codeBlueDays: [], procDays: [], anesDays: [] },
    conferences: { acepStart: '', acepEnd: '', iteDate: '', aaemStart: '', aaemEnd: '', saemStart: '', saemEnd: '' },
  };
}

/**
 * @param {'standard'|'understaffed'|'vacationHeavy'} variant
 * @returns {{allResidents:object[], block:object, coverage:object, eligOverrides:object,
 *   appSettings:object, dayRules:object, blocksHistory:object[], ayConf:object}}
 */
export function makeFixture(variant = 'standard') {
  let allResidents = buildStandardRoster();

  if (variant === 'understaffed') {
    allResidents = allResidents.filter(r => !UNDERSTAFFED_REMOVE.has(r.id));
  } else if (variant === 'vacationHeavy') {
    allResidents = allResidents.map(r =>
      VACATION_HEAVY_ADD.has(r.id)
        ? { ...r, vacationDates: [...new Set([...r.vacationDates, ...VACATION_WEEK])].sort() }
        : r
    );
  } else if (variant !== 'standard') {
    throw new Error(`makeFixture: unknown variant "${variant}"`);
  }

  return {
    allResidents,
    block: makeBlock(variant),
    coverage: {},
    eligOverrides: {},
    appSettings: makeDefaultAppSettings(),
    dayRules: {},
    blocksHistory: [],
    ayConf: {},
  };
}
