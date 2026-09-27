// src/lib/podPgy2Substitute.test.js
// R5 (2026-09-27 chief decision, memory rule-override-policy): "During those rare instances [PGY-3s
// at conference or on Wellness day] they should be replaced with a PGY-2." POD's hard PGY-3
// requirement (SENIOR_COMPOSITION.POD, see ResidentScheduler.jsx) already accepts that substitute via
// compositionSatisfies/seniorWellnessSubstituteAllowed — this file covers the NEW pieces layered on
// top: pool-narrowing that always prefers a genuine PGY-3 when one is actually available, the
// informational (never blocking) podPgy2Substitute validateAll warn, and the generator's
// report.podSubstitutes[] log. Mirrors emCompositionAndPgyGating.test.js's own hand-built-resident/
// fixed-block pattern (same file's Wellness-Wednesday date constants) rather than reinventing one.
import { describe, it, expect } from 'vitest';
import { validateAll, generateSchedule, generateScheduleBest, getEligibleShifts } from '../ResidentScheduler.jsx';
import { mulberry32 } from './rng.js';
import { makeFixture } from './__fixtures__/syntheticRoster.js';

function res(overrides) {
  return {
    id: overrides.id, firstName: overrides.firstName ?? 'Test', lastName: 'Resident',
    category: overrides.category, pgy: overrides.pgy,
    blockType: overrides.blockType, chiefRole: overrides.chiefRole ?? null,
    approvedDatesOff: [], vacationDates: [], jeopardyDates: [], jcPresentDates: [], grLectureDates: [],
  };
}

// Same fixed block window as seniorityTargets.test.js/emCompositionAndPgyGating.test.js — 1st Wed on
// or after start = 2026-07-08, 2nd (FLEX's own WW) = 2026-07-15, 3rd (POD's own WW) = 2026-07-22.
const block = { id: 'blk_test', startDate: '2026-07-06', endDate: '2026-08-02', academicYear: 'AY26/27', specialDays: {} };
const POD_WW = '2026-07-22';
const ORDINARY_DAY = '2026-07-09'; // Thursday — not exempt, not Wellness Wednesday; inside ACEP_CONF below
const NON_CONFERENCE_DAY = '2026-07-13'; // Monday — clear of both ACEP_CONF and POD_WW
// Thu-Fri, deliberately clear of POD_WW (2026-07-22) so 'conference' and 'wellness' reasons stay
// unambiguous in these tests (a real block CAN have both land on the same date — see
// substituteReasonFor's own comment on that overlap — just not exercised here).
const ACEP_CONF = { acepStart: '2026-07-09', acepEnd: '2026-07-10' };

function issuesFor(allResidents, schedule, ayConf = {}) {
  return validateAll(allResidents, schedule, block, {}, {}, {}, {}, [], ayConf);
}

describe('R5: POD PGY-2 substitute for an unavailable PGY-3 — validateAll', () => {
  it('conference date, no PGY-3 anywhere: EM PGY-2 alone on POD gets the info warn, not the hard error', () => {
    const pgy2 = res({ id: 'p2', category: 'EM_HOME', pgy: 2 });
    const schedule = { p2: { [ORDINARY_DAY]: 'POD-D' } };
    const issues = issuesFor([pgy2], schedule, ACEP_CONF);
    expect(issues.filter(i => i.rule === 'podPgy3Composition')).toEqual([]);
    const infoWarns = issues.filter(i => i.rule === 'podPgy2Substitute');
    expect(infoWarns).toHaveLength(1);
    expect(infoWarns[0]).toMatchObject({ dateStr: ORDINARY_DAY, shiftId: 'POD-D', level: 'warn' });
    expect(infoWarns[0].message).toContain('conference');
  });

  it("POD's own Wellness Wednesday, no PGY-3 anywhere: the info warn's reason is 'wellness' (POD-N, not POD-D — day shifts are Grand-Rounds-exempt on every Wednesday regardless of Wellness Wednesday, see seniorCompositionExempt)", () => {
    const pgy2 = res({ id: 'p2', category: 'EM_HOME', pgy: 2 });
    const schedule = { p2: { [POD_WW]: 'POD-N' } };
    const issues = issuesFor([pgy2], schedule);
    const infoWarns = issues.filter(i => i.rule === 'podPgy2Substitute');
    expect(infoWarns).toHaveLength(1);
    expect(infoWarns[0].message).toContain('wellness');
  });

  it('conference date, a PGY-3 IS present and covers the shift: no info warn at all (nothing to flag)', () => {
    const pgy3 = res({ id: 'p3', category: 'EM_HOME', pgy: 3 });
    const schedule = { p3: { [ORDINARY_DAY]: 'POD-D' } };
    const issues = issuesFor([pgy3], schedule, ACEP_CONF);
    expect(issues.filter(i => i.rule === 'podPgy2Substitute')).toEqual([]);
    expect(issues.filter(i => i.rule === 'podPgy3Composition')).toEqual([]);
  });

  it('non-conference, non-Wellness-Wednesday date: EM PGY-2 alone on POD still gets the unchanged podPgy3Composition warning (override tier — export-blocking, per b4f1d70), never the info warn', () => {
    const pgy2 = res({ id: 'p2', category: 'EM_HOME', pgy: 2 });
    const schedule = { p2: { [NON_CONFERENCE_DAY]: 'POD-D' } };
    const issues = issuesFor([pgy2], schedule, ACEP_CONF); // ayConf configured, but this date sits outside its window
    const compIssues = issues.filter(i => i.rule === 'podPgy3Composition');
    expect(compIssues).toHaveLength(1);
    expect(compIssues[0].level).toBe('warn'); // override tier => 'warn' (see rulePolicy.js), still export-blocking
    expect(issues.filter(i => i.rule === 'podPgy2Substitute')).toEqual([]);
  });
});

