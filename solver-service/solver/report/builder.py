"""Assembles `feasibility.violations`/`recommendations` from a solved
elastic model. Deterministic and table-driven throughout (see templates.py):
every violation's `magnitude` is recomputed by directly re-inspecting the
concrete solved `schedule` (coverage) or by reusing solver/validate.py's own
independently-written checkers (duty-hour / policy-cap rules) -- never a
second, possibly-drifting reimplementation of "how short/over is this".

Verification re-solves (`build_recommendations`) apply ONE single-payload
edit at a time to a python-object copy of the payload (via `payload_to_raw`,
which round-trips a typed `Payload` back through `parse_payload` -- no JSON
serialization needed, `parse_payload`'s `_parse_*` helpers accept any
iterable) and re-run PASS 1 (strict) with a reduced time cap. Only
coverageMin and simple scalar-cap recommendations get this treatment (the
plan calls out "raise one cap, lower one coverage min" specifically);
restGap/circadian and traumaPedsSplit recommendations stay unverified
"candidate" text -- there is no single scalar payload field that safely
encodes "give this resident a day off" without touching eligibility shape.
"""

from __future__ import annotations

import copy
import dataclasses

from solver.io.payload import Payload, PayloadError, Resident, parse_payload
from solver.model import timing
from solver.model.elastic import DUTY_HOUR_FAMILIES, POLICY_CAP_FAMILIES, ElasticBuildResult
from solver.report import templates

MAX_VERIFY_TIME_SECONDS = 10.0


# ---------------------------------------------------------------------------
# violations
# ---------------------------------------------------------------------------

def build_violations(payload: Payload, schedule: dict, elastic: ElasticBuildResult, solver, failures: list) -> list:
    failures_by_key = _index_failures(failures)
    violations = []

    for (family, resident_id), lit in elastic.duty_pool.lits.items():
        if solver.value(lit) == 1:
            continue
        violations.append(_violation_from_group(family, resident_id, failures_by_key.get((family, resident_id), [])))

    for (family, resident_id), lit in elastic.cap_pool.lits.items():
        if solver.value(lit) == 1:
            continue
        violations.append(_violation_from_group(family, resident_id, failures_by_key.get((family, resident_id), [])))

    violations.extend(_coverage_violations(payload, schedule))
    return violations


def _index_failures(failures: list) -> dict:
    """(rule, residentId) -> list[failure dict], as produced by
    solver/validate.py -- ONE failure can index under multiple resident ids
    (a pairwise rule's failure lists both residentIds only when they're the
    same resident, which is always true for these per-resident families, so
    in practice this is a 1:1 index; written generically anyway)."""
    out = {}
    for f in failures:
        for rid in f.get("residentIds", []):
            out.setdefault((f["rule"], rid), []).append(f)
    return out


def _violation_from_group(rule: str, resident_id: str, group_failures: list) -> dict:
    meta = templates.RULE_META[rule]
    if group_failures:
        dates = sorted({d for f in group_failures for d in f.get("dates", [])})
        shift_ids = sorted({s for f in group_failures for s in f.get("shiftIds", [])})
        first_detail = group_failures[0]["detail"]
        extra = len(group_failures) - 1
        magnitude = first_detail + (templates.MAGNITUDE_EXTRA_SUFFIX.format(extra=extra) if extra > 0 else "")
    else:
        dates, shift_ids, magnitude = [], [], templates.MAGNITUDE_FALLBACK
    return {
        "rule": rule,
        "ruleLabel": meta["label"],
        "tier": meta["tier"],
        "residentIds": [resident_id],
        "dates": dates,
        "shiftIds": shift_ids,
        "magnitude": magnitude,
    }


def _coverage_violations(payload: Payload, schedule: dict) -> list:
    """Recomputed directly from the concrete schedule vs. `payload.coverage`
    -- works identically in BOTH coverageMinMode branches (elastic_always's
    slack vars and hard_then_elastic's `ok` literals both just decide
    whether the solver COULD leave a shortfall; this function only cares
    whether it actually did)."""
    counts: dict = {}
    for _rid, by_date in schedule.items():
        for d, sid in by_date.items():
            counts[(sid, d)] = counts.get((sid, d), 0) + 1

    meta = templates.RULE_META["coverageMin"]
    out = []
    for shift_id, by_date in payload.coverage.items():
        for date_str, entry in by_date.items():
            assigned = counts.get((shift_id, date_str), 0)
            if assigned >= entry.min:
                continue
            short = entry.min - assigned
            out.append(
                {
                    "rule": "coverageMin",
                    "ruleLabel": meta["label"],
                    "tier": meta["tier"],
                    "residentIds": [],
                    "dates": [date_str],
                    "shiftIds": [shift_id],
                    "magnitude": templates.COVERAGE_MAGNITUDE_TEMPLATE.format(
                        short=short, min=entry.min, assigned=assigned
                    ),
                }
            )
    return out


