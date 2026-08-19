// src/lib/coverageComposition.js
// Pure aggregation for the "Department Coverage" view: for each date+shift, WHO is covering it,
// broken down by category/PGY and by coarse group (home / bamc / offservice) -- not just HOW MANY
// (that's computeCoverageByDate in ResidentScheduler.jsx:306-333, which this module deliberately
// does not replace or reimplement wholesale; it reuses the same two guards so the two views can
// never disagree about which shift-rows exist on a date or what a 12h window does to coverage).
//
// Why this lives in src/lib/, not ResidentScheduler.jsx:
//   1. Testability: this file is a named-export, side-effect-free module with a small, explicit
//      pure function -- exactly the pattern src/lib/coverage.js, src/lib/scheduleQuality.js etc.
//      already use so vitest can exercise the scheduling core without mounting the ~8,300-line
//      component. See CLAUDE.md's "Generator quality harness" section for the established
//      convention this follows.
//   2. Import direction: ResidentScheduler.jsx imports FROM src/lib/*, never the other way --
//      importing it back into a lib module would be circular. This file therefore imports ONLY
//      from other src/lib/* modules (shifts.js, parse.js, coverage.js, dates.js), never from
//      ResidentScheduler.jsx. Do not add such an import here.
//
// Two non-obvious guards, copied verbatim in spirit from computeCoverageByDate
// (ResidentScheduler.jsx:306-333) -- get either wrong and the Department Coverage view renders
// phantom columns or phantom minimums:
//   - SHIFT_DOW: a shift id present in that map only exists on the listed weekdays (today, only
//     PED-S, Mon/Tue/Thu/Fri). A date whose weekday isn't listed must not produce an entry for
//     that shift at all -- not a zeroed one, an ABSENT one -- or the UI grows a column for a shift
//     that structurally cannot be worked that day.
//   - twelveHourStateFor: MUST be resolved once per date and passed as getCoverageFor's 4th
//     argument. Passing `undefined` there is read by getCoverageFor as "caller has no date
//     context" and falls through to plain DEFAULT_COVERAGE lookups for every 12h shift id --
//     which makes every 12-hour shift's non-zero minimum look "required" on every single date,
//     even ones with no 12h window active at all. See src/lib/coverage.js:173-177's own comment
//     on twelveHourStateFor, and getCoverageFor's state-parameter contract just above its
//     definition, for the incident this caused elsewhere in the app.

import { SHIFTS, SHIFT_DOW } from './shifts.js';
import { CAT_MAP } from './parse.js';
import { getCoverageFor, twelveHourStateFor } from './coverage.js';
import { parseDate } from './dates.js';

// Coarse category grouping used by the view's summary columns. Every category not EM_HOME or
// EM_BAMC is lumped into 'offservice' -- there is no isOffService flag on a resident; category id
// is the only discriminator.
export const COVERAGE_GROUPS = ['home', 'bamc', 'offservice'];

function groupForCategory(categoryId) {
  if (categoryId === 'EM_HOME') return 'home';
  if (categoryId === 'EM_BAMC') return 'bamc';
  return 'offservice';
}

// 'EM_HOME_2' -> 'EM-H PGY-2', via CAT_MAP[...].shortLabel. Bucket keys are built as
// `${category}_${pgy}` (see composeCoverage below); category ids themselves may contain
// underscores (EM_HOME, EM_BAMC), so this splits on the LAST underscore, not the first, to
// recover the category id correctly.
export function bucketLabel(bucketKey) {
  const idx = String(bucketKey ?? '').lastIndexOf('_');
  if (idx === -1) return String(bucketKey ?? '');
  const catId = bucketKey.slice(0, idx);
  const pgy = bucketKey.slice(idx + 1);
  const cat = CAT_MAP[catId];
  if (!cat) return bucketKey;
  return `${cat.shortLabel} PGY-${pgy}`;
}

// Builds, for every date in `dates`, every shift's headcount broken down by who's covering it.
// - dates: string[] of 'YYYY-MM-DD'
// - schedule: { [residentId]: { [dateStr]: shiftId } } -- same shape as block.schedule. Missing
//   or undefined is treated as no assignments at all (never crashes).
// - allResidents: array of { id, category, pgy, ... } -- the single source of truth for who
//   COULD be assigned; residentIds/buckets/groups are derived by scanning this list against
//   `schedule`, mirroring computeCoverageByDate's own approach, so an id typo'd into `schedule`
//   that doesn't match any roster resident is silently never counted (consistent with the
//   existing coverage footer, not a new failure mode this module introduces).
// - coverage: chief's sparse coverage override object (res_coverage shape), or {}.
// - ayConf: the AY's config object (twelveHourWindows / legacy conference dates), or undefined.
export function composeCoverage({ dates, schedule, allResidents, coverage, ayConf }) {
  const sched = schedule || {};
  const residents = allResidents || [];
  const cov = coverage || {};
  const result = {};

  for (const ds of dates || []) {
    const dow = parseDate(ds).getDay();
    // Resolved ONCE per date, per the guard above -- never leave this undefined for a real date.
    const conf12 = twelveHourStateFor(ds, ayConf || {});
    const byShift = {};

    for (const s of SHIFTS) {
      if (SHIFT_DOW[s.id] && !SHIFT_DOW[s.id].includes(dow)) continue; // shift doesn't exist today

      const { min, max } = getCoverageFor(s.id, cov, dow, conf12);
      const buckets = {};
      const groups = { home: 0, bamc: 0, offservice: 0 };
      const residentIds = [];

      for (const r of residents) {
        if (sched[r.id]?.[ds] !== s.id) continue;
        residentIds.push(r.id);
        const bucketKey = `${r.category}_${r.pgy}`;
        buckets[bucketKey] = (buckets[bucketKey] || 0) + 1;
        groups[groupForCategory(r.category)] += 1;
      }

      byShift[s.id] = { total: residentIds.length, min, max, buckets, groups, residentIds };
    }

    result[ds] = byShift;
  }

  return result;
}
