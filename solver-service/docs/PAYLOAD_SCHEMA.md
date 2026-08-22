# Solver Payload Schema v1

Contract between the React app (`buildSolverPayload`/`mapSolverResult` in `src/ResidentScheduler.jsx`)
and the CP-SAT solver service (`solver-service/`). All policy resolution happens **in JS** — the
solver receives resolved sets/numbers and never re-implements eligibility/day-rule/coverage logic.
Rule ids below reference the registry in the approved plan
(`~/.claude/plans/refactor-this-app-s-scheduling-stateless-locket.md` §1).

**Batch 2 (2026-08-22, "Confirmed rule changes" A–C of that plan)** added five OPTIONAL top-level
request fields — `traumaNightShiftIds`, `pedsSplitInternIds`, `pedsNightShiftIds`,
`pedsInternNightTarget`, `alternationExemptDates` (documented inline in the request shape below).
Payload `version` stays `1`: every field defaults to empty/zero, and every constraint/objective term
that consumes it (`solver/model/trauma_runs.py`) is a documented no-op under that default, so an
older JS build that never sends them behaves byte-for-byte as before.

**Round 2b (items 2b-1/2b-2 of the same plan)** added three more OPTIONAL top-level request fields
— `emResidentIds`, `emPgy2ResidentIds`, `emPgy3ResidentIds` (documented inline below). Same
posture: `version` stays `1`, every field defaults to empty, and both term families that consume
them (`solver/model/em_composition.py`) are documented no-ops under those defaults. Unlike batch 2's
hard rules, EM-count composition and PGY gating are soft everywhere on the JS side too — see rules
49–50 below and `em_composition.py`'s own module docstring for why both become pure objective cost
terms here rather than pool restrictions (CP-SAT has no equivalent to "restrict the pool, but only
if a fallback exists").

Division of labor:

| Resolved in JS (shipped as data) | Derived in Python (from shipped timing/type tables) |
|---|---|
| Eligibility sets per (resident, date) — rules 1–13 | Rest forbidden pairs (rule 17) from `shifts` timing |
| Coverage min/max per (shift, date) — rules 24–25, incl. DOW + 12h windows | Circadian eve↔day forbidden pairs (rule 18) from `type` |
| Senior primary sets per (shift, date) — rule 16 incl. all 3 carve-outs | Night-run windows / segments (rules 18, 22, 23) |
| Obligation flags (GR/JC days) — rule 19 inputs | 6-consecutive-workday windows + post-run-6 24h rest (rules 19–20) |
| Targets, caps, JC budgets, half-split date ranges — rules 26–31 | 320h rolling window (rule 21) using `priorTailHours` |
| Locked/kept cells — rule 14 | postNightRest soft pairs (rule 34) |
| Fairness cohorts + AY carryover constants — rule 35 | Weekend (Sat+Sun) pairs from date DOW (rule 38) |
| Preference bonus tuples — rule 42 | Night clustering / work shape sequences (rules 36–37) |
| EM/PGY-2/PGY-3 resident id lists — rules 49–50 | EM headcount + PGY-gated headcount per (shift, date), reified from those id lists |

## Request — `POST /solve`

```jsonc
{
  "version": 1,
  "config": {
    "maxTimeSeconds": 30,            // per solve pass
    "numWorkers": 8,
    "randomSeed": 42,
    "coverageMinMode": "elastic_always",  // or "hard_then_elastic" (strict two-pass)
    "maxVerificationResolves": 2,
    "weights": {}                    // optional per-term overrides of config/default_weights.json (same keys)
  },

  "block": {
    "startDate": "2026-07-06",       // all dates are "YYYY-MM-DD" strings
    "endDate": "2026-08-02",         // inclusive
    "dates": ["2026-07-06", "..."]   // explicit ordered list, authoritative
  },

  // Shift catalog. Timing is the single source of truth for all Python-side
  // temporal math (rest gaps, circadian pairs, cross-midnight ends, hours).
  "shifts": {
    "POD-D": { "startH": 7, "durationH": 9, "type": "day", "area": "POD" },
    "PED-N": { "startH": 19, "durationH": 9, "type": "night", "area": "PED" }
    // type ∈ day | eve | night | swing. isNight = (type === 'night').
  },

  "residents": [
    {
      "id": "r_abc",                 // opaque id — resident NAMES NEVER appear in the payload
      "cohort": "EM_HOME_1",         // fairness grouping key (CATEGORY_PGY); cohorts with <2 members skip spread terms
      "target": 20,                  // null = self-cover: no target ceiling, excluded from deficit/fairness terms
      "isEmCore": true,              // EM_HOME/EM_BAMC → under-target weighted at exportBlocking tier (rule 33)
      "isIntern": false,             // EM PGY-1 (Home or BAMC) — rule 41
      "nightExempt": false,          // isNightOnlyResident: exempt from rules 22 (max 6 nights) and short-run penalties
      "caps": {
        "nights": 6,                 // rule 22 (ignored when nightExempt)
        "trauma": 2,                 // rule 26; null = no cap
        "jcRemaining": 3,            // rule 28: 3 − prior published-block JC count; null = not subject
        "bamcWedNights": 1,          // rule 27; null = not subject
        "pedsMixMax": 12,            // rule 29; null = not subject
        "pedsMixMin": 10,            // rule 39 (soft); null = not subject
        "fm1PedsMax": 5              // rule 40 (soft ceiling ceil(target/3)); null = not subject
      },
      "traumaPedsSplit": {           // rule 30; null for everyone else
        "traumaDates": ["2026-07-06", "..."],  // dates belonging to the trauma half
        "pedsDates":   ["2026-07-20", "..."],
        "traumaCap": 8, "pedsCap": 11
        // trauma half counts assignments to TRAUMA-area shifts on traumaDates;
        // peds half counts PED-area shifts on pedsDates. Eligibility sets already
        // restrict WHICH shifts are allowed on each half — solver only enforces counts.
      },
      "priorTail": { "2026-07-01": "MT-N" },  // last ≤14 days of previous block; constants for
                                              // window constraints (rules 18-23). May be {}.
      "priorTailObligations": ["2026-07-02"], // GR/JC obligation days in the tail window (workday constants)
      "priorTailHours": 36,          // Σ durationH of tail shifts inside any 28d window overlapping
                                     // this block (rule 21 constant offset)
      "ayPrior": {                   // AY carryover constants for fairness (rule 35); zeros when no history
        "nights": 4, "weekends": 6, "holidays": 1
      }
    }
  ],

  // rules 1-13 pre-applied. A missing date key = nothing eligible that day.
  // Only shift ids that exist that weekday appear (SHIFT_DOW pre-applied).
  "eligible": { "r_abc": { "2026-07-06": ["POD-D", "POD-E", "MT-D"] } },

  // rule 19: dates that count as workdays even with no shift (own GR weekday, JC presenting),
  // already suppressed where vacation/approved-off. Sparse: only true entries listed.
  "obligations": { "r_abc": ["2026-07-08", "2026-07-15"] },

  // rule 14: fixed assignments (manual/kept cells + lockedCells). Solver adds x==1.
  // The caller guarantees every locked shiftId is present in that (r,d) eligible set
  // OR the solver must accept it anyway (locked wins; create the var on demand).
  "locked": [ { "residentId": "r_abc", "date": "2026-07-06", "shiftId": "POD-D" } ],

  // rules 24-25 resolved per date (DOW overrides, 12h windows, trauma max-1 clamp all applied).
  // A shift id absent for a date = does not run that date (min 0 / max 0) — create no vars.
  "coverage": { "POD-D": { "2026-07-06": { "min": 2, "max": 3 } } },

  // rule 16. Key present for a (shift, date) => composition constraint applies there:
  // IF the shift is staffed at all that date, ≥1 assigned resident must be from this id list.
  // All exceptions (Wednesday day-shift exemption, Wellness-Wednesday substitution,
  // conference away carve-outs) are pre-applied: an exempt (s,d) simply has no entry,
  // a substitution day lists the substitute PGY's ids.
  "seniorPrimary": { "POD-D": { "2026-07-07": ["r_pgy3a", "r_pgy3b"] } },

  "jcDates": ["2026-07-07"],             // JC dates inside the block (rule 28 counting scope);
                                          // which shifts overlap 18-21h is derived from `shifts` timing
  "holidays": { "2026-07-04": "Independence Day" },  // rule 35 holiday counts; {} = feature off (strict no-op)

  // rule 42 pre-resolved bonus/penalty tuples. Positive bonus = prefer, negative = avoid.
  // Magnitudes are in the app's own preference scale; Python multiplies by the
  // dowPreference tier weight. Kept terms: traumaNightDow, pedNPgy1, jcNearCap, seniorScarcity.
  "preferences": [
    { "residentId": "r_x", "shiftId": "TRAUMA-N", "date": "2026-07-10", "bonus": 12, "tag": "traumaNightDow" }
  ],

  "rulePriority": ["coverageMin", "seniorComposition", "postNightRest"],  // orders the top soft tiers
  "settings": {
    "enforceRest": true,             // false → skip rule 17 (pairwise rest) ONLY; rules 18-23 always on
    "enforceWeekendOff": true        // false → drop rule 38 term
  },

  // ---- batch 2 (2026-08-22): all five OPTIONAL, all default to empty/zero,
  // every consuming term a documented no-op under that default. ----
  "traumaNightShiftIds": ["TRAUMA-N"],   // rule 43 (hard <=2/run) + 44 (soft 2nd-in-run) + 45 (soft mid-run)
  "pedsSplitInternIds": ["r_x"],         // rule 48: TRAUMA_PEDS/PEDS_TRAUMA interns getting the soft night-count push
  "pedsNightShiftIds": ["PED-N"],        // which shift ids count toward that push (rule 48)
  "pedsInternNightTarget": 5,            // soft target per resident in pedsSplitInternIds (rule 48); 0/absent = off
  "alternationExemptDates": ["2026-07-31"],  // rule 46: dates where a 12h-conference-window boundary
                                             // falls -- duration-alternation penalty skipped for any
                                             // night pair touching one of these dates (calendar-forced mixing)

  // ---- round 2b: three OPTIONAL id lists, all default to empty, every
  // consuming term (solver/model/em_composition.py) a documented no-op
  // under that default. ----
  "emResidentIds": ["r_abc", "r_x"],     // rule 49: EM_HOME/EM_BAMC resident ids, any PGY --
                                          // podEmComposition/flexEmComposition's EM headcount
  "emPgy2ResidentIds": ["r_abc"],        // rule 50: EM Home PGY-2 ids -- podPgy2Fallback's per-
                                          // assignment cost when one works a POD shift
  "emPgy3ResidentIds": ["r_y"]           // rule 50: EM Home PGY-3 ids -- flexPgy3Fallback's mirror
                                          // per-assignment cost when one works a FLEX shift
}
```

## Response

```jsonc
{
  "version": 1,
  "engine": "cpsat",
  "status": "OPTIMAL" | "FEASIBLE" | "RELAXED" | "INFEASIBLE" | "ERROR",
    // RELAXED = pass 2 ran and produced a schedule.
    // INFEASIBLE only possible if even pass 2 fails (never-relax rules conflict, e.g.
    // locked cells vs eligibility) — client falls back to JS engine.
  "mode": "strict" | "relaxed",
  "schedule": { "r_abc": { "2026-07-06": "POD-D" } },   // assigned cells only; locked cells included
  "objective": 12345,
  "solveTimeMs": 8000,
  "seed": 42,                       // diagnostics only — FEASIBLE results are not byte-replayable

  "report": {                       // maps onto the app's existing generationReport fields
    "unfilled": [ { "dateStr": "2026-07-06", "shiftId": "POD-N", "shortBy": 1, "reason": "coverageShort" } ],
    "restCompromises": [ { "residentId": "r_x", "dateStr": "...", "shiftId": "...", "gapH": 18 } ],  // rule 34 hits
    "underTarget": [ { "residentId": "r_x", "assigned": 17, "target": 19 } ],
    "seniorGaps": []                // always [] in strict mode (rule 16 is hard); kept for shape compat
  },

  "feasibility": {                  // null in strict mode
    "mode": "relaxed",
    "violations": [
      {
        "rule": "restGap",          // registry id, see table below
        "ruleLabel": "Minimum rest between shifts",
        "tier": 1,
        "residentIds": ["r_x"], "dates": ["2026-07-11"], "shiftIds": ["POD-D"],
        "magnitude": "6h short of required 9h"   // template-rendered, deterministic
      }
    ],
    "conflicts": [ ["restGap:r_x", "coverageMin:POD-N:2026-07-11"] ],  // from SufficientAssumptionsForInfeasibility
    "recommendations": [
      { "id": "rec1", "rule": "coverageMin",
        "text": "Reduce POD-N minimum to 1 on 2026-07-11 (currently 2).",
        "verified": true }          // verified = a re-solve with only this change reached strict feasibility
    ]
  },

  "validation": {                   // independent post-solve re-check (solver/validate.py)
    "passed": true,
    "failures": []                  // strict mode: must be []. relaxed mode: must exactly equal
                                    // feasibility.violations (by rule+resident+date) or the service 500s.
  }
}
```

## Rule registry ids (report/`rule` field values)

| id | plan § | tier |
|---|---|---|
| `eligibility`, `dayOff`, `vacation`, `availability`, `locked`, `seniorComposition`, `coverageMax`, `traumaSolo`, `traumaRunCap` | 1–16, 25, 43 | never relax |
| `restGap` | 17 | 1 |
| `circadianPair`, `nightRunMax` | 18 | 1 |
| `consecutiveWork` | 19 | 1 |
| `postRun6Rest` | 20 | 1 |
| `hours320` | 21 | 1 |
| `nightCap` | 22 | 1 |
| `nightSegments` | 23 | 1 |
| `coverageMin` | 24 | 2 |
| `traumaCap` | 26 | 3 |
| `bamcWedNight` | 27 | 3 |
| `jcCap` | 28 | 3 |
| `pedsMixMax` | 29 | 3 |
| `traumaPedsSplit` | 30 | 3 |
| `targetCeiling` | 31 | 3 |
| soft: `targetDeficit`, `postNightRest`, `fairness`, `isolatedNight`, `workShape`, `weekendOff`, `pedsMixMin`, `fm1Peds`, `internPair`, `dowPreference`, `traumaSecondInRun`, `traumaMidRun`, `nightDurationAlternation`, `secondRestDay`, `pedsInternNightDeficit`, `podEmComposition`, `flexEmComposition`, `podPgy2Fallback`, `flexPgy3Fallback` | 33–42, 44–50 | objective |

`traumaRunCap` (rule 43, hard, never relax — `solver/model/trauma_runs.add_trauma_run_hard_cap`,
config-independent, no weight): at most 2 trauma nights (`traumaNightShiftIds`) per contiguous
night run. Never wrapped by pass-2 elastic relaxation, same posture as `seniorComposition` — it
therefore never appears in a `feasibility.violations` entry (only relaxable families do), and
`solver/validate.py`'s own `traumaRunCap` check is a second, independently-written opinion that
must find nothing in either pass, not a family that participates in the elastic mismatch guard.

`isolatedNight` (renamed from `nightShape` 2026-08-22, rule 36): batch 2 relaxed the night-run
shape penalty — runs of 2–6 nights now cost nothing; only an isolated single night (length exactly
1) still does. `traumaSecondInRun`/`traumaMidRun` (rule 44/45) penalize a 2nd trauma night in one
run and a trauma night strictly interior to a mixed run, respectively. `nightDurationAlternation`
(rule 46) penalizes alternating different-duration night shifts on adjacent dates within a run
(generalizes trauma-vs-other-duration mixing; also covers D12/N12 conference-window edges), exempt
for any date pair touching `alternationExemptDates`. `secondRestDay` (rule 47) penalizes working a
shift on the 2nd rest day after a night run of 3+ nights ends. `pedsInternNightDeficit` (rule 48)
is a soft max-equality push toward `pedsInternNightTarget` peds-night shifts
(`pedsNightShiftIds`) for every resident in `pedsSplitInternIds` — pushes TOWARD assignment, like
`targetDeficit`, not away from one.

`podEmComposition`/`flexEmComposition` (rule 49, round 2b, distinct from `seniorComposition`'s hard
PGY-CLASS requirement on the shift's first body): once a POD shift reaches 2 assigned bodies, or a
FLEX shift reaches 1, the shortfall between the area's required EM (`emResidentIds`) headcount and
the actual EM headcount is charged per (shift, date) — POD wants 2 EM at 2+ staffed (2-body: both
EM; 3-body: at least 2, third free to be off-service), FLEX wants ≥1 EM at any staffing. Zero below
that threshold regardless of who's assigned. `podPgy2Fallback`/`flexPgy3Fallback` (rule 50, round
2b, the soft-cost translation of the JS generator's `narrowForPgyGate` pool-restrict-with-fallback):
a flat per-assignment cost for every EM PGY-2 (`emPgy2ResidentIds`) placed on a POD shift, or EM
PGY-3 (`emPgy3ResidentIds`) placed on FLEX — no reification, just a weighted sum over the relevant
x-vars. Both rule families live in `solver/model/em_composition.py`.

## Objective tiers (high → low; integer weights derived at build time with ratchet separation)

1. `coverageMin` slack (elastic-always)
2. `targetDeficit` for `isEmCore` residents (export-blocking today)
3. `postNightRest` count  — tiers 1–3 reorder according to `rulePriority`
4. `targetDeficit` (non-core)
5. `fairness` (deficit 10 / holiday 8 / night 6 / weekend 4, cohort max−min, AY constants added)
6. `isolatedNight` (soft sequence: runs 2–6 free since batch 2, isolated single nights and 2nd
   segment penalized)
7. `workShape` (isolated 1-day runs, excess fragmentation beyond ceil(worked/6))
8. `weekendOff`, `pedsMixMin`, `fm1Peds`, `internPair`
9. `traumaSecondInRun`, `traumaMidRun`, `nightDurationAlternation`, `secondRestDay`,
   `pedsInternNightDeficit` (batch 2, 2026-08-22)
10. `podEmComposition`, `flexEmComposition`, `podPgy2Fallback`, `flexPgy3Fallback` (round 2b)
11. `dowPreference` (shipped tuples)

Pass-2 relaxation penalties sit **above** tier 1, themselves tiered: tier-1 rules (duty-hour)
≫ tier-2 (coverageMin strict mode) ≫ tier-3 (policy caps) ≫ all soft weights.

## Notes

- All CP-SAT coefficients are integers. Fractional app weights are scaled ×100 uniformly.
- Cross-midnight: shift end = date 00:00 + startH + durationH; may land next calendar day.
  One Python `timing.py` owns this math for every constraint family.
- `GET /health` → `{ "status": "ok", "ortools": "9.15" }`.
- Errors: HTTP 400 (schema), 422 (semantic, e.g. locked shift unknown), 500 (internal
  validation mismatch). Client treats any non-200 or timeout as "fall back to JS engine".