# ---------------------------------------------------------------------------
# recommendations
# ---------------------------------------------------------------------------

def build_recommendations(payload: Payload, schedule: dict, violations: list, max_resolves: int) -> list:
    candidates = []
    for v in violations:
        rule = v["rule"]
        if rule == "coverageMin":
            cand = _coverage_recommendation(payload, schedule, v)
        elif rule in templates.CAP_JSON_FIELD or rule == "targetCeiling":
            cand = _cap_recommendation(payload, schedule, v)
        elif rule in DUTY_HOUR_FAMILIES:
            cand = _duty_recommendation(v)
        else:
            cand = _generic_recommendation(v)
        if cand is not None:
            candidates.append(cand)

    resolves_used = 0
    out = []
    for cand in candidates:
        edit = cand.pop("edit", None)
        if edit is not None and resolves_used < max_resolves:
            resolves_used += 1
            cand["verified"] = _verify_single_edit(payload, edit)
        else:
            cand["verified"] = False
        out.append(cand)
    return out


def _coverage_recommendation(payload: Payload, schedule: dict, v: dict):
    if not v["shiftIds"] or not v["dates"]:
        return None
    shift_id, date_str = v["shiftIds"][0], v["dates"][0]
    entry = payload.coverage.get(shift_id, {}).get(date_str)
    if entry is None:
        return None
    assigned = sum(1 for by_date in schedule.values() if by_date.get(date_str) == shift_id)
    if assigned >= entry.min:
        return None

    text = templates.COVERAGE_REDUCE_TEMPLATE.format(shift=shift_id, new_min=assigned, date=date_str, current_min=entry.min)
    headroom = _residents_with_headroom(payload, schedule, shift_id, date_str)
    if headroom:
        text += templates.COVERAGE_HEADROOM_TEMPLATE.format(names=", ".join(headroom))
    # else: a genuinely conflicting-absence shortfall (nobody eligible has
    # headroom) -- stay honest and recommend the coverage/staffing change
    # only, per the plan's "relaxing nothing helps" case.

    def edit(raw, sid=shift_id, d=date_str, nv=assigned):
        return _apply_coverage_min_edit(raw, sid, d, nv)

    return {"id": f"rec_coverageMin_{shift_id}_{date_str}", "rule": "coverageMin", "text": text, "edit": edit}


def _residents_with_headroom(payload: Payload, schedule: dict, shift_id: str, date_str: str) -> list:
    out = []
    for r in payload.residents:
        if not payload.is_eligible(r.id, date_str, shift_id):
            continue
        if schedule.get(r.id, {}).get(date_str):
            continue  # already working that day
        if r.target is None:
            continue
        assigned_total = len(schedule.get(r.id, {}))
        if assigned_total < r.target:
            out.append(r.id)
    return sorted(out)[:3]


def _cap_recommendation(payload: Payload, schedule: dict, v: dict):
    if not v["residentIds"]:
        return None
    resident_id = v["residentIds"][0]
    rule = v["rule"]
    resident = payload.resident(resident_id)
    assigned = _assigned_count_for_cap(payload, schedule, resident_id, rule)
    if assigned is None:
        return None

    if rule == "targetCeiling":
        current = resident.target
        if current is None or assigned <= current:
            return None
        text = templates.TARGET_RAISE_TEMPLATE.format(resident=resident_id, current=current, new_value=assigned)

        def edit(raw, rid=resident_id, nv=assigned):
            return _apply_target_edit(raw, rid, nv)

    else:
        attr = templates.CAP_ATTR[rule]
        current = getattr(resident.caps, attr)
        if current is None or assigned <= current:
            return None
        json_field = templates.CAP_JSON_FIELD[rule]
        cap_label = templates.RULE_META[rule]["label"].lower()
        text = templates.CAP_RAISE_TEMPLATE.format(resident=resident_id, cap_label=cap_label, current=current, new_value=assigned)

        def edit(raw, rid=resident_id, f=json_field, nv=assigned):
            return _apply_cap_edit(raw, rid, f, nv)

    return {"id": f"rec_{rule}_{resident_id}", "rule": rule, "text": text, "edit": edit}