// Every EM Home PGY-3 who could legally have taken `shiftId` on `dateStr` (rotation/day-rule
// eligible AND not already committed to something else that day) was, in fact, unavailable —
// the exact condition R5's directive requires before the generator may fall back to a PGY-2.
function noPgy3WasAvailable(allResidents, schedule, dateStr, shiftId, blockForCtx) {
  const pgy3s = allResidents.filter(r => r.category === 'EM_HOME' && r.pgy === 3);
  return pgy3s.every(r => {
    if (schedule[r.id]?.[dateStr]) return true; // already working something else that day
    const elig = getEligibleShifts(r, dateStr, blockForCtx.specialDays || {}, {}, {}, {}, { blockStart: blockForCtx.startDate });
    return !elig.includes(shiftId);
  });
}

describe('R5: POD PGY-2 substitute — generator behavior (conferenceBlock fixture, ACEP 07-20..07-23)', () => {
  // repair:true (the real generateScheduleBest default) is required here: the true-primary
  // preference is enforced by repairPass's own dedicated phase, run once on the winning attempt —
  // NOT inside fillDayPass's own hot loop, which only ever applies compositionSatisfies (allowing
  // the substitute, never preferring the primary over it) — see that branch's own comment for why
  // (score()'s `+ rng()` jitter term made in-loop narrowing destabilize which of
  // generateScheduleBest's 20 attempts wins, regressing the chief-benchmark fixture). A bare
  // generateSchedule({repair:false}) call is documented throughout this codebase as the raw,
  // unrepaired view — same posture as Phase 1's unfilled-slot fixes and Phase 2's rest-compromise
  // fixes, both also repair-only.
  it('with ample PGY-3 supply (6 real PGY-3s), any recorded substitute happened only because no PGY-3 was actually available for that exact slot', () => {
    for (const baseSeed of [1, 2, 3]) {
      const fx = makeFixture('conferenceBlock');
      const { schedule, report } = generateSchedule({ ...fx, rng: mulberry32(baseSeed), repair: true });
      for (const sub of report.podSubstitutes) {
        expect(
          noPgy3WasAvailable(fx.allResidents, schedule, sub.dateStr, sub.shiftId, fx.block),
          `seed ${baseSeed} ${sub.dateStr}/${sub.shiftId}: a PGY-3 was actually free for this slot`
        ).toBe(true);
      }
    }
  });

  it('with near-zero PGY-3 supply (a single PGY-3 across the whole block), the ACEP-window POD substitute path is reachable, every entry is a genuine no-PGY-3-available case, and none leaves a surviving hard composition warning on that exact shift/date', () => {
    const fx = makeFixture('conferenceBlock');
    const keepPgy3Id = fx.allResidents.find(r => r.category === 'EM_HOME' && r.pgy === 3)?.id;
    const allResidents = fx.allResidents.map(r =>
      (r.category === 'EM_HOME' && r.pgy === 3 && r.id !== keepPgy3Id)
        ? { ...r, category: 'ANES', pgy: null, blockType: null }
        : r
    );
    const seeds = [1, 2, 3, 4, 5];
    let totalSubs = 0;
    for (const seed of seeds) {
      const { schedule, report } = generateSchedule({ ...fx, allResidents, rng: mulberry32(seed), repair: true });
      expect(Array.isArray(report.podSubstitutes)).toBe(true);
      totalSubs += report.podSubstitutes.length;
      const issues = validateAll(allResidents, schedule, fx.block, {}, fx.appSettings, {}, {}, [], fx.ayConf);
      const compIssueKeys = new Set(issues.filter(i => i.rule === 'podPgy3Composition').map(i => `${i.dateStr}|${i.shiftId}`));
      for (const sub of report.podSubstitutes) {
        expect(['conference', 'wellness']).toContain(sub.reason);
        expect(noPgy3WasAvailable(allResidents, schedule, sub.dateStr, sub.shiftId, fx.block), `seed ${seed} ${sub.dateStr}/${sub.shiftId}`).toBe(true);
        expect(compIssueKeys.has(`${sub.dateStr}|${sub.shiftId}`), `seed ${seed} ${sub.dateStr}/${sub.shiftId} still has a hard composition warning`).toBe(false);
      }
    }
    expect(totalSubs).toBeGreaterThan(0);
  });
});

