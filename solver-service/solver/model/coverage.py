"""Rules 24-25: per-(shift, date) staffing minimum/maximum.

Max side is always a hard cap. Min side depends on `config.coverageMinMode`:
- "elastic_always" (default, matches production JS-generator behavior --
  coverage-min is today's top-ranked *soft* rule, so a pass-1 solve should
  never go INFEASIBLE purely on a staffing shortage): a per-(shift,date)
  slack IntVar absorbs any shortfall; `objective.py` charges it at the
  tier-1 weight.
- "hard_then_elastic": pass-1 treats the minimum as a hard constraint (no
  slack). If that makes pass-1 INFEASIBLE, `solve.py` reports INFEASIBLE and
  leaves relaxation to the pass-2 seam -- this module does not implement
  pass 2.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from solver.io.payload import Payload
from solver.model.variables import VarStore


@dataclass
class CoverageResult:
    slacks: dict = field(default_factory=dict)  # (shiftId, date) -> IntVar, empty in hard mode


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
        for date_str, entry in by_date.items():
            assigned = store.x_sum_for_shift_date(shift_id, date_str)

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