def _assigned_count_for_cap(payload: Payload, schedule: dict, resident_id: str, rule: str):
    """Table-driven per-rule count of the concrete final schedule -- mirrors
    count_caps.py's `CapSpec` predicates, but against a fixed schedule dict
    rather than model x-vars (there is no model left to query once solving
    is done)."""
    by_date = schedule.get(resident_id, {})

    def count(shift_pred, date_pred=lambda d: True):
        return sum(1 for d, sid in by_date.items() if sid in payload.shifts and date_pred(d) and shift_pred(sid))

    if rule == "traumaCap":
        return count(lambda sid: payload.shifts[sid].area == "TRAUMA")
    if rule == "jcCap":
        return count(
            lambda sid: timing.overlaps_hour_window(payload.shifts[sid], 18, 21),
            lambda d: d in payload.jc_dates,
        )
    if rule == "bamcWedNight":
        return count(lambda sid: payload.shifts[sid].is_night, lambda d: timing.parse_date(d).weekday() == 2)
    if rule == "pedsMixMax":
        return count(lambda sid: payload.shifts[sid].area == "PED")
    if rule == "targetCeiling":
        return len(by_date)
    return None


def _duty_recommendation(v: dict):
    if not v["residentIds"]:
        return None
    resident_id = v["residentIds"][0]
    rule_label = v["ruleLabel"]
    if v["dates"]:
        shifts = ", ".join(v["shiftIds"]) if v["shiftIds"] else "conflicting"
        text = templates.DUTY_HOUR_WITH_DATE_TEMPLATE.format(
            resident=resident_id, date=v["dates"][0], shifts=shifts, rule_label=rule_label
        )
    else:
        text = templates.DUTY_HOUR_NO_DATE_TEMPLATE.format(resident=resident_id, rule_label=rule_label)
    return {"id": f"rec_{v['rule']}_{resident_id}", "rule": v["rule"], "text": text, "edit": None}


def _generic_recommendation(v: dict):
    resident_id = v["residentIds"][0] if v["residentIds"] else None
    subject = f"resident {resident_id}" if resident_id else "the flagged shift"
    text = templates.GENERIC_TEMPLATE.format(subject=subject, rule_label=v["ruleLabel"])
    return {"id": f"rec_{v['rule']}_{resident_id or 'na'}", "rule": v["rule"], "text": text, "edit": None}


# ---------------------------------------------------------------------------
# verification re-solves
# ---------------------------------------------------------------------------

def _verify_single_edit(payload: Payload, edit_fn) -> bool:
    raw = payload_to_raw(payload)
    edited_raw = edit_fn(raw)
    try:
        edited_payload = parse_payload(edited_raw)
    except PayloadError:
        return False

    capped = min(MAX_VERIFY_TIME_SECONDS, payload.config.max_time_seconds)
    edited_payload.config = dataclasses.replace(edited_payload.config, max_time_seconds=capped)

    from solver import solve as solve_module  # deferred: solve.py imports this module for pass-2 reporting

    result = solve_module._solve_pass1(edited_payload)
    return result.status in ("OPTIMAL", "FEASIBLE")


def _apply_coverage_min_edit(raw: dict, shift_id: str, date_str: str, new_min: int) -> dict:
    edited = copy.deepcopy(raw)
    edited["coverage"][shift_id][date_str]["min"] = new_min
    return edited


def _apply_cap_edit(raw: dict, resident_id: str, json_field: str, new_value: int) -> dict:
    edited = copy.deepcopy(raw)
    for r in edited["residents"]:
        if r["id"] == resident_id:
            r["caps"][json_field] = new_value
            break
    return edited


def _apply_target_edit(raw: dict, resident_id: str, new_target: int) -> dict:
    edited = copy.deepcopy(raw)
    for r in edited["residents"]:
        if r["id"] == resident_id:
            r["target"] = new_target
            break
    return edited


# ---------------------------------------------------------------------------
# top-level report + raw round-trip
# ---------------------------------------------------------------------------