// R5 gap fix (2026-09-27, this same session): generateScheduleBest keeps a repaired attempt only
// when betterQuality(repairedScore, best.score) is STRICTLY better (ResidentScheduler.jsx
// ~generateScheduleBest). Phase 3b's true-primary swap has no slot in that lexicographic comparison
// (podPgy2Substitute is a plain, non-blocking info warn), so whenever Phases 1-5 don't ALSO improve
// the score, the whole repaired attempt — Phase 3b's fix included — was silently discarded, and
// `best` reverted to the never-repaired attempt from the 20-attempt loop, which never ran Phase 3b
// at all. Fixed by applying Phase 3b as a final, always-attempted step (repair:'truePrimaryOnly')
// independent of that keep/discard decision.
//
// Exhaustive empirical search (2500+ generateSchedule/generateScheduleBest trials across the
// conferenceBlock and real chief-benchmark fixtures, varying PGY-3 supply from 1 to 6 and
// engineering resident targetDelta to bias score()'s dominant deficit term) never found a seed
// where score() picks a fallback PGY-2 over a true PGY-3 who both satisfies composition AND is
// genuinely free (unassigned + eligible) that exact date — score()'s existing seniorAdj term (+20,
// see SCORE_WEIGHTS) for an unfilled composition requirement is strong enough that this precondition
// for Phase 3b to have any real work to do essentially never arises on realistic data. That's a
// separate, positive finding about score()'s existing robustness — it does NOT mean the
// keep/discard gap is unreal: betterQuality's lexicographic ladder genuinely has no slot for this
// rule, so a fix landing on a day where the schedule already can't be scored higher any other way
// remains a live risk this covers defensively.
//
// The tests below verify the actual FIX mechanism deterministically (no seed search needed) by
// constructing a schedule where a fallback PGY-2 covers a composition-critical POD slot for a
// legitimate reason (the sole PGY-3, "Papa", is temporarily eligibility-excluded from POD entirely
// while that schedule is built — a real generateSchedule output, not hand-authored) and then
// restoring Papa's normal POD eligibility to confirm generateSchedule's own repair machinery
// recognizes and fixes the now-fixable substitute.
describe('R5 gap fix: true-primary preference survives generateScheduleBest\'s keep/discard gate', () => {
  const TEST_DATE = '2026-07-21'; // single-day "conference" window, configured below
  const REMOVED_FROM_EM_HOME_3 = [
    'PED-D','PED-E','PED-N','PED-S','FLEX-D','FLEX-E','FLEX-N','MT-D','MT-E','MT-N','TRAUMA-N',
    'POD-N','POD-E','POD-N12','PED-D12','PED-N12','FLEX-D12','FLEX-N12','MT-D12','MT-N12',
  ];
  // Isolates the ambiguity to exactly one composition-critical (shift, date) pair — POD-D12 on
  // TEST_DATE — so the outcome can only ever be "Papa" (the sole remaining PGY-3, restricted to
  // POD-D/POD-D12 only so nothing else can pull him away that day) or a PGY-2 fallback, never a
  // supply/demand artifact from multiple simultaneous composition slots (a real risk with the
  // fixture's own multi-day/multi-shift ACEP window — see this file's other describe block).
  // `excludePapaFromPod`, when true, additionally removes POD-D/POD-D12 themselves, so Papa cannot
  // cover the slot at all — used only to construct the "fallback legitimately in place" starting
  // schedule below, never to assert anything about a real substitute.
  function buildIsolatedFixture({ excludePapaFromPod }) {
    const fx0 = makeFixture('conferenceBlock');
    const allResidents = fx0.allResidents.map(r =>
      (r.category === 'EM_HOME' && r.pgy === 3 && r.id !== 'syn_papa')
        ? { ...r, category: 'ANES', pgy: null, blockType: null }
        : r
    );
    // Pre-existing (kept/manual) shifts on OTHER dates only — gives Papa a real, moderate, positive
    // shift-target deficit on TEST_DATE (not zero/negative, which would exclude him from
    // candidatePool as already-at-target) without ever touching TEST_DATE itself.
    const papaPrefill = ['2026-07-06','2026-07-08','2026-07-10','2026-07-13','2026-07-15','2026-07-17','2026-07-24','2026-07-27','2026-07-29','2026-07-31'];
    const schedule = { syn_papa: Object.fromEntries(papaPrefill.map(ds => [ds, 'POD-D'])) };
    const block = { ...fx0.block, schedule };
    const removed = excludePapaFromPod ? [...REMOVED_FROM_EM_HOME_3, 'POD-D', 'POD-D12'] : REMOVED_FROM_EM_HOME_3;
    const eligOverrides = { EM_HOME_3: { added: [], removed } };
    const ayConf = { acepStart: TEST_DATE, acepEnd: TEST_DATE }; // single-day ACEP window
    const coverage = { 'POD-N12': { min: 0, max: 0 } }; // suppress POD's OTHER 12h composition slot
    return { ...fx0, allResidents, block, eligOverrides, ayConf, coverage };
  }

  it('repair:"truePrimaryOnly" (preferTruePrimaryPass) swaps a fallback out for the true primary when one is genuinely available — the exact mechanism generateScheduleBest\'s gap fix relies on', () => {
    // Construct the "fallback legitimately in place" schedule: a REAL generateSchedule output
    // (not hand-authored) built with Papa excluded from POD entirely.
    const excludedFx = buildIsolatedFixture({ excludePapaFromPod: true });
    const preState = generateSchedule({ ...excludedFx, rng: mulberry32(1), repair: true });
    const fallback = excludedFx.allResidents.find(r => preState.schedule[r.id]?.[TEST_DATE] === 'POD-D12');
    expect(fallback, 'setup sanity: some fallback must cover POD-D12 while Papa is excluded from POD').toBeTruthy();
    expect(fallback.category).toBe('EM_HOME');
    expect(fallback.pgy).toBe(2);

    // Restore Papa's normal POD eligibility and replay ONLY Phase 3b on top of that exact schedule.
    // `keptCellsOverride: new Set()` marks every cell as generator-owned rather than a chief's
    // manual entry — see generateSchedule's own header comment on truePrimaryOnlyMode for why that
    // override exists (without it, the fallback's cell would read as "kept" purely because it came
    // in via `block.schedule`, and Phase 3b would correctly refuse to touch it).
    const normalFx = buildIsolatedFixture({ excludePapaFromPod: false });
    const fixed = generateSchedule({
      ...normalFx,
      block: { ...normalFx.block, schedule: preState.schedule },
      rng: mulberry32(1),
      repair: 'truePrimaryOnly',
      keptCellsOverride: new Set(),
    });
    const tpFix = fixed.report.repairs.find(r => r.type === 'preferTruePrimary' && r.dateStr === TEST_DATE);
    expect(tpFix, 'Phase 3b should have swapped the fallback out for Papa').toBeTruthy();
    expect(tpFix.withResidentId).toBe('syn_papa');
    expect(tpFix.replacedResidentId).toBe(fallback.id);
    expect(fixed.schedule.syn_papa[TEST_DATE]).toBe('POD-D12');
    expect(fixed.schedule[fallback.id][TEST_DATE]).toBeFalsy();
  });

  it('generateScheduleBest end-to-end: a free true primary reliably covers POD over a fallback (20 seeds)', () => {
    const fx = buildIsolatedFixture({ excludePapaFromPod: false });
    for (let baseSeed = 1; baseSeed <= 20; baseSeed++) {
      const res = generateScheduleBest(fx, { attempts: 1, baseSeed });
      expect(res.schedule.syn_papa[TEST_DATE], `seed ${baseSeed}`).toBe('POD-D12');
      expect(res.report.podSubstitutes.filter(s => s.dateStr === TEST_DATE), `seed ${baseSeed}`).toEqual([]);
    }
  });

  // Reviewer finding (this session): generateScheduleBest's header comment (and CLAUDE.md's
  // Generator bullet) claimed a winner is always reproducible via a single
  // `generateSchedule({...args, rng: mulberry32(report.seed)})` replay — false whenever Phase 3b's
  // true-primary fix (report.truePrimaryFixApplied) was applied AFTER the full-repair attempt lost
  // the keep/discard gate, since the persisted seed then only replays the PRE-fix schedule. Fixed by
  // recording the exact replay recipe on `report.replay` and updating both comments.
  //
  // This fixture is the file's own known reproduction of preferTruePrimaryPass having real work to
  // do (see the describe block's header above), so it's used here rather than the plain synthetic
  // fixture. It does NOT reliably drive generateScheduleBest's OUTER keep/discard gate into
  // rejecting full repair, though — an empirical scan of 260 seeds across both this fixture (attempts
  // 1 and 20) found `truePrimaryFixApplied` false every time: whenever repairPass is adopted at all,
  // its own embedded Phase 3b call already performs the exact same swap, leaving nothing for the
  // final standalone pass to find. This mirrors 0e19a7f's own finding that the keep/discard gap is a
  // real, provable code path (see the `repair:"truePrimaryOnly"` test right above, which exercises
  // that exact swap directly) but not one seed search reliably reaches — hence asserting the field's
  // presence/shape and that replay reproduces the schedule for whichever branch this run actually
  // took, rather than requiring the true-primary-only branch specifically.
  it("report.replay records the correct replay recipe, and following it reproduces the winning schedule bit-for-bit", () => {
    const fx = buildIsolatedFixture({ excludePapaFromPod: false });
    let sawTruePrimaryOnly = false;
    for (let baseSeed = 1; baseSeed <= 20; baseSeed++) {
      const res = generateScheduleBest(fx, { attempts: 1, baseSeed });
      expect(res.report.replay, `seed ${baseSeed}`).toBeTruthy();
      expect(res.report.replay.seed).toBe(res.report.seed);
      expect(typeof res.report.replay.truePrimaryOnly).toBe('boolean');
      expect(res.report.replay.truePrimaryOnly).toBe(!!res.report.truePrimaryFixApplied);

      let replaySchedule;
      if (!res.report.replay.truePrimaryOnly) {
        // Single-step replay contract: unchanged from before this fix.
        replaySchedule = generateSchedule({ ...fx, rng: mulberry32(res.report.replay.seed), repair: true }).schedule;
      } else {
        sawTruePrimaryOnly = true;
        // Two-step replay contract (the fix under test): step 1 reproduces the pre-fix winner...
        const base = generateSchedule({ ...fx, rng: mulberry32(res.report.replay.seed), repair: false });
        const trueKeptCells = new Set();
        for (const r of fx.allResidents) {
          for (const [ds, sid] of Object.entries(fx.block.schedule?.[r.id] || {})) {
            if (sid) trueKeptCells.add(`${r.id}|${ds}`);
          }
        }
        // ...step 2 replays Phase 3b alone on top of it, exactly as generateScheduleBest's own
        // gap-fix block does.
        replaySchedule = generateSchedule({
          ...fx,
          block: { ...fx.block, schedule: base.schedule },
          rng: mulberry32(res.report.replay.seed),
          repair: 'truePrimaryOnly',
          keptCellsOverride: trueKeptCells,
        }).schedule;
      }
      expect(replaySchedule, `seed ${baseSeed}`).toEqual(res.schedule);
    }
    // Not asserted true (see this test's header comment) — logged for visibility if a future
    // fixture/seed change happens to hit the two-step path, without making the test flaky either way.
    // eslint-disable-next-line no-console
    if (sawTruePrimaryOnly) console.log('[replay recipe] two-step branch exercised at least once');
  });
});
