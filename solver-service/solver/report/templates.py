"""Deterministic, table-driven strings for the feasibility report. NO free
text generation anywhere in this module or in report/builder.py -- every
string returned to a client is either a fixed constant or a plain
`str.format(...)` fill of one of the templates below, using numbers
recomputed from the concrete solved schedule (see builder.py).

`RULE_META` is the single source of truth for `ruleLabel`/`tier` on a
`feasibility.violations` entry -- mirrors docs/PAYLOAD_SCHEMA.md's rule
registry table exactly (relaxable rules 17-31 only; never-relax rules never
appear in a violation since they're never wrapped by elastic.py).
"""

from __future__ import annotations

RULE_META = {
    # tier 1 -- duty-hour / safety
    "restGap": {"label": "Minimum rest between shifts", "tier": 1},
    "circadianPair": {"label": "Circadian shift-type adjacency", "tier": 1},
    "nightRunMax": {"label": "Maximum consecutive night shifts", "tier": 1},
    "consecutiveWork": {"label": "Maximum consecutive work days", "tier": 1},
    "postRun6Rest": {"label": "Rest after a completed 6-day work run", "tier": 1},
    "hours320": {"label": "Rolling 320-hour (28-day) cap", "tier": 1},
    "nightCap": {"label": "Nights-per-block cap", "tier": 1},
    "nightSegments": {"label": "Night-run segments per block", "tier": 1},
    # tier 2 -- coverage
    "coverageMin": {"label": "Minimum shift coverage", "tier": 2},
    # tier 3 -- policy caps
    "traumaCap": {"label": "Trauma shift cap", "tier": 3},
    "bamcWedNight": {"label": "BAMC Wednesday-night cap", "tier": 3},
    "jcCap": {"label": "Journal Club yearly cap", "tier": 3},
    "pedsMixMax": {"label": "Peds/EM mix cap", "tier": 3},
    "traumaPedsSplit": {"label": "Trauma/Peds split sub-cap", "tier": 3},
    "targetCeiling": {"label": "Shift-count target ceiling", "tier": 3},
}

# rule -> the raw JSON field name on a resident's `caps` object, for a
# single-payload-edit recommendation ("raise one cap"). traumaPedsSplit is
# deliberately absent -- it's two sub-caps, not one scalar, so no safe
# single-field edit exists for it (see builder.py's `_cap_recommendation`).
CAP_JSON_FIELD = {
    "traumaCap": "trauma",
    "bamcWedNight": "bamcWedNights",
    "jcCap": "jcRemaining",
    "pedsMixMax": "pedsMixMax",
}

# rule -> the ResidentCaps dataclass attribute name (snake_case), for
# reading the CURRENT cap value off a parsed Payload.
CAP_ATTR = {
    "traumaCap": "trauma",
    "bamcWedNight": "bamc_wed_nights",
    "jcCap": "jc_remaining",
    "pedsMixMax": "peds_mix_max",
}

COVERAGE_REDUCE_TEMPLATE = "Reduce {shift} minimum to {new_min} on {date} (currently {current_min})."
COVERAGE_HEADROOM_TEMPLATE = " Eligible resident(s) with remaining target headroom that day: {names}."
CAP_RAISE_TEMPLATE = "Raise resident {resident}'s {cap_label} from {current} to {new_value}."
TARGET_RAISE_TEMPLATE = "Raise resident {resident}'s shift-count target from {current} to {new_value}."
DUTY_HOUR_WITH_DATE_TEMPLATE = (
    "Give resident {resident} a day off on {date}, or move the {shifts} assignment, to resolve {rule_label}."
)
DUTY_HOUR_NO_DATE_TEMPLATE = "Review resident {resident}'s schedule to resolve the {rule_label} violation."
GENERIC_TEMPLATE = "Review {subject}'s {rule_label} -- no single-field payload edit is available; adjust manually."

MAGNITUDE_FALLBACK = "relaxed by the solver; independent re-check found no residual detail"
MAGNITUDE_EXTRA_SUFFIX = " (+{extra} more)"
COVERAGE_MAGNITUDE_TEMPLATE = "{short} short of minimum {min} ({assigned} assigned)"