def build_feasibility_report(payload: Payload, schedule: dict, elastic: ElasticBuildResult, solver, failures: list, conflicts: list, max_resolves: int) -> dict:
    violations = build_violations(payload, schedule, elastic, solver, failures)
    recommendations = build_recommendations(payload, schedule, violations, max_resolves)
    return {"mode": "relaxed", "violations": violations, "conflicts": conflicts, "recommendations": recommendations}


def payload_to_raw(payload: Payload) -> dict:
    """Reconstructs a `parse_payload`-consumable python dict from a typed
    Payload -- no JSON round-trip needed, since every `_parse_*` helper in
    solver/io/payload.py just iterates whatever container it's given (dict,
    list, set all work). Used ONLY by verification re-solves to build an
    edited copy of the original request.
    """
    return {
        "version": payload.version,
        "config": {
            "maxTimeSeconds": payload.config.max_time_seconds,
            "numWorkers": payload.config.num_workers,
            "randomSeed": payload.config.random_seed,
            "coverageMinMode": payload.config.coverage_min_mode,
            "maxVerificationResolves": payload.config.max_verification_resolves,
            "weights": payload.config.weights,
        },
        "block": {"startDate": payload.block.start_date, "endDate": payload.block.end_date, "dates": list(payload.block.dates)},
        "shifts": {
            sid: {"startH": s.start_h, "durationH": s.duration_h, "type": s.type, "area": s.area}
            for sid, s in payload.shifts.items()
        },
        "residents": [_resident_to_raw(r) for r in payload.residents],
        "eligible": {rid: {d: list(sids) for d, sids in by_date.items()} for rid, by_date in payload.eligible.items()},
        "obligations": {rid: list(dates) for rid, dates in payload.obligations.items()},
        "locked": [{"residentId": lc.resident_id, "date": lc.date, "shiftId": lc.shift_id} for lc in payload.locked],
        "coverage": {
            sid: {d: {"min": e.min, "max": e.max} for d, e in by_date.items()} for sid, by_date in payload.coverage.items()
        },
        "seniorPrimary": payload.senior_primary,
        "jcDates": list(payload.jc_dates),
        "holidays": dict(payload.holidays),
        "preferences": [
            {"residentId": p.resident_id, "shiftId": p.shift_id, "date": p.date, "bonus": p.bonus, "tag": p.tag}
            for p in payload.preferences
        ],
        "rulePriority": list(payload.rule_priority),
        "settings": {"enforceRest": payload.settings.enforce_rest, "enforceWeekendOff": payload.settings.enforce_weekend_off},
    }


def _resident_to_raw(r: Resident) -> dict:
    tps = None
    if r.trauma_peds_split is not None:
        tps = {
            "traumaDates": list(r.trauma_peds_split.trauma_dates),
            "pedsDates": list(r.trauma_peds_split.peds_dates),
            "traumaCap": r.trauma_peds_split.trauma_cap,
            "pedsCap": r.trauma_peds_split.peds_cap,
        }
    return {
        "id": r.id,
        "cohort": r.cohort,
        "target": r.target,
        "isEmCore": r.is_em_core,
        "isIntern": r.is_intern,
        "nightExempt": r.night_exempt,
        "caps": {
            "nights": r.caps.nights,
            "trauma": r.caps.trauma,
            "jcRemaining": r.caps.jc_remaining,
            "bamcWedNights": r.caps.bamc_wed_nights,
            "pedsMixMax": r.caps.peds_mix_max,
            "pedsMixMin": r.caps.peds_mix_min,
            "fm1PedsMax": r.caps.fm1_peds_max,
        },
        "traumaPedsSplit": tps,
        "priorTail": dict(r.prior_tail),
        "priorTailObligations": list(r.prior_tail_obligations),
        "priorTailHours": r.prior_tail_hours,
        "ayPrior": {"nights": r.ay_prior.nights, "weekends": r.ay_prior.weekends, "holidays": r.ay_prior.holidays},
    }


# All relaxable rule ids -- used by solve.py's mismatch guard to decide
# which validate.py failures MUST correspond 1:1 to a feasibility violation
# (coverageMin is deliberately excluded: validate.py never checks it, since
# it's the pre-existing soft/elastic rule 24, not a hard rule).
HARD_RELAXABLE_RULES = frozenset({*DUTY_HOUR_FAMILIES, *POLICY_CAP_FAMILIES})
