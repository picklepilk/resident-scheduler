"""R7 (2026-09-27, chief policy 2026-09-26, memory acgme-em-work-hours): ACGME EM Program
Requirements 6.17.a.3 -- no more than 60 SCHEDULED ED hours, and no more than 72 TOTAL hours (ED +
Grand Rounds + Journal Club), in ANY rolling 7-day window. Applies only to EM residents (EM_HOME/
EM_BAMC) on a schedulable EM rotation -- exactly `resident.is_em_core and resident.target is not
None`, mirroring candidatePool's own `isEmResident(r) && isSchedulable(r)` gate in
ResidentScheduler.jsx (a non-schedulable resident already gets `target: null` there for unrelated
reasons -- see buildSolverPayload's own comment on that field). Off-service residents keep only the
80h/4wk rule (solver/model/hours_cap.py).

ALWAYS HARD, never wrapped by pass-2 relaxation (solver/model/elastic.py) -- called identically from
build.py and elastic.py with no `enforcement` parameter, exactly like senior_composition.py and
trauma_runs.py's `add_trauma_run_hard_cap`. This is an accreditation requirement (tier 'acgme' in
src/lib/rulePolicy.js: `edWeekly60`/`totalWeekly72`), stricter than the ordinary duty-hour families
in hours_cap.py/rest.py/circadian.py/workday_limits.py that the chief has accepted as pass-2-
relaxable last resorts -- 6.17.a.3 is not one of those.

ED hours: a plain constant for a tail date (`prior_tail`'s recorded shift duration), or
`sum(duration_h * x[r,s,d])` for an in-block date -- the at-most-one-shift-per-day constraint already
keeps that sum in {0, duration_h} for any single date, so no extra reification is needed. Grand
Rounds/Journal Club hours are calendar facts independent of the solve -- already resolved by the JS
side (grHoursOn/jcHoursOn) into `resident.obligation_hours[date]`, a plain int for both tail and block
dates, added on top of the ED term for the TOTAL cap only (never the ED cap itself).
"""

from __future__ import annotations

from solver.io.payload import Payload
from solver.model.variables import VarStore

WINDOW_DAYS = 7
ED_CAP_H = 60
TOTAL_CAP_H = 72


def _ed_term_for_position(payload: Payload, store: VarStore, resident, idx: int):
    date_str = payload.all_dates[idx]
    if idx < len(payload.tail_dates):
        shift_id = resident.prior_tail.get(date_str)
        return payload.shifts[shift_id].duration_h if shift_id in payload.shifts else 0
    terms = [
        payload.shifts[shift_id].duration_h * var
        for shift_id, var in store.by_resident_date.get((resident.id, date_str), [])
    ]
    return sum(terms) if terms else 0


def _in_scope(resident) -> bool:
    return resident.is_em_core and resident.target is not None


def add_weekly_hours_cap_constraints(model, payload: Payload, store: VarStore) -> None:
    n = len(payload.all_dates)
    tail_len = len(payload.tail_dates)
    for resident in payload.residents:
        if not _in_scope(resident):
            continue
        ed_terms = [_ed_term_for_position(payload, store, resident, i) for i in range(n)]
        obl_terms = [resident.obligation_hours.get(payload.all_dates[i], 0) for i in range(n)]
        for start in range(0, n - WINDOW_DAYS + 1):
            end = start + WINDOW_DAYS  # exclusive
            if end <= tail_len:
                continue  # window entirely inside the tail -- constants only, nothing to constrain
            ed_sum = sum(ed_terms[start:end])
            obl_sum = sum(obl_terms[start:end])
            model.add(ed_sum <= ED_CAP_H)
            model.add(ed_sum + obl_sum <= TOTAL_CAP_H)
