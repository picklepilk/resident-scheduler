"""Rules 24-25: per-(shift, date) staffing minimum/maximum.

Min side depends on `config.coverageMinMode`:
- "elastic_always" (default, matches production JS-generator behavior --
  coverage-min is today's top-ranked *soft* rule, so a pass-1 solve should
  never go INFEASIBLE purely on a staffing shortage): a per-(shift,date)
  slack IntVar absorbs any shortfall; `objective.py` charges it at the
  tier-1 weight.
- "hard_then_elastic": pass-1 treats the minimum as a hard constraint (no
  slack). If that makes pass-1 INFEASIBLE, `solve.py` reports INFEASIBLE and
  leaves relaxation to the pass-2 seam -- this module does not implement
  pass 2.

Max side is a hard cap, with ONE deliberate exception mirroring the app's own
"under-target lift" policy (repairPass Phase 5 / `underTargetOverstaff` in
ResidentScheduler.jsx): a resident's target obligation beats ordinary soft
rules, and as a genuine last resort the app allows exceeding a shift's
coverage max by exactly 1 -- never TRAUMA (its max is separately hard-clamped
to 1 and its run cap is a hard rule that is "never relaxed", see
trauma_runs.py), never a shift whose max is already 0 that date (this also
naturally excludes every 12h id outside its own chief-defined window, same as
the JS side's own `cov.max <= 0` guard). Every other non-TRAUMA (shift,date)
with `max > 0` gets a 0/1 `overstaff` BoolVar folded into the hard `<=`,
charged by `objective.py` at `overstaffCoverage` -- a weight documented there
to sit strictly between every ordinary soft-rule weight and targetDeficit(Core),
so CP-SAT only reaches for it once every cheaper alternative is exhausted, and
always prefers spending it over leaving a resident under target.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from solver.io.payload import Payload
from solver.model.variables import VarStore


@dataclass
class CoverageResult:
    slacks: dict = field(default_factory=dict)  # (shiftId, date) -> IntVar, empty in hard mode
    overstaff: dict = field(default_factory=dict)  # (shiftId, date) -> BoolVar, only where max>0, non-TRAUMA, not a Peds night


def no_overstaff_shift(shift) -> bool:
    """True when `shift` may NEVER use the +1 last-resort overstaff allowance (see module
    docstring): TRAUMA, or any Peds night (PED-N/PED-N-FM/PED-N12) -- chief call 2026-09-26, mirrors
    repairPass Phase 5's overstaffFor guard in ResidentScheduler.jsx. Shared with
    `solver/validate.py`'s independent `_check_coverage_max` re-check so the two can't drift on which
    shifts are exempt from the allowance (pre-existing gap fixed 2026-09-27: validate.py used to fail
    on ANY overstaff, including the allowed +1)."""
    return shift.area == "TRAUMA" or (shift.area == "PED" and shift.type == "night")


def add_coverage_constraints(model, payload: Payload, store: VarStore, min_enforcement=None) -> CoverageResult:
    """`min_enforcement`, when given, is `(shift_id, date_str) -> BoolVar` --
    used ONLY on the "hard_then_elastic" strict branch below, where pass 2
    (solver/model/elastic.py) needs to be able to switch the minimum off at a
    penalty. In "elastic_always" mode this parameter is never consulted: the
    slack IntVar a few lines up already makes the minimum elastic, so there
    is nothing for an assumption literal to gate (see the plan's batch-2 spec
    -- coverageMin assumption wrapping is deliberately skipped in that mode).

    In "hard_then_elastic" mode, pass 1 (`min_enforcement is None`) stays
    GENUINELY hard -- no slack at all, so an unsatisfiable minimum still
    makes pass 1 INFEASIBLE and triggers pass 2, unchanged from before this
    module supported relaxation. Pass 2 (`min_enforcement` given) ALSO builds
    the same slack var elastic_always uses (registered in `result.slacks`,
    so it flows into objective.py's existing per-slack-unit tier-1 term for
    free) alongside the `ok`-gated hard constraint -- without that slack,
    once `ok` relaxes the minimum to "not required at all" there would be
    ZERO incentive left to staff the shift anywhere close to it (a single
    fixed relaxation penalty is paid either way), which produced a
    nonsensical "reduce minimum to 0" recommendation during development.
    """
    result = CoverageResult()
    elastic = payload.config.coverage_min_mode != "hard_then_elastic"

    for shift_id, by_date in payload.coverage.items():
        shift = payload.shifts[shift_id]
        no_overstaff = no_overstaff_shift(shift)
        for date_str, entry in by_date.items():
            assigned = store.x_sum_for_shift_date(shift_id, date_str)

            if entry.max > 0 and not no_overstaff:
                overstaff = model.new_bool_var(f"overstaff[{shift_id},{date_str}]")
                model.add(sum(assigned) <= entry.max + overstaff)
                result.overstaff[(shift_id, date_str)] = overstaff
            else:
                model.add(sum(assigned) <= entry.max)

            if entry.min <= 0:
                continue

            if elastic or min_enforcement is not None:
                slack = model.new_int_var(0, entry.min, f"cov_slack[{shift_id},{date_str}]")
                model.add(sum(assigned) + slack >= entry.min)
                result.slacks[(shift_id, date_str)] = slack

            if not elastic:
                c = model.add(sum(assigned) >= entry.min)
                if min_enforcement is not None:
                    c.only_enforce_if(min_enforcement(shift_id, date_str))

    return result
